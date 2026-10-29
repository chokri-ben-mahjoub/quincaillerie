import { ipcMain } from 'electron'
import { getDb } from '../db'
import { fromMillimes, toMillimes } from '@shared/money'
import type { Client, ClientInput, Result } from '@shared/types'

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
