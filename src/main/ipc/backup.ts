import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { dataDir, getDb } from '../db'
import { getSettings } from '../settings'
import type { BackupConfig, BackupInfo, Result } from '@shared/types'

// Nom de fichier autorisé : empêche toute sortie du dossier de sauvegarde (../).
const FILE_RE = /^quincaillerie-\d{8}-\d{6}\.db$/

// Date de la dernière sauvegarde : valeur interne, hors du registre des paramètres.
const getLast = (): string | null => (getDb().prepare(`SELECT value FROM settings WHERE key = 'backup_last'`).get() as any)?.value ?? null
const setLast = (iso: string): void => {
  getDb().prepare(`INSERT INTO settings(key, value) VALUES ('backup_last', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(iso)
}

/** Dossier de sauvegarde (Paramètres > Sauvegarde), ou « backups » dans les données de l'application. */
function backupDir(): string {
  const dir = getSettings().backup_dir || join(dataDir(), 'backups')
  mkdirSync(dir, { recursive: true })
  return dir
}

function listBackups(): BackupInfo[] {
  const dir = backupDir()
  return readdirSync(dir)
    .filter((f) => FILE_RE.test(f))
    .map((name) => { const st = statSync(join(dir, name)); return { name, size: st.size, createdAt: st.mtime.toISOString() } })
    .sort((a, b) => b.name.localeCompare(a.name))
}

const stamp = (): string => {
  const d = new Date(), p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** Copie à chaud (compatible WAL) de la base, puis supprime les plus anciennes sauvegardes (au-delà du nombre conservé). */
export async function runBackup(): Promise<string> {
  const name = `quincaillerie-${stamp()}.db`
  await getDb().backup(join(backupDir(), name))
  setLast(new Date().toISOString())
  for (const old of listBackups().slice(Number(getSettings().backup_keep))) unlinkSync(join(backupDir(), old.name))
  return name
}

const FREQUENCY_MS: Record<string, number> = { '6h': 6 * 3600e3, '12h': 12 * 3600e3, daily: 24 * 3600e3, weekly: 7 * 24 * 3600e3 }

/** Une sauvegarde automatique est-elle due ? (« off » : jamais ; jamais sauvegardé : oui). */
export function isBackupDue(frequency: string, lastIso: string | null, now = Date.now()): boolean {
  const ms = FREQUENCY_MS[frequency]
  if (!ms) return false
  return !lastIso || now - new Date(lastIso).getTime() >= ms
}

/** Planificateur : contrôle au démarrage puis toutes les 10 min, en relisant les paramètres à chaque fois. + sauvegarde à la fermeture si activée. */
export function startBackupScheduler(): void {
  const check = async () => {
    try {
      if (isBackupDue(getSettings().backup_frequency, getLast())) await runBackup()
    } catch (err) {
      console.error('Sauvegarde automatique échouée :', err)
    }
  }
  setTimeout(check, 5000)
  setInterval(check, 10 * 60 * 1000)

  let quitting = false
  app.on('before-quit', (e) => {
    if (quitting || getSettings().backup_on_quit !== '1') return
    e.preventDefault() // on attend la fin de la sauvegarde, puis on quitte pour de bon
    quitting = true
    runBackup().catch((err) => console.error('Sauvegarde à la fermeture échouée :', err)).finally(() => app.quit())
  })
}

/**
 * Restauration : la base est ouverte, on ne peut pas l'écraser à chaud.
 * On dépose le fichier choisi en "restore.pending" puis on relance ; initDatabase() fait l'échange au démarrage.
 */
async function restore(name: string): Promise<void> {
  if (!FILE_RE.test(name)) throw new Error('Nom de sauvegarde invalide.')
  const src = join(backupDir(), name)
  if (!existsSync(src)) throw new Error('Sauvegarde introuvable.')
  await runBackup() // filet de sécurité : l'état actuel est sauvegardé avant d'être remplacé
  copyFileSync(src, join(dataDir(), 'restore.pending'))
  app.relaunch()
  app.exit(0)
}

export function registerBackupHandlers(): void {
  const handle = <T,>(channel: string, fn: (...a: any[]) => T | Promise<T>) =>
    ipcMain.handle(channel, async (_e, ...args): Promise<Result<T>> => {
      try {
        return { ok: true, data: await fn(...args) }
      } catch (err: any) {
        return { ok: false, error: String(err?.message ?? err) }
      }
    })

  handle('backup:list', () => listBackups())
  handle('backup:config', (): BackupConfig => ({ dir: backupDir(), keep: Number(getSettings().backup_keep), last: getLast() }))
  handle('backup:now', () => runBackup())
  handle('backup:restore', (name: string) => restore(name))
  // Choix du dossier : renvoie le chemin sans l'enregistrer (il passe par la barre « Enregistrer » des Paramètres).
  handle('backup:pickDir', async () => {
    const r = await dialog.showOpenDialog(BrowserWindow.getAllWindows()[0], { title: 'Dossier de sauvegarde', properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
}
