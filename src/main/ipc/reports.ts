import { ipcMain } from 'electron'
import { getDb } from '../db'
import { fromMillimes as m } from '@shared/money'
import type { ReportData, ReportOptions, Result } from '@shared/types'

/** Calcule tous les indicateurs d'une période (dates incluses, format AAAA-MM-JJ). */
function buildReport(from: string, to: string, opts: ReportOptions = {}): ReportData {
  const db = getDb()
  const range = `date(s.created_at) BETWEEN ? AND ? AND s.status = 'validee'`

  const kpi = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS revenue FROM sales s WHERE ${range}`).get(from, to) as any
  const cost = db.prepare(`
    SELECT COALESCE(SUM(i.quantity * i.unit_cost),0) AS cost
    FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE ${range}`).get(from, to) as any

  // Marge par jour : CA du jour - coût des lignes du jour.
  const daily = db.prepare(`
    SELECT date(s.created_at) AS day, SUM(s.total) AS revenue,
           SUM(s.total) - COALESCE(SUM((SELECT SUM(i.quantity * i.unit_cost) FROM sale_items i WHERE i.sale_id = s.id)),0) AS margin
    FROM sales s WHERE ${range} GROUP BY day ORDER BY day`).all(from, to) as any[]

  const byMethod = db.prepare(`SELECT method, SUM(total) AS total FROM sales s WHERE ${range} GROUP BY method`).all(from, to) as any[]

  const byCategory = db.prepare(`
    SELECT COALESCE(c.name, 'Sans catégorie') AS name, SUM(ROUND(i.quantity * i.unit_price)) AS total
    FROM sale_items i JOIN sales s ON s.id = i.sale_id
    JOIN articles a ON a.id = i.article_id LEFT JOIN categories c ON c.id = a.category_id
    WHERE ${range} GROUP BY name ORDER BY total DESC LIMIT 12`).all(from, to) as any[]

  // Classement des articles : par CA, quantité ou marge, longueur réglable (Rapports > Personnaliser).
  const topBy = ({ total: 'total', quantity: 'quantity', margin: 'margin' } as const)[opts.topBy ?? 'total'] ?? 'total'
  const topCount = Math.min(50, Math.max(3, Math.round(Number(opts.topCount) || 8)))
  const top = db.prepare(`
    SELECT a.designation, SUM(i.quantity) AS quantity, SUM(ROUND(i.quantity * i.unit_price)) AS total,
           SUM(ROUND(i.quantity * (i.unit_price - i.unit_cost))) AS margin
    FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN articles a ON a.id = i.article_id
    WHERE ${range} GROUP BY a.id ORDER BY ${topBy} DESC LIMIT ${topCount}`).all(from, to) as any[]

  // Période précédente de même durée (ex. 1er–15 du mois -> les 15 jours d'avant), pour comparer.
  const span = db.prepare(`SELECT CAST(julianday(?) - julianday(?) AS INTEGER) + 1 AS n`).get(to, from) as any
  const prevTo = (db.prepare(`SELECT date(?, '-1 day') AS d`).get(from) as any).d
  const prevFrom = (db.prepare(`SELECT date(?, ?) AS d`).get(prevTo, `-${Math.max(0, span.n - 1)} days`) as any).d
  const pk = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS revenue FROM sales s WHERE ${range}`).get(prevFrom, prevTo) as any
  const pc = db.prepare(`SELECT COALESCE(SUM(i.quantity * i.unit_cost),0) AS cost FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE ${range}`)
    .get(prevFrom, prevTo) as any

  const debt = db.prepare('SELECT COALESCE(SUM(balance),0) AS v FROM clients WHERE active = 1').get() as any
  const stock = db.prepare('SELECT COALESCE(SUM(MAX(stock,0) * purchase_price),0) AS v FROM articles WHERE active = 1').get() as any

  return {
    from, to,
    revenue: m(kpi.revenue), salesCount: kpi.n,
    avgBasket: kpi.n ? m(kpi.revenue / kpi.n) : 0,
    grossMargin: m(kpi.revenue - Math.round(cost.cost)),
    clientDebt: m(debt.v), stockValue: m(stock.v),
    daily: daily.map((d) => ({ day: d.day, revenue: m(d.revenue), margin: m(d.margin) })),
    byMethod: byMethod.map((d) => ({ method: d.method, total: m(d.total) })),
    byCategory: byCategory.map((d) => ({ name: d.name, total: m(d.total) })),
    topArticles: top.map((d) => ({ designation: d.designation, quantity: d.quantity, total: m(d.total), margin: m(d.margin) })),
    previous: { from: prevFrom, to: prevTo, revenue: m(pk.revenue), grossMargin: m(pk.revenue - Math.round(pc.cost)), salesCount: pk.n,
      avgBasket: pk.n ? m(pk.revenue / pk.n) : 0 }
  }
}

export function registerReportHandlers(): void {
  ipcMain.handle('reports:get', (_e, from: string, to: string, options?: ReportOptions): Result<ReportData> => {
    try {
      return { ok: true, data: buildReport(from, to, options ?? {}) }
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) }
    }
  })
}
