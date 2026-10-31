import { ipcMain } from 'electron'
import { getDb } from '../db'
import { getSettings } from '../settings'
import { isAllowed } from './auth'
import { fromMillimes } from '@shared/money'
import type { Result } from '@shared/types'
import type { DashboardData, NavBadges } from '@shared/dashboard'

function handle<T>(channel: string, fn: (...args: any[]) => T): void {
  ipcMain.handle(channel, (_e, ...args): Result<T> => {
    try {
      return { ok: true, data: fn(...args) }
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) }
    }
  })
}

const one = (sql: string, ...params: unknown[]): any => getDb().prepare(sql).get(...params)

// Même règle que l'écran Stock (Paramètres > Stock : alertes et marge).
function stockCondition(): string {
  const s = getSettings()
  const margin = 1 + Number(s.stock_alert_margin_pct || 0) / 100
  return s.stock_alerts_enabled === '1' ? `(stock <= 0 OR (min_stock > 0 AND stock <= min_stock * ${margin}))` : 'stock <= 0'
}

function salesSection(): DashboardData['sales'] {
  const db = getDb()
  const today = `date(s.created_at) = date('now','localtime')`
  const valid = `s.status = 'validee'`
  const head = one(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(total - paid), 0) AS due
                    FROM sales s WHERE ${today} AND ${valid}`)
  const cost = one(`SELECT COALESCE(SUM(i.quantity * i.unit_cost), 0) AS c FROM sale_items i JOIN sales s ON s.id = i.sale_id
                    WHERE ${today} AND ${valid}`).c
  const cancelled = one(`SELECT COUNT(*) AS n FROM sales s WHERE ${today} AND s.status = 'annulee'`).n
  // Hier jusqu'à la même heure : la comparaison reste juste en pleine journée.
  const yesterday = one(`SELECT COALESCE(SUM(total), 0) AS t FROM sales s WHERE ${valid}
                         AND date(s.created_at) = date('now','localtime','-1 day') AND time(s.created_at) <= time('now','localtime')`).t
  const hours = db.prepare(`
    SELECT CAST(strftime('%H', s.created_at) AS INTEGER) AS h,
           SUM(CASE WHEN date(s.created_at) = date('now','localtime') THEN total ELSE 0 END) AS today,
           SUM(CASE WHEN date(s.created_at) = date('now','localtime','-1 day') THEN total ELSE 0 END) AS yesterday
    FROM sales s WHERE ${valid} AND date(s.created_at) >= date('now','localtime','-1 day') GROUP BY h`).all() as any[]
  // Plage affichée : au moins 8 h – 19 h, élargie si des ventes tombent en dehors.
  const lo = Math.min(8, ...hours.map((r) => r.h)), hi = Math.max(19, ...hours.map((r) => r.h))
  const byHour = Array.from({ length: hi - lo + 1 }, (_, i) => {
    const r = hours.find((x) => x.h === lo + i)
    return { hour: lo + i, today: fromMillimes(r?.today ?? 0), yesterday: fromMillimes(r?.yesterday ?? 0) }
  })
  const byMethod = (db.prepare(`SELECT method, SUM(total) AS t FROM sales s WHERE ${today} AND ${valid} GROUP BY method ORDER BY t DESC`).all() as any[])
    .map((r) => ({ method: r.method, total: fromMillimes(r.t) }))
  const last = (db.prepare(`SELECT s.id, s.number, s.created_at, c.name AS client_name, s.total, s.method, s.status
                            FROM sales s LEFT JOIN clients c ON c.id = s.client_id WHERE ${today} ORDER BY s.id DESC LIMIT 6`).all() as any[])
    .map((r) => ({ id: r.id, number: r.number, time: r.created_at.slice(11, 16), clientName: r.client_name, total: fromMillimes(r.total),
      method: r.method, cancelled: r.status === 'annulee' }))
  const cashOut = one(`SELECT COALESCE(SUM(amount), 0) AS t FROM expenses WHERE status = 'payee' AND from_cash = 1 AND paid_date = date('now','localtime')`).t
  return {
    cashOut: fromMillimes(cashOut),
    count: head.n, total: fromMillimes(head.total), margin: isAllowed('reports:get') ? fromMillimes(head.total - cost) : null,
    avgBasket: head.n ? fromMillimes(Math.round(head.total / head.n)) : 0, yesterdaySameTime: fromMillimes(yesterday),
    byHour, byMethod, creditToday: fromMillimes(head.due), cancelledCount: cancelled, last
  }
}

function stockSection(): DashboardData['stock'] {
  const cond = stockCondition()
  const counts = one(`SELECT SUM(stock <= 0) AS out, SUM(stock > 0) AS low FROM articles WHERE active = 1 AND ${cond}`)
  const items = (getDb().prepare(`SELECT id, designation, stock, min_stock, unit FROM articles WHERE active = 1 AND ${cond}
                                  ORDER BY stock <= 0 DESC, stock - min_stock LIMIT 5`).all() as any[])
    .map((r) => ({ id: r.id, designation: r.designation, stock: r.stock, minStock: r.min_stock, unit: r.unit }))
  return { out: counts.out ?? 0, low: counts.low ?? 0, items }
}

function invoicesSection(): DashboardData['invoices'] {
  const rows = (getDb().prepare(`
    SELECT i.id, i.number, i.client_name, i.due_date, i.total_ttc - COALESCE((SELECT SUM(amount) FROM invoice_payments p WHERE p.invoice_id = i.id), 0) AS remaining,
           CAST(julianday(date('now','localtime')) - julianday(i.due_date) AS INTEGER) AS late
    FROM invoices i WHERE i.status = 'validee' AND remaining > 0
    ORDER BY (i.due_date IS NOT NULL AND i.due_date < date('now','localtime')) DESC, i.due_date, i.issue_date`).all() as any[])
  const overdue = rows.filter((r) => r.due_date && r.late > 0)
  const sum = (xs: any[]) => fromMillimes(xs.reduce((s, r) => s + r.remaining, 0))
  return {
    unpaidCount: rows.length, unpaidTotal: sum(rows), overdueCount: overdue.length, overdueTotal: sum(overdue),
    items: rows.slice(0, 5).map((r) => ({ id: r.id, number: r.number, clientName: r.client_name, dueDate: r.due_date,
      remaining: fromMillimes(r.remaining), overdueDays: r.due_date && r.late > 0 ? r.late : 0 }))
  }
}

function lotsSection(): DashboardData['lots'] {
  const q = one(`SELECT SUM(expiry_date < date('now','localtime')) AS expired,
                        SUM(expiry_date BETWEEN date('now','localtime') AND date('now','localtime','+60 days')) AS soon
                 FROM lots WHERE quantity_left > 0.0005 AND expiry_date IS NOT NULL`)
  return { expired: q.expired ?? 0, soon: q.soon ?? 0, pending: pendingReceptions() }
}

function pendingReceptions(): number {
  return one(`SELECT COUNT(*) AS n FROM (
    SELECT pi.purchase_id, pi.article_id, SUM(pi.quantity) AS q,
           COALESCE((SELECT SUM(quantity_in) FROM lots WHERE purchase_id = pi.purchase_id AND article_id = pi.article_id), 0) AS done
    FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
    JOIN articles a ON a.id = pi.article_id AND a.tracking <> 'aucun' AND a.active = 1
    WHERE p.created_at >= COALESCE(a.tracking_since, '9999')
    GROUP BY pi.purchase_id, pi.article_id HAVING done < q - 0.0005)`).n
}

/** Dépenses à payer : en retard, ou dont l'échéance tombe dans les X jours (Paramètres > Dépenses). */
function expensesSection(): DashboardData['expenses'] {
  const days = Number(getSettings().expenses_remind_days) || 0
  const rows = getDb().prepare(`
    SELECT e.id, e.label, c.name AS category_name, e.amount, COALESCE(e.due_date, e.expense_date) AS due,
           COALESCE(e.due_date, e.expense_date) < date('now','localtime') AS overdue
    FROM expenses e JOIN expense_categories c ON c.id = e.category_id
    WHERE e.status = 'a_payer' AND COALESCE(e.due_date, e.expense_date) <= date('now','localtime', ?)
    ORDER BY due`).all(`+${days} days`) as any[]
  return {
    dueCount: rows.length, dueTotal: fromMillimes(rows.reduce((s, r) => s + r.amount, 0)), overdueCount: rows.filter((r) => r.overdue).length,
    items: rows.slice(0, 4).map((r) => ({ id: r.id, label: r.label, categoryName: r.category_name, amount: fromMillimes(r.amount), dueDate: r.due, overdue: !!r.overdue }))
  }
}

function today(): DashboardData {
  return {
    sales: isAllowed('sales:list') ? salesSection() : null,
    stock: isAllowed('stock:movements') ? stockSection() : null,
    invoices: isAllowed('invoices:list') ? invoicesSection() : null,
    clients: isAllowed('clients:create') ? (() => {
      const r = one('SELECT COUNT(*) AS n, COALESCE(SUM(balance), 0) AS t FROM clients WHERE active = 1 AND balance > 0')
      return { debtorCount: r.n, debtTotal: fromMillimes(r.t) }
    })() : null,
    lots: isAllowed('trace:lots') ? lotsSection() : null,
    expenses: isAllowed('expenses:list') ? expensesSection() : null
  }
}

/** Compteurs légers pour les pastilles de la barre latérale (rappelés régulièrement). */
function badges(): NavBadges {
  const out: NavBadges = {}
  if (isAllowed('stock:movements')) out.stock = one(`SELECT COUNT(*) AS n FROM articles WHERE active = 1 AND ${stockCondition()}`).n
  if (isAllowed('invoices:list')) out.factures = one(`
    SELECT COUNT(*) AS n FROM invoices i WHERE i.status = 'validee' AND i.due_date < date('now','localtime')
    AND i.total_ttc > COALESCE((SELECT SUM(amount) FROM invoice_payments p WHERE p.invoice_id = i.id), 0)`).n
  if (isAllowed('trace:lots')) out.tracabilite = pendingReceptions()
  if (isAllowed('expenses:list')) out.depenses = one(`SELECT COUNT(*) AS n FROM expenses WHERE status = 'a_payer'
    AND COALESCE(due_date, expense_date) <= date('now','localtime', ?)`, `+${Number(getSettings().expenses_remind_days) || 0} days`).n
  return out
}

export function registerDashboardHandlers(): void {
  handle('dashboard:today', () => today())
  handle('dashboard:badges', () => badges())
}
