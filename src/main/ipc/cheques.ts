import { ipcMain } from 'electron'
import { getDb } from '../db'
import { currentUser } from './auth'
import { fromMillimes, toMillimes } from '@shared/money'
import { STATUSES_BY_DIRECTION } from '@shared/cheques'
import type { Result } from '@shared/types'
import type { Cheque, ChequeInput, ChequeStatus } from '@shared/cheques'

function handle<T>(channel: string, fn: (...args: any[]) => T): void {
  ipcMain.handle(channel, (_e, ...args): Result<T> => {
    try {
      return { ok: true, data: fn(...args) }
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) }
    }
  })
}

const db = () => getDb()
const DATE = /^\d{4}-\d{2}-\d{2}$/

// Document d'origine lisible : la vente, la facture ou la dépense qui a créé le chèque.
const SELECT = `
  SELECT q.*, u.full_name AS user_name,
         CASE q.ref_type WHEN 'sale' THEN 'Vente ' || sa.number
                         WHEN 'invoice_payment' THEN 'Facture ' || COALESCE(inv.number, '')
                         WHEN 'expense' THEN 'Dépense : ' || ex.label END AS ref_label
  FROM cheques q
  LEFT JOIN users u ON u.id = q.user_id
  LEFT JOIN sales sa ON q.ref_type = 'sale' AND sa.id = q.ref_id
  LEFT JOIN invoice_payments ip ON q.ref_type = 'invoice_payment' AND ip.id = q.ref_id
  LEFT JOIN invoices inv ON inv.id = ip.invoice_id
  LEFT JOIN expenses ex ON q.ref_type = 'expense' AND ex.id = q.ref_id`

const mapCheque = (r: any): Cheque => ({
  id: r.id, direction: r.direction, kind: r.kind, number: r.number, bank: r.bank, holder: r.holder, clientId: r.client_id, supplierId: r.supplier_id,
  amount: fromMillimes(r.amount), issueDate: r.issue_date, dueDate: r.due_date, status: r.status, statusDate: r.status_date,
  refType: r.ref_type, refLabel: r.ref_label, note: r.note, incomplete: !r.number || !r.bank, userName: r.user_name, createdAt: r.created_at
})
const getOne = (id: number): Cheque => {
  const r = db().prepare(SELECT + ' WHERE q.id = ?').get(id)
  if (!r) throw new Error('Chèque introuvable.')
  return mapCheque(r)
}

function validate(c: ChequeInput) {
  if (c.direction !== 'recu' && c.direction !== 'emis') throw new Error('Sens invalide.')
  if (c.kind !== 'cheque' && c.kind !== 'traite') throw new Error('Type invalide.')
  const amount = toMillimes(c.amount)
  if (!(amount > 0)) throw new Error('Le montant doit être supérieur à zéro.')
  if (!DATE.test(c.issueDate ?? '') || !DATE.test(c.dueDate ?? '')) throw new Error('Dates invalides.')
  if (c.dueDate < c.issueDate) throw new Error('La date d’encaissement ne peut pas précéder la date de réception / d’émission.')
  if (!String(c.holder ?? '').trim()) throw new Error(c.direction === 'recu' ? 'Indiquez le tireur (qui a signé le chèque).' : 'Indiquez le bénéficiaire.')
  return { amount, number: String(c.number ?? '').trim(), bank: String(c.bank ?? '').trim(), holder: String(c.holder).trim(), note: c.note?.trim() || null }
}

function create(c: ChequeInput): Cheque {
  const v = validate(c)
  const id = Number(db().prepare(`INSERT INTO cheques(direction, kind, number, bank, holder, client_id, supplier_id, amount, issue_date, due_date, status, note, user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(c.direction, c.kind, v.number, v.bank, v.holder, c.clientId ?? null, c.supplierId ?? null, v.amount,
    c.issueDate, c.dueDate, c.direction === 'recu' ? 'portefeuille' : 'emis', v.note, currentUser()?.id ?? null).lastInsertRowid)
  return getOne(id)
}

function update(id: number, c: ChequeInput): Cheque {
  const before = db().prepare('SELECT * FROM cheques WHERE id = ?').get(id) as any
  if (!before) throw new Error('Chèque introuvable.')
  const v = validate({ ...c, direction: before.direction })
  // Chèque issu d'une vente, d'une facture ou d'une dépense : son montant suit ce paiement, on ne le change pas ici.
  if (before.ref_type && v.amount !== before.amount) throw new Error('Ce chèque vient d’un paiement enregistré : son montant ne se modifie pas ici.')
  db().prepare(`UPDATE cheques SET kind=?, number=?, bank=?, holder=?, client_id=?, supplier_id=?, amount=?, issue_date=?, due_date=?, note=?,
    updated_at=datetime('now','localtime') WHERE id=?`).run(c.kind, v.number, v.bank, v.holder, c.clientId ?? before.client_id, c.supplierId ?? before.supplier_id,
    v.amount, c.issueDate, c.dueDate, v.note, id)
  return getOne(id)
}

/** Changement d'état, pour un ou plusieurs chèques à la fois (ex. remise en banque de tout le portefeuille). */
function setStatus(ids: number[], status: ChequeStatus, date: string): number {
  if (!DATE.test(date ?? '')) throw new Error('Date invalide.')
  if (!ids?.length) throw new Error('Aucun chèque choisi.')
  return db().transaction(() => {
    const get = db().prepare('SELECT id, direction, number, bank FROM cheques WHERE id = ?')
    const upd = db().prepare(`UPDATE cheques SET status = ?, status_date = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    for (const id of ids) {
      const q = get.get(id) as any
      if (!q) throw new Error('Chèque introuvable.')
      if (!STATUSES_BY_DIRECTION[q.direction as 'recu' | 'emis'].includes(status)) throw new Error('État impossible pour ce chèque.')
      if (status === 'remis' && (!q.number || !q.bank)) throw new Error('Complétez le n° et la banque de chaque chèque avant la remise en banque.')
      upd.run(status, date, id)
    }
    return ids.length
  })()
}

export function registerChequeHandlers(): void {
  handle('cheques:list', () => (db().prepare(SELECT + ' ORDER BY q.due_date DESC, q.id DESC LIMIT 20000').all() as any[]).map(mapCheque))
  handle('cheques:create', (c: ChequeInput) => create(c))
  handle('cheques:update', (id: number, c: ChequeInput) => update(id, c))
  handle('cheques:setStatus', (ids: number[], status: ChequeStatus, date: string) => setStatus(ids, status, date))
  handle('cheques:delete', (id: number) => {
    const q = db().prepare('SELECT ref_type FROM cheques WHERE id = ?').get(id) as any
    if (!q) throw new Error('Chèque introuvable.')
    if (q.ref_type) throw new Error('Ce chèque vient d’un paiement enregistré : marquez-le « Annulé » plutôt que de le supprimer.')
    db().prepare('DELETE FROM cheques WHERE id = ?').run(id)
  })
}
