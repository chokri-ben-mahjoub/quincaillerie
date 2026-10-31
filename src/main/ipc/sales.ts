import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { getDb } from '../db'
import { currentUser } from './auth'
import { getSettings } from '../settings'
import { fromMillimes, toMillimes } from '@shared/money'
import type { Receipt, Result, SaleDetail, SaleInput, SaleSummary } from '@shared/types'

/** Un caissier ne peut modifier/annuler une vente que si le réglage l'autorise et dans le délai fixé (Paramètres > Ventes). */
function assertCanEdit(sale: { created_at: string }): void {
  const user = currentUser()
  if (user?.role !== 'caissier') return // gérant et administrateur : sans limite
  const cfg = getSettings()
  if (cfg.sales_allow_edit !== '1') throw new Error('La modification des ventes est désactivée (Paramètres > Ventes).')
  const hours = Number(cfg.sales_cashier_edit_hours)
  if (hours > 0 && Date.now() - new Date(sale.created_at.replace(' ', 'T')).getTime() > hours * 3600e3)
    throw new Error(`Un caissier ne peut modifier une vente que dans les ${hours} h qui suivent son encaissement.`)
}

/**
 * Annule une vente sans rien effacer : la vente passe à « annulée », le stock est rendu par des mouvements « retour client »
 * (le stock ne se modifie que par mouvements) et la dette éventuelle du client est reprise.
 */
function reverseSale(db: Database.Database, saleId: number, reason: string): void {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as any
  if (!sale) throw new Error('Vente introuvable.')
  if (sale.status === 'annulee') throw new Error('Cette vente est déjà annulée.')
  assertCanEdit(sale)
  const uid = currentUser()?.id ?? null
  const items = db.prepare('SELECT article_id, quantity, unit_cost FROM sale_items WHERE sale_id = ?').all(saleId) as any[]
  const addMove = db.prepare(`INSERT INTO stock_movements(article_id, type, quantity, unit_cost, ref_type, ref_id, note, user_id)
                              VALUES (?, 'retour_client', ?, ?, 'sale', ?, ?, ?)`)
  for (const it of items) addMove.run(it.article_id, it.quantity, it.unit_cost, saleId, `Annulation vente ${sale.number}`, uid)
  const due = sale.total - sale.paid
  if (sale.client_id && due > 0) db.prepare('UPDATE clients SET balance = balance - ? WHERE id = ?').run(due, sale.client_id)
  db.prepare(`UPDATE sales SET status = 'annulee', cancelled_at = datetime('now','localtime'), cancelled_by = ?, cancel_reason = ? WHERE id = ?`)
    .run(uid, reason.trim() || 'Sans motif', saleId)
}

/**
 * Enregistre une vente. TOUT se passe dans une seule transaction :
 * en-tête, lignes, mouvements de stock. Si une étape échoue, rien n'est enregistré.
 * Les prix viennent toujours de la base (jamais de l'interface).
 * `replaces` : modification d'une vente déjà encaissée — l'ancienne est annulée dans la même transaction
 * (si la nouvelle est refusée, l'ancienne reste intacte).
 */
function createSale(input: SaleInput): Receipt {
  const db = getDb()
  if (!input.items.length) throw new Error('Le panier est vide.')

  return db.transaction((): Receipt => {
    const cfg = getSettings() // règles de vente lues dans les paramètres (Paramètres > Ventes)
    if (!cfg.sales_payment_methods.split(',').includes(input.method)) throw new Error('Mode de paiement non autorisé.')
    // Paramètres > Caisse : pas d'encaissement tant que la caisse n'est pas ouverte avec son fond.
    if (cfg.cash_session_required === '1' && !db.prepare(`SELECT 1 FROM cash_sessions WHERE status = 'ouverte'`).get())
      throw new Error('La caisse n’est pas ouverte : ouvrez-la (fond de caisse) avant d’encaisser.')
    if (input.replaces) reverseSale(db, input.replaces, 'Modifiée : remplacée par une nouvelle vente')

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

    // Le client peut être lié à n'importe quelle vente (historique, factures) ; il est obligatoire pour un crédit.
    let client: { id: number; name: string; credit_limit: number; balance: number } | null = null
    if (input.clientId) {
      client = db.prepare('SELECT id, name, credit_limit, balance FROM clients WHERE id = ? AND active = 1').get(input.clientId) as any
      if (!client) throw new Error('Client introuvable.')
    }
    // Vente à crédit : le client doit rester sous son plafond. L'avance éventuelle est encaissée.
    const isCredit = input.method === 'credit'
    let paidNow = total
    let due = 0
    if (isCredit) {
      if (!client) throw new Error('Choisissez un client pour une vente à crédit.')
      paidNow = Math.min(Math.max(received, 0), total)
      due = total - paidNow
      if (client.balance + due > client.credit_limit)
        throw new Error(`Plafond de crédit dépassé (autorisé : ${fromMillimes(client.credit_limit)} DT, dette actuelle : ${fromMillimes(client.balance)} DT).`)
    }

    // Numéro lisible : AAAAMMJJ-0001, remis à zéro chaque jour (les ventes annulées gardent leur numéro).
    const day = new Date().toLocaleDateString('sv-SE').replace(/-/g, '')
    const count = (db.prepare(`SELECT COUNT(*) AS n FROM sales WHERE date(created_at) = date('now','localtime')`).get() as any).n
    const number = `${day}-${String(count + 1).padStart(4, '0')}`

    const sale = db.prepare(`INSERT INTO sales(number, client_id, user_id, total, discount, paid, method) VALUES (?,?,?,?,?,?,?)`)
      .run(number, client?.id ?? null, currentUser()?.id ?? null, total, discount, paidNow, input.method)
    const saleId = Number(sale.lastInsertRowid)
    if (due > 0) db.prepare('UPDATE clients SET balance = balance + ? WHERE id = ?').run(due, client!.id)
    if (input.replaces) db.prepare('UPDATE sales SET replaced_by = ? WHERE id = ?').run(saleId, input.replaces)

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
      due: fromMillimes(due), clientName: client?.name ?? null,
      method: input.method
    }
  })()
}

// ---------- Consultation des ventes ----------
const SELECT_SALES = `
  SELECT s.id, s.number, s.created_at, s.client_id, c.name AS client_name, s.total, s.discount, s.paid, s.method, s.status,
         s.cancel_reason, s.replaced_by, u.full_name AS cashier,
         (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) AS item_count
  FROM sales s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN users u ON u.id = s.user_id`

const mapSale = (r: any): SaleSummary => ({
  id: r.id, number: r.number, createdAt: r.created_at, clientId: r.client_id, clientName: r.client_name, total: fromMillimes(r.total),
  discount: fromMillimes(r.discount), paid: fromMillimes(r.paid), due: fromMillimes(r.total - r.paid), method: r.method, status: r.status,
  cancelReason: r.cancel_reason, replacedBy: r.replaced_by, cashier: r.cashier, itemCount: r.item_count
})

function listSales(scope: 'today' | 'week' | 'all', search: string): SaleSummary[] {
  const where = scope === 'today' ? `date(s.created_at) = date('now','localtime')` : scope === 'week' ? `date(s.created_at) >= date('now','localtime','-6 days')` : '1 = 1'
  const like = `%${String(search ?? '').trim()}%`
  return (getDb().prepare(`${SELECT_SALES} WHERE ${where} AND (? = '%%' OR s.number LIKE ? OR c.name LIKE ?) ORDER BY s.id DESC LIMIT 200`).all(like, like, like) as any[]).map(mapSale)
}

function getSale(id: number): SaleDetail {
  const db = getDb()
  const r = db.prepare(`${SELECT_SALES} WHERE s.id = ?`).get(id) as any
  if (!r) throw new Error('Vente introuvable.')
  const lines = (db.prepare(`SELECT i.article_id, a.designation, a.unit, i.quantity, i.unit_price FROM sale_items i JOIN articles a ON a.id = i.article_id WHERE i.sale_id = ? ORDER BY i.id`).all(id) as any[])
    .map((l) => ({ articleId: l.article_id, designation: l.designation, unit: l.unit, quantity: l.quantity, unitPrice: fromMillimes(l.unit_price) }))
  let editable = r.status === 'validee'
  if (editable) try { assertCanEdit({ created_at: r.created_at }) } catch { editable = false }
  return { ...mapSale(r), lines, editable }
}

export function registerSalesHandlers(): void {
  const wrap = <T,>(channel: string, fn: (...a: any[]) => T) =>
    ipcMain.handle(channel, (_e, ...args): Result<T> => {
      try { return { ok: true, data: fn(...args) } } catch (err: any) { return { ok: false, error: String(err?.message ?? err) } }
    })

  wrap('sales:create', (input: SaleInput) => createSale(input))
  wrap('sales:list', (scope: 'today' | 'week' | 'all', search: string) => listSales(scope, search))
  wrap('sales:get', (id: number) => getSale(id))
  wrap('sales:cancel', (id: number, reason: string) => { getDb().transaction(() => reverseSale(getDb(), id, reason))() })
}
