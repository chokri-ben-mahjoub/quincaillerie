import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { dataDir, getDb } from '../db'
import type { BackupConfig, BackupInfo, Result } from '@shared/types'

// Nom de fichier autorisé : empêche toute sortie du dossier de sauvegarde (../).
const FILE_RE = /^quincaillerie-\d{8}-\d{6}\.db$/
const DAY_MS = 24 * 3600 * 1000

const getSetting = (key: string): string | null =>
  (getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as any)?.value ?? null
const setSetting = (key: string, value: string): void => {
  getDb().prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

function backupDir(): string {
  const dir = getSetting('backup_dir') || join(dataDir(), 'backups')
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

/** Copie à chaud (compatible WAL) de la base, puis supprime les plus anciennes sauvegardes. */
export async function runBackup(): Promise<string> {
  const name = `quincaillerie-${stamp()}.db`
  await getDb().backup(join(backupDir(), name))
  setSetting('backup_last', new Date().toISOString())

  const keep = Math.max(parseInt(getSetting('backup_keep') ?? '14', 10) || 14, 1)
  for (const old of listBackups().slice(keep)) unlinkSync(join(backupDir(), old.name))
  return name
}

/** Sauvegarde automatique : au démarrage puis toutes les 30 min, si la dernière date de plus de 24 h. */
export function startBackupScheduler(): void {
  const check = async () => {
    try {
      const last = getSetting('backup_last')
      if (!last || Date.now() - new Date(last).getTime() > DAY_MS) await runBackup()
    } catch (err) {
      console.error('Sauvegarde automatique échouée :', err)
    }
  }
  setTimeout(check, 5000)
  setInterval(check, 30 * 60 * 1000)
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
  handle('backup:config', (): BackupConfig => ({
    dir: backupDir(), keep: parseInt(getSetting('backup_keep') ?? '14', 10) || 14, last: getSetting('backup_last')
  }))
  handle('backup:setKeep', (keep: number) => setSetting('backup_keep', String(Math.min(Math.max(Math.round(keep), 1), 365))))
  handle('backup:now', () => runBackup())
  handle('backup:restore', (name: string) => restore(name))
  handle('backup:chooseDir', async (e: any) => {
    const win = BrowserWindow.getAllWindows()[0]
    const r = await dialog.showOpenDialog(win, { title: 'Dossier de sauvegarde', properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled) return null
    setSetting('backup_dir', r.filePaths[0])
    return r.filePaths[0]
  })
}
