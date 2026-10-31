import { ipcMain } from 'electron'
import { getDb } from '../db'
import { getSettings } from '../settings'
import { currentUser } from './auth'
import { getCompany } from './invoices'
import { printHtml } from '../print/printer'
import { fromMillimes, toMillimes } from '@shared/money'
import type { Result } from '@shared/types'
import type { CashBreakdown, CashMovement, CashSession, CashSessionDetail, CloseInput } from '@shared/cash'

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
const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const formatMoney = (n: number) => `${money.format(n)} DT`
const sum = (sql: string, ...p: unknown[]): number => (db().prepare(sql).get(...p) as any)?.t ?? 0

const SELECT = `
  SELECT s.*, uo.full_name AS opened_name, uc.full_name AS closed_name
  FROM cash_sessions s LEFT JOIN users uo ON uo.id = s.opened_by LEFT JOIN users uc ON uc.id = s.closed_by`

const mapSession = (r: any): CashSession => ({
  id: r.id, status: r.status, openedAt: r.opened_at, openedBy: r.opened_name, openingFloat: fromMillimes(r.opening_float),
  closedAt: r.closed_at, closedBy: r.closed_name,
  expected: r.expected === null ? null : fromMillimes(r.expected), counted: r.counted === null ? null : fromMillimes(r.counted),
  gap: r.gap === null ? null : fromMillimes(r.gap), counts: r.counts ? JSON.parse(r.counts) : null, note: r.note
})

/**
 * Espèces attendues dans le tiroir pour une session (de son ouverture à sa clôture, ou à maintenant) :
 * fond + ventes en espèces + acomptes + règlements de dettes + factures en espèces + apports
 * − retraits − dépenses payées avec la caisse − remboursements de ventes plus anciennes annulées pendant la session.
 */
function breakdown(s: any): CashBreakdown {
  const start = s.opened_at
  const end = s.closed_at ?? (db().prepare(`SELECT datetime('now','localtime') AS d`).get() as any).d
  const win = `BETWEEN ? AND ?`
  const m = (sql: string, ...p: unknown[]) => sum(sql, ...p)
  const cashSales = m(`SELECT COALESCE(SUM(paid),0) t FROM sales WHERE method = 'especes' AND status = 'validee' AND created_at ${win}`, start, end)
  const creditAdvances = m(`SELECT COALESCE(SUM(paid),0) t FROM sales WHERE method = 'credit' AND status = 'validee' AND created_at ${win}`, start, end)
  const refunds = m(`SELECT COALESCE(SUM(paid),0) t FROM sales WHERE method IN ('especes','credit') AND status = 'annulee'
                     AND cancelled_at ${win} AND created_at < ?`, start, end, start)
  const creditRepayments = m(`SELECT COALESCE(SUM(amount),0) t FROM client_payments WHERE created_at ${win}`, start, end)
  const invoicePayments = m(`SELECT COALESCE(SUM(amount),0) t FROM invoice_payments WHERE method = 'Espèces' AND created_at ${win}`, start, end)
  const deposits = m(`SELECT COALESCE(SUM(amount),0) t FROM cash_movements WHERE session_id = ? AND type = 'apport'`, s.id)
  const withdrawals = m(`SELECT COALESCE(SUM(amount),0) t FROM cash_movements WHERE session_id = ? AND type = 'retrait'`, s.id)
  const expenses = m(`SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE from_cash = 1 AND status = 'payee'
                      AND (cash_session_id = ? OR (cash_session_id IS NULL AND paid_date BETWEEN date(?) AND date(?)))`, s.id, start, end)
  const cardSales = m(`SELECT COALESCE(SUM(total),0) t FROM sales WHERE method = 'carte' AND status = 'validee' AND created_at ${win}`, start, end)
  const cheq = db().prepare(`SELECT COUNT(*) n, COALESCE(SUM(amount),0) t FROM cheques WHERE direction = 'recu' AND status <> 'annule' AND created_at ${win}`).get(start, end) as any
  const salesCount = (db().prepare(`SELECT COUNT(*) n FROM sales WHERE status = 'validee' AND created_at ${win}`).get(start, end) as any).n
  const expected = s.opening_float + cashSales + creditAdvances + creditRepayments + invoicePayments + deposits - withdrawals - expenses - refunds
  const f = fromMillimes
  return {
    openingFloat: f(s.opening_float), cashSales: f(cashSales), creditAdvances: f(creditAdvances), creditRepayments: f(creditRepayments),
    invoicePayments: f(invoicePayments), deposits: f(deposits), withdrawals: f(withdrawals), expenses: f(expenses), refunds: f(refunds),
    expected: f(expected), cardSales: f(cardSales), chequesReceived: { count: cheq.n, total: f(cheq.t) }, salesCount
  }
}

function movements(sessionId: number): CashMovement[] {
  return (db().prepare(`SELECT m.*, u.full_name AS user_name FROM cash_movements m LEFT JOIN users u ON u.id = m.user_id
                        WHERE m.session_id = ? ORDER BY m.id`).all(sessionId) as any[])
    .map((r) => ({ id: r.id, type: r.type, amount: fromMillimes(r.amount), reason: r.reason, userName: r.user_name, createdAt: r.created_at }))
}

function detail(id: number): CashSessionDetail {
  const r = db().prepare(SELECT + ' WHERE s.id = ?').get(id) as any
  if (!r) throw new Error('Session de caisse introuvable.')
  // Session clôturée : on relit le calcul figé à la clôture (il ne doit plus bouger).
  const b: CashBreakdown = r.status === 'cloturee' && r.summary ? JSON.parse(r.summary) : breakdown(r)
  return { ...mapSession(r), breakdown: b, movements: movements(id) }
}

function openSession(): any {
  return db().prepare(`SELECT * FROM cash_sessions WHERE status = 'ouverte'`).get()
}

/** Comptage : nombre de billets / pièces par valeur -> total en millimes. Seules les valeurs paramétrées sont acceptées. */
function countTotal(counts: Record<string, number>): { total: number; clean: Record<string, number> } {
  const allowed = new Set(getSettings().cash_denominations.split(',').map((v) => Number(v)))
  const clean: Record<string, number> = {}
  let total = 0
  for (const [k, v] of Object.entries(counts ?? {})) {
    const value = Number(k), n = Math.round(Number(v))
    if (!n) continue
    if (!allowed.has(value)) throw new Error(`Valeur de billet ou de pièce inconnue : ${k}.`)
    if (n < 0 || n > 100000) throw new Error(`Nombre invalide pour ${k} DT.`)
    clean[String(value)] = n
    total += toMillimes(value) * n
  }
  return { total, clean }
}

function zTicketHtml(d: CashSessionDetail): string {
  const s = getSettings()
  const b = d.breakdown
  const esc = (x: string) => x.replace(/[<>&]/g, '')
  const row = (label: string, value: number, sign = '') => `<tr><td>${label}</td><td class="r">${sign}${formatMoney(value)}</td></tr>`
  const fmt = (t: string | null) => (t ? `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)} ${t.slice(11, 16)}` : '')
  const counts = Object.entries(d.counts ?? {}).sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([v, n]) => `<tr><td>${n} × ${formatMoney(Number(v))}</td><td class="r">${formatMoney(Number(v) * n)}</td></tr>`).join('')
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    body { font-family: "Segoe UI", Arial, sans-serif; width: ${s.print_ticket_paper}mm; padding: 3mm 4mm; font-size: 9pt; margin: 0; box-sizing: border-box; }
    h1 { font-size: 12pt; text-align: center; margin: 0; } h2 { font-size: 10pt; text-align: center; margin: 2px 0 6px; }
    table { width: 100%; border-collapse: collapse; } td { padding: 1px 0; } .r { text-align: right; white-space: nowrap; }
    .sep { border-top: 1px dashed #000; margin: 5px 0; } .b td { font-weight: bold; font-size: 10pt; } .muted { color: #444; }
  </style></head><body>
    <h1>${esc(getCompany().name || 'Quincaillerie')}</h1>
    <h2>Clôture de caisse n° ${d.id}</h2>
    <div>Ouverte : ${fmt(d.openedAt)}${d.openedBy ? ` (${esc(d.openedBy)})` : ''}</div>
    <div>Clôturée : ${fmt(d.closedAt)}${d.closedBy ? ` (${esc(d.closedBy)})` : ''}</div>
    <div>${b.salesCount} vente(s)</div>
    <div class="sep"></div>
    <table>
      ${row('Fond de caisse', b.openingFloat)}
      ${row('Ventes en espèces', b.cashSales, '+')}
      ${b.creditAdvances ? row('Acomptes (ventes à crédit)', b.creditAdvances, '+') : ''}
      ${b.creditRepayments ? row('Règlements de crédit', b.creditRepayments, '+') : ''}
      ${b.invoicePayments ? row('Factures réglées en espèces', b.invoicePayments, '+') : ''}
      ${b.deposits ? row('Apports', b.deposits, '+') : ''}
      ${b.withdrawals ? row('Retraits', b.withdrawals, '−') : ''}
      ${b.expenses ? row('Dépenses payées avec la caisse', b.expenses, '−') : ''}
      ${b.refunds ? row('Remboursements', b.refunds, '−') : ''}
    </table>
    <div class="sep"></div>
    <table>
      <tr class="b"><td>Espèces attendues</td><td class="r">${formatMoney(d.expected ?? b.expected)}</td></tr>
      <tr class="b"><td>Espèces comptées</td><td class="r">${formatMoney(d.counted ?? 0)}</td></tr>
      <tr class="b"><td>Écart</td><td class="r">${(d.gap ?? 0) > 0 ? '+' : ''}${formatMoney(d.gap ?? 0)}</td></tr>
    </table>
    ${d.note ? `<div class="muted">Explication : ${esc(d.note)}</div>` : ''}
    ${counts ? `<div class="sep"></div><table>${counts}</table>` : ''}
    <div class="sep"></div>
    <table class="muted">
      ${row('Ventes par carte', b.cardSales)}
      <tr><td>Chèques reçus (${b.chequesReceived.count})</td><td class="r">${formatMoney(b.chequesReceived.total)}</td></tr>
    </table>
    <div class="sep"></div>
    <div style="margin-top:14px">Signature :</div>
  </body></html>`
}

export function registerCashHandlers(): void {
  handle('cash:current', () => { const s = openSession(); return s ? detail(s.id) : null })

  handle('cash:open', (openingFloat: number) => {
    const amount = toMillimes(openingFloat)
    if (amount < 0) throw new Error('Fond de caisse invalide.')
    if (openSession()) throw new Error('La caisse est déjà ouverte.')
    const id = Number(db().prepare('INSERT INTO cash_sessions(opening_float, opened_by) VALUES (?, ?)').run(amount, currentUser()?.id ?? null).lastInsertRowid)
    return detail(id)
  })

  handle('cash:move', (type: 'apport' | 'retrait', amount: number, reason: string) => {
    const s = openSession()
    if (!s) throw new Error('La caisse n’est pas ouverte.')
    if (type !== 'apport' && type !== 'retrait') throw new Error('Type de mouvement inconnu.')
    const m = toMillimes(amount)
    if (!(m > 0)) throw new Error('Le montant doit être supérieur à zéro.')
    if (!String(reason ?? '').trim()) throw new Error('Indiquez le motif (ex. « Versement banque », « Monnaie »).')
    if (type === 'retrait' && m > toMillimes(breakdown(s).expected)) throw new Error('Le retrait dépasse les espèces attendues dans le tiroir.')
    db().prepare('INSERT INTO cash_movements(session_id, type, amount, reason, user_id) VALUES (?,?,?,?,?)').run(s.id, type, m, String(reason).trim(), currentUser()?.id ?? null)
    return detail(s.id)
  })

  handle('cash:close', async (input: CloseInput) => {
    const s = openSession()
    if (!s) throw new Error('La caisse n’est pas ouverte.')
    const { total, clean } = countTotal(input.counts)
    const b = breakdown(s)
    const expected = toMillimes(b.expected)
    const gap = total - expected
    const tolerance = toMillimes(Number(getSettings().cash_gap_tolerance) || 0)
    const note = input.note?.trim() || null
    if (Math.abs(gap) > tolerance && !note) throw new Error(`Écart de ${formatMoney(fromMillimes(gap))} : expliquez-le avant de clôturer.`)
    db().transaction(() => {
      // Les dépenses de la caisse sans session (payées caisse fermée) sont rattachées à celle-ci : comptées une seule fois.
      db().prepare(`UPDATE expenses SET cash_session_id = ? WHERE from_cash = 1 AND status = 'payee' AND cash_session_id IS NULL
                    AND paid_date BETWEEN date(?) AND date('now','localtime')`).run(s.id, s.opened_at)
      db().prepare(`UPDATE cash_sessions SET status = 'cloturee', closed_at = datetime('now','localtime'), closed_by = ?, expected = ?, counted = ?, gap = ?,
                    counts = ?, summary = ?, note = ? WHERE id = ?`)
        .run(currentUser()?.id ?? null, expected, total, gap, JSON.stringify(clean), JSON.stringify(b), note, s.id)
    })()
    const d = detail(s.id)
    let printError: string | null = null
    if (getSettings().cash_print_z === '1') {
      try { await printHtml(zTicketHtml(d), 'ticket') } catch (e: any) { printError = String(e?.message ?? e) }
    }
    return { session: d, printError }
  })

  handle('cash:history', () => (db().prepare(SELECT + ' ORDER BY s.id DESC LIMIT 500').all() as any[]).map(mapSession))
  handle('cash:get', (id: number) => detail(id))
  handle('cash:printZ', async (id: number) => {
    const d = detail(id)
    if (d.status !== 'cloturee') throw new Error('La caisse n’est pas encore clôturée.')
    return printHtml(zTicketHtml(d), 'ticket')
  })
}
