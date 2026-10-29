import { ipcMain } from 'electron'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { getDb } from '../db'
import { getSettings } from '../settings'
import { channelGranted } from '@shared/permissions'
import type { AuthStatus, Result, Role, User, UserInput } from '@shared/types'

// Utilisateur connecté (session tenue côté principal : l'interface ne peut pas la falsifier).
let current: User | null = null
export const currentUser = (): User | null => current

// ---- Mots de passe : scrypt + sel aléatoire, jamais stockés en clair ----
function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`
}
function checkPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  const a = scryptSync(pw, salt, 64)
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

const mapUser = (r: any): User => ({ id: r.id, username: r.username, fullName: r.full_name, role: r.role, active: !!r.active })

// ---- Droits par rôle (appliqués à chaque appel IPC, voir installGuard) ----
/** Droits accordés à un rôle (Paramètres > Utilisateurs / droits). L'administrateur a toujours tout. */
export function grantedPermissions(role: Role): string[] {
  const s = getSettings()
  return (role === 'gerant' ? s.perm_gerant : s.perm_caissier).split(',').filter(Boolean)
}

export function isAllowed(channel: string): boolean {
  if (channel.startsWith('auth:')) return true
  if (!current) return false
  if (current.role === 'admin') return true
  if (channel === 'app:config') return true // configuration de l'interface : tout utilisateur connecté
  if (/^(users|backup|settings):/.test(channel)) return false // réservés à l'administrateur
  return channelGranted(grantedPermissions(current.role), channel)
}

/** Enveloppe ipcMain.handle : tout canal est refusé si le rôle n'a pas le droit. À appeler avant les enregistrements. */
export function installGuard(): void {
  const original = ipcMain.handle.bind(ipcMain)
  ;(ipcMain as any).handle = (channel: string, listener: (...a: any[]) => any) =>
    original(channel, (e, ...args) => (isAllowed(channel) ? listener(e, ...args) : { ok: false, error: 'Accès refusé.' }))
}

function handle<T>(channel: string, fn: (...args: any[]) => T): void {
  ipcMain.handle(channel, (_e, ...args): Result<T> => {
    try {
      return { ok: true, data: fn(...args) }
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) }
    }
  })
}

const countUsers = () => (getDb().prepare('SELECT COUNT(*) AS n FROM users').get() as any).n as number
const otherActiveAdmins = (exceptId: number) =>
  (getDb().prepare(`SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1 AND id <> ?`).get(exceptId) as any).n as number

function validate(u: UserInput, creating: boolean): void {
  if (!u.username.trim() || !u.fullName.trim()) throw new Error('Identifiant et nom sont obligatoires.')
  if ((creating || u.password) && (u.password ?? '').length < 4) throw new Error('Mot de passe : 4 caractères minimum.')
}

export function registerAuthHandlers(): void {
  const db = () => getDb()

  handle('auth:status', (): AuthStatus => ({ hasUsers: countUsers() > 0, user: current }))

  // Premier lancement : création du compte administrateur.
  handle('auth:setup', (u: UserInput) => {
    if (countUsers() > 0) throw new Error('Un utilisateur existe déjà.')
    validate({ ...u, role: 'admin', active: true }, true)
    const r = db().prepare(`INSERT INTO users(username, full_name, password_hash, role) VALUES (?,?,?, 'admin')`)
      .run(u.username.trim(), u.fullName.trim(), hashPassword(u.password!))
    current = mapUser(db().prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid))
    return current
  })

  handle('auth:login', (username: string, password: string) => {
    const row = db().prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(String(username).trim()) as any
    // Même message dans les deux cas : ne révèle pas si l'identifiant existe.
    if (!row || !checkPassword(String(password), row.password_hash)) throw new Error('Identifiant ou mot de passe incorrect.')
    current = mapUser(row)
    return current
  })
  handle('auth:logout', () => { current = null })

  handle('users:list', () => (db().prepare('SELECT * FROM users ORDER BY username COLLATE NOCASE').all() as any[]).map(mapUser))
  handle('users:create', (u: UserInput) => {
    validate(u, true)
    db().prepare('INSERT INTO users(username, full_name, password_hash, role, active) VALUES (?,?,?,?,?)')
      .run(u.username.trim(), u.fullName.trim(), hashPassword(u.password!), u.role, u.active ? 1 : 0)
  })
  handle('users:update', (id: number, u: UserInput) => {
    validate(u, false)
    // Garde-fous : on ne peut pas se retrouver sans administrateur actif, ni se désactiver soi-même.
    if ((u.role !== 'admin' || !u.active) && otherActiveAdmins(id) === 0) throw new Error('Il doit rester au moins un administrateur actif.')
    if (id === current?.id && !u.active) throw new Error('Vous ne pouvez pas désactiver votre propre compte.')
    db().prepare('UPDATE users SET username=?, full_name=?, role=?, active=? WHERE id=?')
      .run(u.username.trim(), u.fullName.trim(), u.role as Role, u.active ? 1 : 0, id)
    if (u.password) db().prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(u.password), id)
    if (id === current?.id) current = mapUser(db().prepare('SELECT * FROM users WHERE id = ?').get(id))
  })
}
