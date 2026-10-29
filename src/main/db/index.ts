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
