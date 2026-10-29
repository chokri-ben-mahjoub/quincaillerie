import { BrowserWindow, dialog, ipcMain } from 'electron'
import { tmpdir } from 'os'
import { join } from 'path'
import { unlinkSync, writeFileSync } from 'fs'
import { getDb } from '../db'
import { fromMillimes } from '@shared/money'
import type { Result, Ticket } from '@shared/types'
import { getCompany } from './invoices'
import { renderTicketHtml } from '../print/ticketTemplate'
import { printHtml } from '../print/printer'
import { getSettings } from '../settings'

const paperWidth = (): number => Number(getSettings().print_ticket_paper) || 80 // largeur du rouleau (Paramètres > Impression)


/** Reconstruit le ticket d'une vente depuis la base. `received` (montant remis) n'est pas stocké : il vient de l'écran de caisse. */
function readTicket(saleId: number, received?: number): Ticket {
  const db = getDb()
  const s = db.prepare(`
    SELECT s.*, c.name AS client_name, u.full_name AS cashier
    FROM sales s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?`).get(saleId) as any
  if (!s) throw new Error('Vente introuvable.')
  const items = db.prepare(`
    SELECT a.designation, a.unit, i.quantity, i.unit_price FROM sale_items i JOIN articles a ON a.id = i.article_id
    WHERE i.sale_id = ? ORDER BY i.id`).all(saleId) as any[]
  const lines = items.map((i) => ({
    designation: i.designation, unit: i.unit, quantity: i.quantity, unitPrice: fromMillimes(i.unit_price),
    total: fromMillimes(Math.round(i.quantity * i.unit_price))
  }))
  const total = fromMillimes(s.total)
  const subtotal = lines.reduce((sum, l) => sum + l.total, 0)
  const hasReceived = s.method === 'especes' && typeof received === 'number' && received >= total
  return {
    id: s.id, number: s.number, createdAt: s.created_at, shopName: getCompany().name, lines,
    subtotal, discount: fromMillimes(s.discount), total,
    received: hasReceived ? received! : fromMillimes(s.paid), change: hasReceived ? received! - total : 0,
    due: fromMillimes(s.total - s.paid), clientName: s.client_name ?? null, method: s.method, cashier: s.cashier ?? null
  }
}

/** Charge le ticket dans une fenêtre invisible et mesure sa hauteur (rouleau : longueur variable). */
async function withTicketWindow<T>(saleId: number, received: number | undefined, fn: (win: BrowserWindow, heightPx: number) => Promise<T>): Promise<T> {
  const html = renderTicketHtml(readTicket(saleId, received), getCompany(), paperWidth())
  const file = join(tmpdir(), `quincaillerie-ticket-${Date.now()}.html`)
  writeFileSync(file, html, 'utf8')
  const win = new BrowserWindow({ show: false, width: 320, height: 600, webPreferences: { sandbox: true, contextIsolation: true } })
  try {
    await win.loadFile(file)
    const h = (await win.webContents.executeJavaScript('document.documentElement.scrollHeight')) as number
    return await fn(win, Math.max(h, 200))
  } finally {
    win.destroy()
    try { unlinkSync(file) } catch { /* déjà supprimé */ }
  }
}

const toPdf = (saleId: number, received?: number): Promise<Buffer> =>
  withTicketWindow(saleId, received, (win, h) =>
    win.webContents.printToPDF({
      printBackground: true,
      pageSize: { width: paperWidth() / 25.4, height: (h + 8) / 96 }, // pouces
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    }))

export function registerTicketHandlers(): void {
  const ownerOf = (e: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender)
  const wrap = <T,>(channel: string, fn: (e: Electron.IpcMainInvokeEvent, ...a: any[]) => Promise<T>) =>
    ipcMain.handle(channel, async (e, ...args): Promise<Result<T>> => {
      try { return { ok: true, data: await fn(e, ...args) } } catch (err: any) { return { ok: false, error: String(err?.message ?? err) } }
    })

  // Impression : imprimante, copies et mode direct viennent de Paramètres > Impression.
  wrap('tickets:print', (_e, saleId: number, received?: number) =>
    printHtml(renderTicketHtml(readTicket(saleId, received), getCompany(), paperWidth()), 'ticket'))

  // Aperçu : le ticket au format réel (80 mm) dans une fenêtre avec le lecteur PDF.
  wrap('tickets:preview', async (e, saleId: number, received?: number) => {
    const pdf = await toPdf(saleId, received)
    const file = join(tmpdir(), `apercu-ticket-${Date.now()}.pdf`)
    writeFileSync(file, pdf)
    const win = new BrowserWindow({ width: 420, height: 760, title: 'Aperçu du ticket', autoHideMenuBar: true,
      parent: ownerOf(e) ?? undefined, webPreferences: { sandbox: true, contextIsolation: true } })
    await win.loadFile(file)
  })

  wrap('tickets:export', async (e, saleId: number, received?: number) => {
    const pdf = await toPdf(saleId, received)
    const r = await dialog.showSaveDialog(ownerOf(e)!, { title: 'Exporter le ticket', defaultPath: `Ticket-${readTicket(saleId).number}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (r.canceled || !r.filePath) return null
    writeFileSync(r.filePath, pdf)
    return r.filePath
  })
}
