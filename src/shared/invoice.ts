// Types et calculs des factures, partagés entre l'interface (aperçu en direct) et le processus principal
// (calcul faisant foi à l'enregistrement + modèle d'impression). Tous les calculs se font en millimes (entiers).
import { fromMillimes, toMillimes } from './money'

export type InvoiceStatus = 'brouillon' | 'validee'

/** Taux de TVA en vigueur en Tunisie. */
export const TVA_RATES = [0, 7, 13, 19] as const

export interface InvoiceLine {
  designation: string
  unit: string
  quantity: number
  unitPrice: number // prix unitaire HT, en dinars
  discountPct: number // remise de ligne en %
  tvaRate: number // en %
}

export interface InvoiceInput {
  clientId: number | null
  clientName: string
  clientAddress: string
  clientTaxId: string // matricule fiscal du client
  clientPhone: string
  issueDate: string // AAAA-MM-JJ
  dueDate: string | null
  paymentMethod: string
  notes: string
  timbre: boolean // droit de timbre fiscal appliqué ?
  lines: InvoiceLine[]
  representative?: string // vendeur imprimé sur le document ('' = utilisateur connecté à l'enregistrement)
}

/** Règlement d'une facture validée. */
export interface InvoicePayment {
  id: number
  payDate: string // AAAA-MM-JJ
  amount: number // dinars
  method: string
  reference: string
  userName: string
}
export interface InvoicePaymentInput { payDate: string; amount: number; method: string; reference: string }

export interface InvoiceTotals {
  lineTotals: number[] // total HT de chaque ligne (après remise)
  subtotalHt: number
  tvaByRate: { rate: number; base: number; tva: number }[]
  totalTva: number
  timbre: number
  totalTtc: number // net à payer
}

export interface Invoice extends InvoiceInput {
  id: number
  number: string | null // attribué uniquement à la validation (numérotation continue, sans trou)
  status: InvoiceStatus
  validatedAt: string | null
  timbreAmount: number // montant du timbre figé sur la facture
  totals: InvoiceTotals
}

/** Type de document imprimable (facture, puis devis ; bons et ticket viendront ensuite). */
export type DocKind = 'facture' | 'devis' | 'bon_commande' | 'bon_livraison'

export type QuoteStatus = 'brouillon' | 'valide' | 'accepte' | 'refuse' | 'converti'
export const QUOTE_LABELS: Record<QuoteStatus, string> = {
  brouillon: 'Brouillon', valide: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé', converti: 'Converti'
}

/** Un devis a la même forme qu'une facture ; `dueDate` y sert de date de validité. */
export interface Quote extends Omit<Invoice, 'status'> {
  status: QuoteStatus
  convertedInvoiceId: number | null
}

export type DeliveryStatus = 'brouillon' | 'valide' | 'livre'
export const DELIVERY_LABELS: Record<DeliveryStatus, string> = { brouillon: 'Brouillon', valide: 'Validé', livre: 'Livré' }

/** Bon de livraison : même forme qu'une facture ; `dueDate` = livraison prévue. */
export interface Delivery extends Omit<Invoice, 'status'> {
  status: DeliveryStatus
}
export interface DeliverySummary {
  id: number
  number: string | null
  status: DeliveryStatus
  issueDate: string
  clientName: string
  totalTtc: number
}

export type OrderStatus = 'brouillon' | 'valide' | 'recu'
export const ORDER_LABELS: Record<OrderStatus, string> = { brouillon: 'Brouillon', valide: 'Envoyé', recu: 'Reçu' }

/** Bon de commande : les champs « client » contiennent le fournisseur ; `dueDate` = livraison souhaitée. */
export interface Order extends Omit<Invoice, 'status'> {
  status: OrderStatus
}
export interface OrderSummary {
  id: number
  number: string | null
  status: OrderStatus
  issueDate: string
  clientName: string // nom du fournisseur
  totalTtc: number
}

export interface QuoteSummary {
  id: number
  number: string | null
  status: QuoteStatus
  issueDate: string
  clientName: string
  totalTtc: number
}

export interface InvoiceSummary {
  id: number
  number: string | null
  status: InvoiceStatus
  issueDate: string
  clientName: string
  totalTtc: number
  paid?: number // total des règlements (factures uniquement)
}

export interface CompanyInfo {
  name: string
  taxId: string // matricule fiscal
  rc: string // registre de commerce
  address: string
  phone: string
  email: string
  website: string
  bank: string
  rib: string
  logo: string // image en data URL ('' = aucun)
  footer: string // pied de page des documents
  accentColor: string // couleur des documents (#RRGGBB)
  layout: 'classique' | 'moderne' // modèle d'impression A4
  headerTitle: string // grand titre de l'en-tête ('' = raison sociale)
  showCode: boolean // colonne « Code » article
  showSignatures: boolean // cadres de signature
  conditions: Record<DocKind, string> // conditions imprimées, par type de document
  rates: number[] // taux de TVA proposés
  defaultTva: number
  timbreAmount: number // droit de timbre, en dinars
  timbreDefault: boolean // timbre coché par défaut sur les nouvelles factures
  pricesMode: 'HT' | 'TTC' // les prix du catalogue sont-ils HT ou TTC ?
  quoteValidityDays: number
  invoiceDueDays: number
}

/** Calcule HT, TVA par taux, timbre et TTC. Arrondis au millime, ligne par ligne puis par taux. */
export function computeTotals(lines: InvoiceLine[], timbreOn: boolean, timbreAmount: number): InvoiceTotals {
  const lineMm = lines.map((l) =>
    Math.round((Number(l.quantity) || 0) * toMillimes(l.unitPrice) * (1 - (Number(l.discountPct) || 0) / 100)))

  const groups = new Map<number, number>()
  lines.forEach((l, i) => groups.set(l.tvaRate, (groups.get(l.tvaRate) ?? 0) + lineMm[i]))
  const tvaByRate = [...groups.entries()].sort((a, b) => a[0] - b[0])
    .map(([rate, base]) => ({ rate, base, tva: Math.round((base * rate) / 100) }))

  const subtotal = lineMm.reduce((s, v) => s + v, 0)
  const totalTva = tvaByRate.reduce((s, g) => s + g.tva, 0)
  const timbre = timbreOn ? toMillimes(timbreAmount) : 0

  return {
    lineTotals: lineMm.map(fromMillimes),
    subtotalHt: fromMillimes(subtotal),
    tvaByRate: tvaByRate.map((g) => ({ rate: g.rate, base: fromMillimes(g.base), tva: fromMillimes(g.tva) })),
    totalTva: fromMillimes(totalTva),
    timbre: fromMillimes(timbre),
    totalTtc: fromMillimes(subtotal + totalTva + timbre)
  }
}

// ---------- Montant en lettres (français) ----------
const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze',
  'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante']

// 0..99. `final` = le nombre termine l'expression (quatre-vingts prend alors un « s »).
function below100(n: number, final: boolean): string {
  if (n < 20) return UNITS[n]
  if (n < 70) {
    const t = Math.floor(n / 10), u = n % 10
    return TENS[t] + (u === 1 ? ' et un' : u ? '-' + UNITS[u] : '')
  }
  if (n < 80) return 'soixante' + (n === 71 ? ' et onze' : '-' + UNITS[n - 60])
  return n === 80 ? 'quatre-vingt' + (final ? 's' : '') : 'quatre-vingt-' + UNITS[n - 80]
}

// 0..999 (« cent » prend un « s » seulement s'il est multiplié et en fin d'expression)
function below1000(n: number, final: boolean): string {
  const h = Math.floor(n / 100), r = n % 100
  if (h === 0) return below100(r, final)
  const head = h === 1 ? 'cent' : UNITS[h] + ' cent'
  return r ? `${head} ${below100(r, final)}` : head + (h > 1 && final ? 's' : '')
}

/** Entier de 0 à 999 999 999 en toutes lettres. */
export function integerToWords(n: number): string {
  if (n === 0) return 'zéro'
  const millions = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000
  const parts: string[] = []
  if (millions) parts.push(millions === 1 ? 'un million' : `${below1000(millions, true)} millions`)
  if (thousands) parts.push(thousands === 1 ? 'mille' : `${below1000(thousands, false)} mille`)
  if (rest) parts.push(below1000(rest, true))
  return parts.join(' ')
}

/** 123.5 -> « Cent vingt-trois dinars et cinq cents millimes » */
export function amountInWords(amount: number): string {
  const mm = toMillimes(amount)
  const dinars = Math.floor(mm / 1000)
  const millimes = mm % 1000
  // « un million de dinars » : « de » devant l'unité quand le nombre se termine par million(s)
  const de = dinars > 0 && dinars % 1_000_000 === 0 ? ' de' : ''
  let text = `${integerToWords(dinars)}${de} dinar${dinars > 1 ? 's' : ''}`
  if (millimes) text += ` et ${integerToWords(millimes)} millime${millimes > 1 ? 's' : ''}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}
