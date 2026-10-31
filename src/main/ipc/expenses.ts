import { ipcMain, shell } from 'electron'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { getDb } from '../db'
import { getSettings } from '../settings'
import { currentUser } from './auth'
import { fromMillimes, toMillimes } from '@shared/money'
import { RECURRENCE_LABELS, RECURRENCE_MONTHS } from '@shared/expenses'
import type { Result } from '@shared/types'
import type { Expense, ExpenseCategory, ExpenseCategoryInput, ExpenseInput, ExpenseMethod, PayInput, Recurrence } from '@shared/expenses'

function handle<T>(channel: string, fn: (...args: any[]) => T | Promise<T>): void {
  ipcMain.handle(channel, async (_e, ...args): Promise<Result<T>> => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) }
    }
  })
}

const db = () => getDb()
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_ATTACHMENT = 4_500_000 // ≈ 3 Mo de fichier une fois encodé
const METHODS: ExpenseMethod[] = ['especes', 'cheque', 'virement', 'carte', 'prelevement']

const SELECT = `
  SELECT e.id, e.category_id, c.name AS category_name, c.color AS category_color, c.recurrence, e.label, e.payee, e.reference,
         e.amount, e.expense_date, e.due_date, e.status, e.paid_date, e.method, e.from_cash, e.note,
         e.attachment IS NOT NULL AS has_attachment, e.attachment_name, e.generated, u.full_name AS user_name, e.created_at
  FROM expenses e JOIN expense_categories c ON c.id = e.category_id LEFT JOIN users u ON u.id = e.user_id`

const mapExpense = (r: any): Expense => ({
  id: r.id, categoryId: r.category_id, categoryName: r.category_name, categoryColor: r.category_color, recurrence: r.recurrence,
  label: r.label, payee: r.payee, reference: r.reference, amount: fromMillimes(r.amount), expenseDate: r.expense_date,
  dueDate: r.due_date, status: r.status, paidDate: r.paid_date, method: r.method, fromCash: !!r.from_cash, note: r.note,
  hasAttachment: !!r.has_attachment, attachmentName: r.attachment_name, generated: !!r.generated, userName: r.user_name, createdAt: r.created_at
})
const getOne = (id: number): Expense => {
  const r = db().prepare(SELECT + ' WHERE e.id = ?').get(id)
  if (!r) throw new Error('Dépense introuvable.')
  return mapExpense(r)
}

function checkPayment(method: unknown, fromCash: unknown): { method: ExpenseMethod; fromCash: number } {
  const s = getSettings()
  if (!METHODS.includes(method as ExpenseMethod) || !s.expenses_methods.split(',').includes(String(method))) throw new Error('Mode de paiement non autorisé (Paramètres > Dépenses).')
  const cash = !!fromCash && s.expenses_cash_enabled === '1'
  if (cash && method !== 'especes') throw new Error('Seul un paiement en espèces peut sortir de la caisse.')
  return { method: method as ExpenseMethod, fromCash: cash ? 1 : 0 }
}

/**
 * Charge récurrente payée : prépare l'échéance suivante (même libellé, montant de la dernière facture comme estimation).
 * Rien n'est créé si une échéance « à payer » existe déjà pour ce libellé, ou si le réglage est désactivé.
 */
function prepareNext(expenseId: number): void {
  if (getSettings().expenses_auto_next !== '1') return
  const e = db().prepare(`SELECT e.*, c.recurrence, c.due_days FROM expenses e JOIN expense_categories c ON c.id = e.category_id WHERE e.id = ?`).get(expenseId) as any
  const months = RECURRENCE_MONTHS[e.recurrence as Recurrence] ?? 0
  if (!months) return
  const pending = db().prepare(`SELECT 1 FROM expenses WHERE category_id = ? AND label = ? AND status = 'a_payer' AND expense_date > ?`).get(e.category_id, e.label, e.expense_date)
  if (pending) return
  const shift = `+${months} months`
  const next = db().prepare(`SELECT date(?, ?) AS d, date(?, ?) AS due`).get(e.expense_date, shift, e.due_date ?? e.expense_date, shift) as any
  db().prepare(`INSERT INTO expenses(category_id, label, payee, amount, expense_date, due_date, note, generated, user_id) VALUES (?,?,?,?,?,?,?,1,?)`)
    .run(e.category_id, e.label, e.payee, e.amount, next.d, next.due, `Échéance prévue (${RECURRENCE_LABELS[e.recurrence as Recurrence].toLowerCase()}) : montant estimé d’après la dernière facture.`, currentUser()?.id ?? null)
}

function save(id: number | null, input: ExpenseInput): Expense {
  const s = getSettings()
  const cat = db().prepare('SELECT id, active, due_days FROM expense_categories WHERE id = ?').get(input.categoryId) as any
  if (!cat) throw new Error('Choisissez une catégorie.')
  const label = String(input.label ?? '').trim()
  if (!label) throw new Error('Le libellé est obligatoire.')
  const amount = toMillimes(input.amount)
  if (!(amount > 0)) throw new Error('Le montant doit être supérieur à zéro.')
  if (!DATE.test(input.expenseDate ?? '')) throw new Error('Date de facture invalide.')
  const due = input.dueDate ? String(input.dueDate) : null
  if (due && !DATE.test(due)) throw new Error('Date d’échéance invalide.')
  let paid = { date: null as string | null, method: null as string | null, fromCash: 0 }
  if (input.paid) {
    if (!DATE.test(input.paidDate ?? '')) throw new Error('Date de paiement invalide.')
    const p = checkPayment(input.method, input.fromCash)
    paid = { date: input.paidDate!, method: p.method, fromCash: p.fromCash }
  }
  const att = input.attachment
  if (att && (!/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(att) || att.length > MAX_ATTACHMENT)) throw new Error('Pièce jointe invalide ou trop lourde (3 Mo maximum).')
  const hasAtt = att !== undefined ? !!att : id !== null && !!(db().prepare('SELECT attachment IS NOT NULL AS a FROM expenses WHERE id = ?').get(id) as any)?.a
  if (s.expenses_require_attachment === '1' && !hasAtt) throw new Error('Joignez la photo ou le PDF de la facture (Paramètres > Dépenses).')

  const vals = [input.categoryId, label, input.payee?.trim() || null, input.reference?.trim() || null, amount, input.expenseDate, due,
    input.paid ? 'payee' : 'a_payer', paid.date, paid.method, paid.fromCash, input.note?.trim() || null]
  return db().transaction(() => {
    let newId = id
    if (id === null) {
      newId = Number(db().prepare(`INSERT INTO expenses(category_id, label, payee, reference, amount, expense_date, due_date, status, paid_date, method, from_cash, note, attachment, attachment_name, user_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...vals, att ?? null, att ? input.attachmentName ?? null : null, currentUser()?.id ?? null).lastInsertRowid)
    } else {
      const before = db().prepare('SELECT status FROM expenses WHERE id = ?').get(id) as any
      if (!before) throw new Error('Dépense introuvable.')
      db().prepare(`UPDATE expenses SET category_id=?, label=?, payee=?, reference=?, amount=?, expense_date=?, due_date=?, status=?, paid_date=?, method=?,
        from_cash=?, note=?, generated=0, updated_at=datetime('now','localtime') WHERE id=?`).run(...vals, id)
      if (att !== undefined) db().prepare('UPDATE expenses SET attachment=?, attachment_name=? WHERE id=?').run(att, att ? input.attachmentName ?? null : null, id)
      if (before.status === 'payee') return getOne(id) // déjà payée avant : l'échéance suivante existe déjà
    }
    if (input.paid) prepareNext(newId!)
    return getOne(newId!)
  })()
}

function pay(id: number, p: PayInput): Expense {
  const e = db().prepare('SELECT status FROM expenses WHERE id = ?').get(id) as any
  if (!e) throw new Error('Dépense introuvable.')
  if (e.status === 'payee') throw new Error('Cette dépense est déjà payée.')
  if (!DATE.test(p.paidDate ?? '')) throw new Error('Date de paiement invalide.')
  const amount = toMillimes(p.amount)
  if (!(amount > 0)) throw new Error('Le montant doit être supérieur à zéro.')
  const { method, fromCash } = checkPayment(p.method, p.fromCash)
  return db().transaction(() => {
    db().prepare(`UPDATE expenses SET status='payee', paid_date=?, method=?, from_cash=?, amount=?, generated=0, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(p.paidDate, method, fromCash, amount, id)
    prepareNext(id)
    return getOne(id)
  })()
}

/** Ouvre la pièce jointe avec le programme de Windows (visionneuse de photos, lecteur PDF). */
async function openAttachment(id: number): Promise<void> {
  const r = db().prepare('SELECT attachment, attachment_name FROM expenses WHERE id = ?').get(id) as any
  if (!r?.attachment) throw new Error('Aucune pièce jointe.')
  const m = /^data:([^;]+);base64,(.*)$/s.exec(r.attachment)
  if (!m) throw new Error('Pièce jointe illisible.')
  const ext = m[1] === 'application/pdf' ? 'pdf' : m[1].split('/')[1].replace('jpeg', 'jpg')
  const file = join(tmpdir(), `depense-${id}-${Date.now()}.${ext}`)
  writeFileSync(file, Buffer.from(m[2], 'base64'))
  const err = await shell.openPath(file)
  if (err) throw new Error(`Impossible d’ouvrir le fichier : ${err}`)
}

// ---------- Catégories (Paramètres > Dépenses, réservé à l'administrateur) ----------
function listCategories(): ExpenseCategory[] {
  return (db().prepare(`SELECT c.*, (SELECT COUNT(*) FROM expenses e WHERE e.category_id = c.id) AS usage
                        FROM expense_categories c ORDER BY c.active DESC, c.sort, c.name COLLATE NOCASE`).all() as any[])
    .map((r) => ({ id: r.id, name: r.name, recurrence: r.recurrence, dueDays: r.due_days, color: r.color, active: !!r.active, usage: r.usage }))
}

function saveCategory(id: number | null, c: ExpenseCategoryInput): void {
  const name = String(c.name ?? '').trim()
  if (!name) throw new Error('Le nom est obligatoire.')
  if (!(c.recurrence in RECURRENCE_MONTHS)) throw new Error('Périodicité invalide.')
  const dueDays = Math.round(Number(c.dueDays) || 0)
  if (dueDays < 0 || dueDays > 120) throw new Error('Délai de paiement : entre 0 et 120 jours.')
  const color = /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#94a3b8'
  const clash = db().prepare('SELECT id FROM expense_categories WHERE name = ? AND id IS NOT ?').get(name, id) as any
  if (clash) throw new Error(`La catégorie « ${name} » existe déjà.`)
  if (id === null) {
    const sort = (db().prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM expense_categories').get() as any).s
    db().prepare('INSERT INTO expense_categories(name, recurrence, due_days, color, active, sort) VALUES (?,?,?,?,?,?)').run(name, c.recurrence, dueDays, color, c.active ? 1 : 0, sort)
  } else {
    db().prepare('UPDATE expense_categories SET name=?, recurrence=?, due_days=?, color=?, active=? WHERE id=?').run(name, c.recurrence, dueDays, color, c.active ? 1 : 0, id)
  }
}

function deleteCategory(id: number): 'supprimee' | 'desactivee' {
  const used = (db().prepare('SELECT COUNT(*) AS n FROM expenses WHERE category_id = ?').get(id) as any).n
  if (used) { // l'historique garde sa catégorie : on la retire seulement des choix
    db().prepare('UPDATE expense_categories SET active = 0 WHERE id = ?').run(id)
    return 'desactivee'
  }
  db().prepare('DELETE FROM expense_categories WHERE id = ?').run(id)
  return 'supprimee'
}

export function registerExpenseHandlers(): void {
  handle('expenses:categories', () => listCategories())
  handle('expenses:list', () => (db().prepare(SELECT + ' ORDER BY COALESCE(e.due_date, e.expense_date) DESC, e.id DESC LIMIT 20000').all() as any[]).map(mapExpense))
  handle('expenses:create', (input: ExpenseInput) => save(null, input))
  handle('expenses:update', (id: number, input: ExpenseInput) => save(id, input))
  handle('expenses:pay', (id: number, p: PayInput) => pay(id, p))
  handle('expenses:delete', (id: number) => { db().prepare('DELETE FROM expenses WHERE id = ?').run(id) })
  handle('expenses:openAttachment', (id: number) => openAttachment(id))
  handle('expcat:save', (id: number | null, c: ExpenseCategoryInput) => saveCategory(id, c))
  handle('expcat:delete', (id: number) => deleteCategory(id))
}
