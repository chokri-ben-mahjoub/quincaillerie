import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, renameSync, unlinkSync } from 'fs'
import { MIGRATIONS } from './schema'

let db: Database.Database

/** Dossier de données : %APPDATA%/quincaillerie (la base y est créée au premier lancement). */
export const dataDir = (): string => app.getPath('userData')

export function getDb(): Database.Database {
  return db
}

/**
 * Remet la base à l'état d'une première installation (nouveau fichier, schéma complet, catégories par défaut).
 * Les paramètres et/ou les comptes utilisateurs peuvent être conservés.
 */
export function resetDatabase(keep: { settings: boolean; users: boolean }): void {
  const settings = keep.settings ? (db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]) : []
  const users = keep.users ? (db.prepare('SELECT * FROM users').all() as Record<string, unknown>[]) : []
  const file = join(dataDir(), 'quincaillerie.db')
  db.close()
  for (const ext of ['', '-wal', '-shm']) if (existsSync(file + ext)) unlinkSync(file + ext)
  initDatabase()
  const putSetting = db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  const putUser = db.prepare('INSERT INTO users(id, username, full_name, password_hash, role, active, created_at) VALUES (@id, @username, @full_name, @password_hash, @role, @active, @created_at)')
  db.transaction(() => {
    for (const s of settings) putSetting.run(s.key, s.value)
    for (const u of users) putUser.run(u)
  })()
}

/** Ouvre la base (la crée si absente) puis applique les migrations manquantes. */
export function initDatabase(): void {
  const file = join(dataDir(), 'quincaillerie.db')
  // Restauration demandée avant le redémarrage : on remplace la base (et ses fichiers WAL) avant de l'ouvrir.
  const pending = join(dataDir(), 'restore.pending')
  if (existsSync(pending)) {
    for (const ext of ['-wal', '-shm']) if (existsSync(file + ext)) unlinkSync(file + ext)
    renameSync(pending, file)
  }
  db = new Database(file)
  db.pragma('journal_mode = WAL') // lecture/écriture plus robustes
  db.pragma('foreign_keys = ON') // respecte les clés étrangères

  // user_version = nombre de migrations déjà appliquées.
  const current = db.pragma('user_version', { simple: true }) as number
  for (let v = current; v < MIGRATIONS.length; v++) {
    // Chaque migration est atomique : tout passe ou rien.
    db.transaction(() => {
      db.exec(MIGRATIONS[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}
