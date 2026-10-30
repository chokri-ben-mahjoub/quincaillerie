import { BrowserWindow, dialog, ipcMain } from 'electron'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { getDb } from '../db'
import { getSettings } from '../settings'
import { formatDocNumber } from '@shared/settings'
import { fromMillimes, toMillimes } from '@shared/money'
import {
  computeTotals, type CompanyInfo, type DocKind, type Invoice, type InvoiceInput, type InvoicePayment, type InvoicePaymentInput,
  type InvoiceSummary, type Quote
} from '@shared/invoice'
import type { Result } from '@shared/types'
import { footerTemplate, renderInvoiceHtml, type PrintExtras } from '../print/invoiceTemplate'
import { htmlToPdf } from '../print/pdf'
import { printHtml } from '../print/printer'
import { currentUser } from './auth'

function handle<T>(channel: string, fn: (...args: any[]) => T | Promise<T>): void {
  ipcMain.handle(channel, async (_e, ...args): Promise<Result<T>> => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err).replace(/^SqliteError: /, '') }
    }
  })
}

// Facture et devis partagent la même logique : seules les tables, le préfixe de numéro et le statut « validé » changent.
export const KINDS = {
  facture: { head: 'invoices', items: 'invoice_items', fk: 'invoice_id', counter: 'facture', validStatus: 'validee', label: 'Facture' },
  devis: { head: 'quotes', items: 'quote_items', fk: 'quote_id', counter: 'devis', validStatus: 'valide', label: 'Devis' },
  bon_livraison: { head: 'delivery_notes', items: 'dn_items', fk: 'dn_id', counter: 'bon_livraison', validStatus: 'valide', label: 'Bon-de-livraison' },
  bon_commande: { head: 'purchase_orders', items: 'po_items', fk: 'po_id', counter: 'bon_commande', validStatus: 'valide', label: 'Bon-de-commande' }
} as const
type Kind = (typeof KINDS)[DocKind]

// ---------- Infos société et réglages de documents (lus depuis les paramètres) ----------
export function getCompany(): CompanyInfo {
  const s = getSettings()
  const shop = (getDb().prepare(`SELECT value FROM settings WHERE key = 'shop_name'`).get() as any)?.value ?? ''
  return {
    name: s.company_name || shop, taxId: s.company_mf, rc: s.company_rc, address: s.company_address, phone: s.company_phone,
    email: s.company_email, website: s.company_website, bank: s.company_bank, rib: s.company_rib, logo: s.company_logo,
    footer: s.company_footer, accentColor: s.doc_accent_color,
    layout: s.doc_layout === 'moderne' ? 'moderne' : 'classique', headerTitle: s.doc_header_title,
    showCode: s.doc_show_code === '1', showSignatures: s.doc_show_signatures === '1',
    conditions: { facture: s.doc_conditions_facture, devis: s.doc_conditions_devis,
                  bon_commande: s.doc_conditions_bon_commande, bon_livraison: s.doc_conditions_bon_livraison },
    rates: s.tax_rates.split(',').map(Number), defaultTva: Number(s.tax_default_rate),
    timbreAmount: Number(s.tax_timbre_amount), timbreDefault: s.tax_timbre_default === '1',
    pricesMode: s.tax_prices_mode === 'TTC' ? 'TTC' : 'HT',
    quoteValidityDays: Number(s.doc_quote_validity_days), invoiceDueDays: Number(s.doc_invoice_due_days)
  }
}

// ---------- Lecture ----------
export function readDoc(k: Kind, id: number): Invoice & { convertedInvoiceId?: number | null } {
  const db = getDb()
  const r = db.prepare(`SELECT * FROM ${k.head} WHERE id = ?`).get(id) as any
  if (!r) throw new Error(`${k.label} introuvable.`)
  const items = db.prepare(`SELECT * FROM ${k.items} WHERE ${k.fk} = ? ORDER BY position`).all(id) as any[]
  const lines = items.map((i) => ({
    designation: i.designation, unit: i.unit, quantity: i.quantity, unitPrice: fromMillimes(i.unit_price),
    discountPct: i.discount_pct, tvaRate: i.tva_rate
  }))
  const timbreAmount = fromMillimes(r.timbre_amount)
  return {
    id: r.id, number: r.number, status: r.status, validatedAt: r.validated_at,
    clientId: r.client_id, clientName: r.client_name, clientAddress: r.client_address,
    clientTaxId: r.client_tax_id, clientPhone: r.client_phone,
    issueDate: r.issue_date, dueDate: r.due_date, paymentMethod: r.payment_method, notes: r.notes,
    representative: r.representative ?? '',
    timbre: r.timbre_amount > 0, timbreAmount, lines,
    totals: computeTotals(lines, r.timbre_amount > 0, timbreAmount),
    convertedInvoiceId: r.converted_invoice_id
  }
}

// ---------- Écriture ----------
function validateInput(i: InvoiceInput): void {
  if (!i.clientName.trim()) throw new Error('Le nom du client est obligatoire.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.issueDate)) throw new Error('Date invalide.')
  if (!i.lines.length) throw new Error('Ajoutez au moins une ligne.')
  i.lines.forEach((l, n) => {
    if (!l.designation.trim()) throw new Error(`Ligne ${n + 1} : désignation manquante.`)
    if (!(l.quantity > 0)) throw new Error(`Ligne ${n + 1} : quantité invalide.`)
    if (l.unitPrice < 0) throw new Error(`Ligne ${n + 1} : prix invalide.`)
    if (l.discountPct < 0 || l.discountPct > 100) throw new Error(`Ligne ${n + 1} : remise invalide.`)
  })
}

/** Enregistre un brouillon (création ou remplacement des lignes). Hors brouillon, la base refuse (triggers). */
export function saveDoc(k: Kind, id: number | null, i: InvoiceInput): number {
  validateInput(i)
  const db = getDb()
  const company = getCompany()
  const timbreMm = i.timbre ? toMillimes(company.timbreAmount) : 0
  const totals = computeTotals(i.lines, i.timbre, company.timbreAmount) // calcul faisant foi : celui du serveur

  return db.transaction(() => {
    // Représentant : celui saisi, sinon l'utilisateur connecté (nom complet).
    const representative = (i.representative ?? '').trim() || currentUser()?.fullName || ''
    const fields = [i.clientId, i.clientName.trim(), i.clientAddress.trim(), i.clientTaxId.trim(), i.clientPhone.trim(),
      i.issueDate, i.dueDate || null, i.paymentMethod, i.notes.trim(), timbreMm, toMillimes(totals.totalTtc), representative]
    let docId = id
    if (docId === null) {
      docId = Number(db.prepare(`INSERT INTO ${k.head}(client_id, client_name, client_address, client_tax_id, client_phone,
        issue_date, due_date, payment_method, notes, timbre_amount, total_ttc, representative) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(...fields).lastInsertRowid)
    } else {
      db.prepare(`UPDATE ${k.head} SET client_id=?, client_name=?, client_address=?, client_tax_id=?, client_phone=?,
        issue_date=?, due_date=?, payment_method=?, notes=?, timbre_amount=?, total_ttc=?, representative=? WHERE id=?`).run(...fields, docId)
      db.prepare(`DELETE FROM ${k.items} WHERE ${k.fk} = ?`).run(docId)
    }
    const add = db.prepare(`INSERT INTO ${k.items}(${k.fk}, position, designation, unit, quantity, unit_price, discount_pct, tva_rate)
                            VALUES (?,?,?,?,?,?,?,?)`)
    i.lines.forEach((l, n) => add.run(docId, n + 1, l.designation.trim(), l.unit, l.quantity, toMillimes(l.unitPrice), l.discountPct, l.tvaRate))
    return docId
  })()
}

/** Validation : attribue le numéro suivant (continu, par année) et fige le document. */
export function validateDoc(k: Kind, id: number): string {
  const db = getDb()
  return db.transaction(() => {
    const doc = db.prepare(`SELECT status, issue_date FROM ${k.head} WHERE id = ?`).get(id) as any
    if (!doc) throw new Error(`${k.label} introuvable.`)
    if (doc.status !== 'brouillon') throw new Error('Déjà validé.')
    const year = parseInt(doc.issue_date.slice(0, 4), 10)
    const cfg = getSettings()
    // Compteur par année, ou continu (année 0) si le réglage « repartir à 1 chaque année » est désactivé.
    const counterYear = cfg.doc_reset_yearly === '1' ? year : 0
    db.prepare(`INSERT INTO doc_counters(doc_type, year, last) VALUES (?, ?, 1)
                ON CONFLICT(doc_type, year) DO UPDATE SET last = last + 1`).run(k.counter, counterYear)
    const { last } = db.prepare('SELECT last FROM doc_counters WHERE doc_type = ? AND year = ?').get(k.counter, counterYear) as any
    const number = formatDocNumber({
      prefix: cfg['doc_prefix_' + k.counter], separator: cfg.doc_separator,
      includeYear: cfg.doc_include_year === '1', digits: Number(cfg.doc_number_digits)
    }, year, last)
    db.prepare(`UPDATE ${k.head} SET status = ?, number = ?, validated_at = datetime('now','localtime') WHERE id = ?`)
      .run(k.validStatus, number, id)
    return number
  })()
}

/** Devis -> brouillon de facture (mêmes lignes et client). Le devis passe à « converti » dans la même transaction. */
export function convertQuote(id: number): number {
  const db = getDb()
  return db.transaction(() => {
    const q = readDoc(KINDS.devis, id) as Quote
    if (q.status !== 'valide' && q.status !== 'accepte') throw new Error('Seul un devis validé ou accepté peut être converti.')
    const company = getCompany()
    const invoiceId = saveDoc(KINDS.facture, null, {
      clientId: q.clientId, clientName: q.clientName, clientAddress: q.clientAddress, clientTaxId: q.clientTaxId,
      clientPhone: q.clientPhone, issueDate: new Date().toLocaleDateString('sv-SE'), dueDate: null,
      paymentMethod: 'Espèces', notes: `Réf. devis ${q.number}`, timbre: company.timbreAmount > 0, lines: q.lines,
      representative: q.representative
    })
    db.prepare(`UPDATE quotes SET status = 'converti', converted_invoice_id = ? WHERE id = ?`).run(invoiceId, id)
    return invoiceId
  })()
}

// ---------- Impression ----------
/**
 * Données d'affichage qui ne sont pas stockées sur le document : code de chaque article (retrouvé par sa désignation
 * dans le catalogue), code client et référence d'origine (devis converti en facture).
 */
function printExtras(kind: DocKind, doc: Invoice): PrintExtras {
  const db = getDb()
  const byName = db.prepare(`SELECT barcode FROM articles WHERE designation = ? COLLATE NOCASE ORDER BY active DESC, id LIMIT 1`)
  const codes = doc.lines.map((l) => ((byName.get(l.designation) as any)?.barcode as string) ?? '')
  const clientCode = doc.clientId ? (kind === 'bon_commande' ? 'F' : 'C') + String(doc.clientId).padStart(6, '0') : ''
  let reference = ''
  let paid: number | undefined
  if (kind === 'facture') {
    const q = db.prepare(`SELECT number FROM quotes WHERE converted_invoice_id = ?`).get(doc.id) as any
    if (q?.number) reference = `Devis ${q.number}`
    if (doc.status !== 'brouillon') paid = fromMillimes(paidMillimes(doc.id))
  }
  return { codes, clientCode, reference, paid }
}

// ---------- Règlements de factures ----------
const paidMillimes = (invoiceId: number): number =>
  (getDb().prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM invoice_payments WHERE invoice_id = ?`).get(invoiceId) as any).s

function listPayments(invoiceId: number): InvoicePayment[] {
  return (getDb().prepare(`SELECT p.*, u.full_name FROM invoice_payments p LEFT JOIN users u ON u.id = p.user_id
                           WHERE p.invoice_id = ? ORDER BY p.pay_date, p.id`).all(invoiceId) as any[])
    .map((r) => ({ id: r.id, payDate: r.pay_date, amount: fromMillimes(r.amount), method: r.method, reference: r.reference, userName: r.full_name ?? '' }))
}

function addPayment(invoiceId: number, p: InvoicePaymentInput): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.payDate)) throw new Error('Date de règlement invalide.')
  const amount = toMillimes(Number(p.amount) || 0)
  if (amount <= 0) throw new Error('Le montant doit être supérieur à zéro.')
  // Les contrôles « facture validée » et « pas au-delà du reste » sont aussi faits par le trigger de la base.
  getDb().prepare(`INSERT INTO invoice_payments(invoice_id, pay_date, amount, method, reference, user_id) VALUES (?,?,?,?,?,?)`)
    .run(invoiceId, p.payDate, amount, String(p.method || 'Espèces'), String(p.reference ?? '').trim().slice(0, 80), currentUser()?.id ?? null)
}

function deletePayment(paymentId: number): void {
  // Annuler un encaissement : réservé au gérant et à l'administrateur.
  if (currentUser()?.role === 'caissier') throw new Error('Seul un gérant ou un administrateur peut supprimer un règlement.')
  const r = getDb().prepare(`DELETE FROM invoice_payments WHERE id = ?`).run(paymentId)
  if (!r.changes) throw new Error('Règlement introuvable.')
}

/** Zone imprimable en px CSS (96 dpi) : A4 moins les marges de printToPDF (pdf.ts) ou de print() (printer.ts). */
const PDF_PAGE = { width: 717, height: 1010 }
const PRINT_PAGE = { width: 733, height: 1040 }

function docHtml(kind: DocKind, id: number, page: { width: number; height: number }): { html: string; doc: Invoice } {
  const doc = readDoc(KINDS[kind], id)
  return { doc, html: renderInvoiceHtml(doc, getCompany(), kind, { ...printExtras(kind, doc), page }) }
}

export async function buildPdf(kind: DocKind, id: number): Promise<{ pdf: Buffer; name: string }> {
  const { doc, html } = docHtml(kind, id, PDF_PAGE)
  const pdf = await htmlToPdf(html, footerTemplate(getCompany(), doc.number, kind))
  return { pdf, name: `${KINDS[kind].label}-${doc.number ?? 'brouillon-' + id}.pdf` }
}

/** Aperçu avant impression : le PDF s'ouvre dans une fenêtre avec le lecteur intégré (impression et enregistrement en un clic). */
async function previewDoc(kind: DocKind, id: number, owner: BrowserWindow | null): Promise<void> {
  const { pdf, name } = await buildPdf(kind, id)
  const file = join(tmpdir(), `apercu-${Date.now()}-${name}`)
  writeFileSync(file, pdf)
  const win = new BrowserWindow({
    width: 1000, height: 900, title: `Aperçu — ${name}`, autoHideMenuBar: true, parent: owner ?? undefined,
    webPreferences: { sandbox: true, contextIsolation: true }
  })
  await win.loadFile(file)
}

async function exportDoc(kind: DocKind, id: number, owner: BrowserWindow | null): Promise<string | null> {
  const { pdf, name } = await buildPdf(kind, id)
  const r = await dialog.showSaveDialog(owner!, { title: 'Exporter en PDF', defaultPath: name, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
  if (r.canceled || !r.filePath) return null
  writeFileSync(r.filePath, pdf)
  return r.filePath
}

export function registerInvoiceHandlers(): void {
  const db = () => getDb()
  const ownerOf = (e: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender)

  handle('company:get', () => getCompany())
  handle('invoices:payments', (id: number) => listPayments(id))
  handle('invoices:pay', (id: number, p: InvoicePaymentInput) => addPayment(id, p))
  handle('invoices:unpay', (paymentId: number) => deletePayment(paymentId))

  // Mêmes canaux pour les quatre types : invoices:*, quotes:*, orders:* et deliveries:*
  const NAMESPACES = { facture: 'invoices', devis: 'quotes', bon_commande: 'orders', bon_livraison: 'deliveries' } as const
  for (const kind of ['facture', 'devis', 'bon_commande', 'bon_livraison'] as const) {
    const k = KINDS[kind]
    const ns = NAMESPACES[kind]
    const paidCol = kind === 'facture' ? `, (SELECT COALESCE(SUM(amount), 0) FROM invoice_payments p WHERE p.invoice_id = d.id) AS paid` : ''
    handle(`${ns}:list`, (): InvoiceSummary[] =>
      (db().prepare(`SELECT d.id, d.number, d.status, d.issue_date, d.client_name, d.total_ttc${paidCol} FROM ${k.head} d ORDER BY d.issue_date DESC, d.id DESC`).all() as any[])
        .map((r) => ({ id: r.id, number: r.number, status: r.status, issueDate: r.issue_date, clientName: r.client_name, totalTtc: fromMillimes(r.total_ttc),
                       ...(kind === 'facture' ? { paid: fromMillimes(r.paid) } : {}) })))
    handle(`${ns}:get`, (id: number) => readDoc(k, id))
    handle(`${ns}:save`, (id: number | null, i: InvoiceInput) => saveDoc(k, id, i))
    handle(`${ns}:validate`, (id: number) => validateDoc(k, id))
    handle(`${ns}:delete`, (id: number) => {
      const r = db().prepare(`DELETE FROM ${k.head} WHERE id = ? AND status = 'brouillon'`).run(id)
      if (!r.changes) throw new Error('Seuls les brouillons peuvent être supprimés.')
    })
    // Ces deux canaux ont besoin de la fenêtre appelante.
    ipcMain.handle(`${ns}:preview`, async (e, id: number): Promise<Result<void>> => {
      try { await previewDoc(kind, id, ownerOf(e)); return { ok: true, data: undefined } }
      catch (err: any) { return { ok: false, error: String(err?.message ?? err) } }
    })
    // Impression directe sur l'imprimante A4 choisie (Paramètres > Impression), copies comprises.
    ipcMain.handle(`${ns}:print`, async (_e, id: number): Promise<Result<boolean>> => {
      try { return { ok: true, data: await printHtml(docHtml(kind, id, PRINT_PAGE).html, 'a4') } }
      catch (err: any) { return { ok: false, error: String(err?.message ?? err) } }
    })
    ipcMain.handle(`${ns}:export`, async (e, id: number): Promise<Result<string | null>> => {
      try { return { ok: true, data: await exportDoc(kind, id, ownerOf(e)) } }
      catch (err: any) { return { ok: false, error: String(err?.message ?? err) } }
    })
  }

  // Spécifique aux devis
  handle('quotes:setStatus', (id: number, status: 'accepte' | 'refuse') => {
    if (status !== 'accepte' && status !== 'refuse') throw new Error('Statut invalide.')
    const r = db().prepare(`UPDATE quotes SET status = ? WHERE id = ? AND status IN ('valide','accepte','refuse')`).run(status, id)
    if (!r.changes) throw new Error('Ce devis ne peut plus changer de statut.')
  })
  handle('quotes:convert', (id: number) => convertQuote(id))
  handle('deliveries:setDelivered', (id: number) => {
    const r = db().prepare(`UPDATE delivery_notes SET status = 'livre' WHERE id = ? AND status = 'valide'`).run(id)
    if (!r.changes) throw new Error('Seul un bon de livraison validé peut être marqué livré.')
  })
  handle('orders:setReceived', (id: number) => {
    const r = db().prepare(`UPDATE purchase_orders SET status = 'recu' WHERE id = ? AND status = 'valide'`).run(id)
    if (!r.changes) throw new Error('Seul un bon de commande envoyé peut être marqué reçu.')
  })
}
