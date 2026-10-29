import type { CompanyInfo } from '@shared/invoice'
import { PAY_LABELS, type Ticket } from '@shared/types'

// Ticket de caisse 80 mm (rouleau thermique) : 72 mm imprimables, noir et blanc, hauteur libre.

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const money = (n: number): string =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).replace(/[  ]/g, ' ')
const qty = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 3 }).replace(/[  ]/g, ' ')
const stamp = (s: string): string => {
  const [d, t = ''] = s.split(' ')
  return `${d.split('-').reverse().join('/')} ${t.slice(0, 5)}`
}

const css = (w: number) => `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { width: ${w}mm; padding: 3mm ${w > 60 ? 4 : 2.5}mm 5mm; font-family: "Segoe UI", Arial, sans-serif; font-size: ${w > 60 ? 9 : 8}pt; line-height: 1.35; color: #000; }
  .c { text-align: center; }
  .logo { max-width: 46mm; max-height: 16mm; display: block; margin: 0 auto 2mm; filter: grayscale(1) contrast(1.2); }
  h1 { margin: 0; font-size: 12pt; font-weight: 800; text-transform: uppercase; letter-spacing: .3px; }
  .small { font-size: 8pt; }
  hr { border: 0; border-top: 1px dashed #000; margin: 2.2mm 0; }
  .row { display: flex; justify-content: space-between; gap: 3mm; }
  .row span:last-child { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .line { margin-bottom: 1.4mm; break-inside: avoid; }
  .line .name { font-weight: 600; }
  .line .calc { font-size: 8.5pt; }
  .total { font-size: 12pt; font-weight: 800; padding: 1.5mm 0; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; margin: 2mm 0; }
  .due { font-weight: 700; }
  .thanks { margin-top: 3mm; font-weight: 600; }
`

export function renderTicketHtml(t: Ticket, co: CompanyInfo, widthMm = 80): string {
  const header = [
    co.address && `<div class="small">${esc(co.address)}</div>`,
    co.phone && `<div class="small">Tél : ${esc(co.phone)}</div>`,
    co.taxId && `<div class="small">MF : ${esc(co.taxId)}</div>`
  ].filter(Boolean).join('')

  const lines = t.lines.map((l) => `
    <div class="line">
      <div class="name">${esc(l.designation)}</div>
      <div class="row calc"><span>${qty(l.quantity)} ${esc(l.unit)} × ${money(l.unitPrice)}</span><span>${money(l.total)}</span></div>
    </div>`).join('')

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Ticket ${esc(t.number)}</title><style>${css(widthMm)}</style></head>
<body>
  <div class="c">
    ${co.logo ? `<img class="logo" src="${co.logo}" alt="">` : ''}
    <h1>${esc(co.name || t.shopName)}</h1>
    ${header}
  </div>
  <hr>
  <div class="row"><span>Ticket n°</span><span><b>${esc(t.number)}</b></span></div>
  <div class="row"><span>Date</span><span>${stamp(t.createdAt)}</span></div>
  ${t.cashier ? `<div class="row"><span>Caissier</span><span>${esc(t.cashier)}</span></div>` : ''}
  ${t.clientName ? `<div class="row"><span>Client</span><span>${esc(t.clientName)}</span></div>` : ''}
  <hr>
  ${lines}
  <hr>
  ${t.discount > 0 ? `<div class="row"><span>Sous-total</span><span>${money(t.subtotal)}</span></div>
  <div class="row"><span>Remise</span><span>-${money(t.discount)}</span></div>` : ''}
  <div class="row total"><span>TOTAL TTC</span><span>${money(t.total)} DT</span></div>
  <div class="row"><span>Paiement</span><span>${esc(PAY_LABELS[t.method])}</span></div>
  ${t.method === 'especes' && t.received > 0 ? `<div class="row"><span>Reçu</span><span>${money(t.received)}</span></div>
  <div class="row"><span>Rendu</span><span>${money(t.change)}</span></div>` : ''}
  ${t.method === 'credit' ? `<div class="row"><span>Avance</span><span>${money(t.received)}</span></div>
  <div class="row due"><span>Reste à crédit</span><span>${money(t.due)}</span></div>` : ''}
  <hr>
  <div class="c thanks">Merci de votre visite !</div>
  ${co.footer ? `<div class="c small">${esc(co.footer)}</div>` : ''}
</body></html>`
}
