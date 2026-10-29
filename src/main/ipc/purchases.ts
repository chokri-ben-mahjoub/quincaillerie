import { ipcMain } from 'electron'
import { getDb } from '../db'
import { currentUser } from './auth'
import { fromMillimes, toMillimes } from '@shared/money'
import type { Purchase, PurchaseInput, Result, Supplier, SupplierInput } from '@shared/types'

function handle<T>(channel: string, fn: (...args: any[]) => T): void {
  ipcMain.handle(channel, (_e, ...args): Result<T> => {
    try {
      return { ok: true, data: fn(...args) }
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) }
    }
  })
}

// Solde = achats non réglés - règlements ultérieurs (en millimes, converti à la sortie).
const SELECT_SUPPLIERS = `
  SELECT s.id, s.name, s.phone, s.address, s.note,
    COALESCE((SELECT SUM(total - paid) FROM purchases WHERE supplier_id = s.id), 0)
  - COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = s.id), 0) AS balance
  FROM suppliers s WHERE s.active = 1`

const mapSupplier = (r: any): Supplier => ({ ...r, balance: fromMillimes(r.balance) })

/** Un achat = une transaction : en-tête, lignes, mouvements de stock « achat », mise à jour du prix d'achat. */
function createPurchase(input: PurchaseInput): number {
  const db = getDb()
  if (!input.items.length) throw new Error("L'achat ne contient aucun article.")
  return db.transaction(() => {
    const lines = input.items.map((it) => {
      if (!(it.quantity > 0)) throw new Error('Quantité invalide.')
      if (it.unitCost < 0) throw new Error('Prix invalide.')
      const cost = toMillimes(it.unitCost)
      return { ...it, cost, total: Math.round(it.quantity * cost) }
    })
    const total = lines.reduce((s, l) => s + l.total, 0)
    const paid = Math.min(toMillimes(input.paid), total)
    const p = db.prepare('INSERT INTO purchases(supplier_id, reference, total, paid) VALUES (?,?,?,?)')
      .run(input.supplierId, input.reference.trim() || null, total, paid)
    const id = Number(p.lastInsertRowid)

    const addLine = db.prepare('INSERT INTO purchase_items(purchase_id, article_id, quantity, unit_cost) VALUES (?,?,?,?)')
    const addMove = db.prepare(`INSERT INTO stock_movements(article_id, type, quantity, unit_cost, ref_type, ref_id, note, user_id)
                                VALUES (?, 'achat', ?, ?, 'purchase', ?, ?, ?)`)
    const setCost = db.prepare(`UPDATE articles SET purchase_price = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    for (const l of lines) {
      addLine.run(id, l.articleId, l.quantity, l.cost)
      addMove.run(l.articleId, l.quantity, l.cost, id, `Achat #${id}`, currentUser()?.id ?? null) // le trigger met le stock à jour
      setCost.run(l.cost, l.articleId) // le dernier prix d'achat devient le prix de référence
    }
    return id
  })()
}

export function registerPurchaseHandlers(): void {
  const db = () => getDb()
  handle('suppliers:list', () => (db().prepare(SELECT_SUPPLIERS + ' ORDER BY s.name COLLATE NOCASE').all() as any[]).map(mapSupplier))
  handle('suppliers:create', (s: SupplierInput) => {
    if (!s.name.trim()) throw new Error('Le nom est obligatoire.')
    db().prepare('INSERT INTO suppliers(name, phone, address, note) VALUES (?,?,?,?)').run(s.name.trim(), s.phone, s.address, s.note)
  })
  handle('suppliers:update', (id: number, s: SupplierInput) => {
    if (!s.name.trim()) throw new Error('Le nom est obligatoire.')
    db().prepare('UPDATE suppliers SET name=?, phone=?, address=?, note=? WHERE id=?').run(s.name.trim(), s.phone, s.address, s.note, id)
  })
  handle('suppliers:delete', (id: number) => { db().prepare('UPDATE suppliers SET active = 0 WHERE id = ?').run(id) })
  handle('suppliers:pay', (id: number, amount: number, note: string) => {
    if (!(amount > 0)) throw new Error('Montant invalide.')
    db().prepare('INSERT INTO supplier_payments(supplier_id, amount, note) VALUES (?,?,?)').run(id, toMillimes(amount), note || null)
  })
  handle('purchases:create', (p: PurchaseInput) => createPurchase(p))
  handle('purchases:list', () =>
    (db().prepare(`
      SELECT p.id, s.name AS supplier_name, p.reference, p.total, p.paid, p.created_at,
             (SELECT COUNT(*) FROM purchase_items WHERE purchase_id = p.id) AS item_count
      FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
      ORDER BY p.id DESC LIMIT 300`).all() as any[]).map((r): Purchase => ({
      id: r.id, supplierName: r.supplier_name, reference: r.reference, total: fromMillimes(r.total),
      paid: fromMillimes(r.paid), itemCount: r.item_count, createdAt: r.created_at
    })))
}
