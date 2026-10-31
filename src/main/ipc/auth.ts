import { ipcMain } from 'electron'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { getDb } from '../db'
import { getSettings } from '../settings'
import { channelGranted } from '@shared/permissions'
import type { AuthStatus, Result, Role, User, UserInput } from '@shared/types'

// Utilisateur connecté (session tenue côté principal : l'interface ne peut pas la falsifier).
let current: User | null = null
export const currentUser = (): User | null => current
export const clearSession = (): void => { current = null }

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
  if (/^(users|backup|settings|demo|audit):/.test(channel)) return false // réservés à l'administrateur
  return channelGranted(grantedPermissions(current.role), channel)
}

// ---- Journal d'audit : chaque action qui modifie quelque chose (et chaque refus d'accès) est enregistrée ----
// Les simples lectures (listes, fiches, aperçus) ne sont pas journalisées.
const READ_ACTIONS = new Set(['list', 'get', 'getAll', 'status', 'stats', 'statement', 'movements', 'payments', 'preview', 'config',
  'printers', 'compose', 'pickDir', 'articles', 'lots', 'lot', 'pending', 'history'])
const isRead = (channel: string): boolean => READ_ACTIONS.has(channel.split(':')[1] ?? '')

/** Copie des arguments sans aucun mot de passe, tronquée pour rester lisible. */
function auditDetails(channel: string, args: unknown[]): string | null {
  if (channel === 'auth:login') return JSON.stringify({ identifiant: String(args[0] ?? '') })
  if (!args.length) return null
  const json = JSON.stringify(args.length === 1 ? args[0] : args, (k, v) => (/password|mot_de_passe/i.test(k) ? '***' : v))
  return json && json.length > 2000 ? json.slice(0, 2000) + '…' : (json ?? null)
}

function auditResult(data: unknown): string | null {
  if (data === undefined || data === null) return null
  if (typeof data !== 'object') return String(data)
  const d = data as Record<string, unknown>
  const keep = ['id', 'number', 'created', 'updated', 'username']
  const picked = Object.fromEntries(keep.filter((k) => d[k] !== undefined && typeof d[k] !== 'object').map((k) => [k, d[k]]))
  return Object.keys(picked).length ? JSON.stringify(picked) : null
}

function writeAudit(channel: string, user: User | null, args: unknown[], res: any): void {
  try {
    const ok = !!res && typeof res === 'object' && 'ok' in res ? !!res.ok : true
    getDb().prepare('INSERT INTO audit_log(user_id, user_name, channel, details, result, ok, error) VALUES (?,?,?,?,?,?,?)').run(
      user?.id ?? null, user ? `${user.fullName} (${user.username})` : '', channel, auditDetails(channel, args),
      ok ? auditResult(res?.data) : null, ok ? 1 : 0, ok ? null : String(res?.error ?? '').slice(0, 500))
  } catch {
    // Le journal ne doit jamais empêcher l'application de fonctionner (ex. base en cours de restauration).
  }
}

/**
 * Enveloppe ipcMain.handle : tout canal est refusé si le rôle n'a pas le droit, et toute action est inscrite au journal d'audit.
 * À appeler avant les enregistrements.
 */
export function installGuard(): void {
  const original = ipcMain.handle.bind(ipcMain)
  ;(ipcMain as any).handle = (channel: string, listener: (...a: any[]) => any) =>
    original(channel, (e, ...args) => {
      const before = current // l'utilisateur qui agit (pour une déconnexion, celui qui part)
      if (!isAllowed(channel)) {
        const denied = { ok: false, error: 'Accès refusé.' }
        writeAudit(channel, before, args, denied)
        return denied
      }
      const out = listener(e, ...args)
      if (isRead(channel) || channel === 'auth:status' || channel === 'app:config') return out
      // Certains gestionnaires sont asynchrones (impression, import…) : on journalise une fois le résultat connu.
      const log = (res: unknown) => { writeAudit(channel, before ?? current, args, res); return res }
      return out instanceof Promise ? out.then(log) : log(out)
    })
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

  handle('auth:status', (): AuthStatus => {
    const s = getSettings()
    const shop = (db().prepare(`SELECT value FROM settings WHERE key = 'shop_name'`).get() as any)?.value ?? ''
    return { hasUsers: countUsers() > 0, user: current, shopName: s.company_name || shop || 'Quincaillerie', logo: s.company_logo || '' }
  })

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
