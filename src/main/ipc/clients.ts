import { ipcMain } from 'electron'
import { getDb } from '../db'
import { fromMillimes, toMillimes } from '@shared/money'
import type { Client, ClientInput, ClientStatement, Result, StatementEntry } from '@shared/types'

function handle<T>(channel: string, fn: (...args: any[]) => T): void {
  ipcMain.handle(channel, (_e, ...args): Result<T> => {
    try {
      return { ok: true, data: fn(...args) }
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) }
    }
  })
}

const mapClient = (r: any): Client => ({
  id: r.id, name: r.name, phone: r.phone, address: r.address,
  creditLimit: fromMillimes(r.credit_limit), balance: fromMillimes(r.balance)
})

export function registerClientHandlers(): void {
  const db = () => getDb()
  handle('clients:list', () =>
    (db().prepare('SELECT * FROM clients WHERE active = 1 ORDER BY name COLLATE NOCASE').all() as any[]).map(mapClient))
  handle('clients:create', (c: ClientInput) => {
    if (!c.name.trim()) throw new Error('Le nom est obligatoire.')
    db().prepare('INSERT INTO clients(name, phone, address, credit_limit) VALUES (?,?,?,?)')
      .run(c.name.trim(), c.phone, c.address, toMillimes(c.creditLimit))
  })
  handle('clients:update', (id: number, c: ClientInput) => {
    if (!c.name.trim()) throw new Error('Le nom est obligatoire.')
    db().prepare('UPDATE clients SET name=?, phone=?, address=?, credit_limit=? WHERE id=?')
      .run(c.name.trim(), c.phone, c.address, toMillimes(c.creditLimit), id)
  })
  // Relevé : ventes à crédit et règlements dans l'ordre, avec la dette cumulée (une vente annulée n'ajoute rien).
  handle('clients:statement', (id: number): ClientStatement => {
    const row = db().prepare('SELECT * FROM clients WHERE id = ?').get(id) as any
    if (!row) throw new Error('Client introuvable.')
    const raw: (Omit<StatementEntry, 'balance'> & { sort: string; n: number })[] = []
    for (const s of db().prepare(`SELECT id, number, created_at, total, paid, status FROM sales WHERE client_id = ? AND method = 'credit'`).all(id) as any[])
      raw.push({ date: s.created_at, sort: s.created_at, n: s.id, kind: 'vente', ref: s.number, cancelled: s.status === 'annulee',
        label: s.status === 'annulee' ? 'Vente à crédit (annulée)' : s.paid > 0 ? `Vente à crédit (avance ${fromMillimes(s.paid).toFixed(3)})` : 'Vente à crédit',
        debit: s.status === 'annulee' ? 0 : fromMillimes(s.total - s.paid), credit: 0 })
    for (const p of db().prepare('SELECT id, amount, note, created_at FROM client_payments WHERE client_id = ?').all(id) as any[])
      raw.push({ date: p.created_at, sort: p.created_at, n: 1e9 + p.id, kind: 'reglement', ref: `Règlement #${p.id}`, label: p.note || 'Règlement', cancelled: false, debit: 0, credit: fromMillimes(p.amount) })
    raw.sort((a, b) => (a.sort === b.sort ? a.n - b.n : a.sort < b.sort ? -1 : 1))
    let balance = 0
    const entries: StatementEntry[] = raw.map(({ sort: _s, n: _n, ...e }) => { balance = Math.round((balance + e.debit - e.credit) * 1000) / 1000; return { ...e, balance } })
    const tot = db().prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS t FROM sales WHERE client_id = ? AND status = 'validee'`).get(id) as any
    return { client: mapClient(row), entries, salesCount: tot.n, salesTotal: fromMillimes(tot.t) }
  })
  handle('clients:delete', (id: number) => {
    const c = db().prepare('SELECT balance FROM clients WHERE id = ?').get(id) as any
    if (c?.balance > 0) throw new Error('Ce client a une dette en cours : réglez-la avant de le supprimer.')
    db().prepare('UPDATE clients SET active = 0 WHERE id = ?').run(id)
  })
  // Règlement d'une dette : enregistrement + baisse du solde dans la même transaction.
  handle('clients:pay', (id: number, amount: number, note: string) => {
    const cents = toMillimes(amount)
    if (cents <= 0) throw new Error('Montant invalide.')
    db().transaction(() => {
      const c = db().prepare('SELECT balance FROM clients WHERE id = ?').get(id) as any
      if (!c) throw new Error('Client introuvable.')
      if (cents > c.balance) throw new Error(`Le montant dépasse la dette (${fromMillimes(c.balance)} DT).`)
      db().prepare('INSERT INTO client_payments(client_id, amount, note) VALUES (?,?,?)').run(id, cents, note || null)
      db().prepare('UPDATE clients SET balance = balance - ? WHERE id = ?').run(cents, id)
    })()
  })
}
