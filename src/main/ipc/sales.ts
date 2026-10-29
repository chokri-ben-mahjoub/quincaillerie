import { ipcMain } from 'electron'
import { getDb } from '../db'
import { currentUser } from './auth'
import { getSettings } from '../settings'
import { fromMillimes, toMillimes } from '@shared/money'
import type { Receipt, Result, SaleInput } from '@shared/types'

/**
 * Enregistre une vente. TOUT se passe dans une seule transaction :
 * en-tête, lignes, mouvements de stock. Si une étape échoue, rien n'est enregistré.
 * Les prix viennent toujours de la base (jamais de l'interface).
 */
function createSale(input: SaleInput): Receipt {
  const db = getDb()
  if (!input.items.length) throw new Error('Le panier est vide.')

  return db.transaction((): Receipt => {
    const cfg = getSettings() // règles de vente lues dans les paramètres (Paramètres > Ventes)
    if (!cfg.sales_payment_methods.split(',').includes(input.method)) throw new Error('Mode de paiement non autorisé.')
    const getArticle = db.prepare(
      'SELECT id, designation, unit, sale_price, purchase_price, stock FROM articles WHERE id = ? AND active = 1')
    const lines = input.items.map((it) => {
      const a = getArticle.get(it.articleId) as any
      if (!a) throw new Error('Article introuvable.')
      if (!(it.quantity > 0)) throw new Error(`Quantité invalide pour « ${a.designation} ».`)
      if (a.stock < it.quantity && cfg.sales_allow_below_stock !== '1') throw new Error(`Stock insuffisant pour « ${a.designation} » (disponible : ${a.stock}).`)
      return { a, quantity: it.quantity, total: Math.round(it.quantity * a.sale_price) }
    })

    const subtotal = lines.reduce((s, l) => s + l.total, 0)
    const discount = toMillimes(input.discount)
    const total = subtotal - discount
    if (discount < 0 || total < 0) throw new Error('Remise invalide.')
    // Remise maximale : s'applique au caissier uniquement (gérant et administrateur sans limite).
    const maxPct = currentUser()?.role === 'caissier' ? Number(cfg.sales_max_discount_pct) : 100
    if (discount > Math.round((subtotal * maxPct) / 100)) throw new Error(`Remise limitée à ${maxPct} % du total.`)
    const received = toMillimes(input.received)
    if (input.method === 'especes' && received < total) throw new Error('Montant reçu insuffisant.')

    // Vente à crédit : le client doit exister et rester sous son plafond. L'avance éventuelle est encaissée.
    const isCredit = input.method === 'credit'
    let paidNow = total
    let due = 0
    let clientName: string | null = null
    if (isCredit) {
      const c = db.prepare('SELECT name, credit_limit, balance FROM clients WHERE id = ? AND active = 1').get(input.clientId ?? -1) as any
      if (!c) throw new Error('Choisissez un client pour une vente à crédit.')
      paidNow = Math.min(Math.max(received, 0), total)
      due = total - paidNow
      if (c.balance + due > c.credit_limit)
        throw new Error(`Plafond de crédit dépassé (autorisé : ${fromMillimes(c.credit_limit)} DT, dette actuelle : ${fromMillimes(c.balance)} DT).`)
      clientName = c.name
    }

    // Numéro lisible : AAAAMMJJ-0001, remis à zéro chaque jour.
    const day = new Date().toLocaleDateString('sv-SE').replace(/-/g, '')
    const count = (db.prepare(`SELECT COUNT(*) AS n FROM sales WHERE date(created_at) = date('now','localtime')`).get() as any).n
    const number = `${day}-${String(count + 1).padStart(4, '0')}`

    const sale = db.prepare(`INSERT INTO sales(number, client_id, user_id, total, discount, paid, method) VALUES (?,?,?,?,?,?,?)`)
      .run(number, isCredit ? input.clientId : null, currentUser()?.id ?? null, total, discount, paidNow, input.method)
    const saleId = Number(sale.lastInsertRowid)
    if (due > 0) db.prepare('UPDATE clients SET balance = balance + ? WHERE id = ?').run(due, input.clientId)

    const addLine = db.prepare(`INSERT INTO sale_items(sale_id, article_id, quantity, unit_price, unit_cost) VALUES (?,?,?,?,?)`)
    const addMove = db.prepare(`INSERT INTO stock_movements(article_id, type, quantity, unit_cost, ref_type, ref_id, note, user_id)
                                VALUES (?, 'vente', ?, ?, 'sale', ?, ?, ?)`)
    for (const l of lines) {
      addLine.run(saleId, l.a.id, l.quantity, l.a.sale_price, l.a.purchase_price)
      addMove.run(l.a.id, -l.quantity, l.a.purchase_price, saleId, `Vente ${number}`, currentUser()?.id ?? null) // le trigger met le stock à jour
    }

    const row = db.prepare('SELECT created_at FROM sales WHERE id = ?').get(saleId) as any
    const shop = db.prepare(`SELECT value FROM settings WHERE key = 'shop_name'`).get() as any
    return {
      id: saleId, number, createdAt: row.created_at, shopName: shop?.value ?? '',
      lines: lines.map((l) => ({
        designation: l.a.designation, unit: l.a.unit, quantity: l.quantity,
        unitPrice: fromMillimes(l.a.sale_price), total: fromMillimes(l.total)
      })),
      subtotal: fromMillimes(subtotal), discount: fromMillimes(discount), total: fromMillimes(total),
      received: fromMillimes(input.method === 'especes' ? received : paidNow),
      change: fromMillimes(input.method === 'especes' ? received - total : 0),
      due: fromMillimes(due), clientName,
      method: input.method
    }
  })()
}

export function registerSalesHandlers(): void {
  ipcMain.handle('sales:create', (_e, input: SaleInput): Result<Receipt> => {
    try {
      return { ok: true, data: createSale(input) }
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) }
    }
  })
}
