import { amountInWords, type CompanyInfo, type DocKind, type Invoice } from '@shared/invoice'

// Modèle HTML/CSS de la facture A4. Le même HTML sert à l'aperçu, à l'impression et à l'export PDF.
// Marges de page et pagination « Page x / y » : fournies par printToPDF (voir pdf.ts).

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

// 1234.5 -> "1 234,500" (espace insécable : pas de coupure de ligne au milieu d'un montant)
const money = (n: number): string =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).replace(/[  ]/g, ' ')
const qty = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 3 }).replace(/[  ]/g, ' ')
const date = (iso: string | null): string => (iso ? iso.split('-').reverse().join('/') : '')
const nl2br = (s: string): string => esc(s).replace(/\n/g, '<br>')

const CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10pt; color: #1b2233; line-height: 1.4; }
  .muted { color: #5b6478; }
  .right { text-align: right; } .center { text-align: center; }
  .nowrap { white-space: nowrap; }

  /* En-tête */
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .company { flex: 1; }
  .logo { max-height: 22mm; max-width: 62mm; margin-bottom: 6px; display: block; }
  .company h1 { margin: 0 0 4px; font-size: 15pt; color: #14213d; letter-spacing: .2px; }
  .company p { margin: 0; font-size: 9pt; color: #3d4659; }
  .company b { color: #1b2233; }
  .doc { text-align: right; min-width: 62mm; }
  .doc .title { font-size: 20pt; font-weight: 700; color: #14213d; letter-spacing: 2px; line-height: 1; }
  .doc .num { margin-top: 6px; font-size: 12pt; font-weight: 600; }
  .doc .draft { margin-top: 6px; display: inline-block; padding: 2px 10px; border: 1.5px solid #b45309; color: #b45309;
                font-weight: 700; font-size: 9pt; border-radius: 4px; letter-spacing: 1px; }
  .rule { height: 3px; background: #14213d; margin: 12px 0 14px; border-radius: 2px; }

  /* Blocs client / informations */
  .boxes { display: flex; gap: 14px; margin-bottom: 14px; }
  .box { flex: 1; border: 1px solid #c9cfdb; border-radius: 6px; padding: 8px 12px; }
  .box h3 { margin: 0 0 5px; font-size: 8pt; text-transform: uppercase; letter-spacing: 1.2px; color: #5b6478; font-weight: 600; }
  .box .name { font-size: 11pt; font-weight: 700; color: #14213d; }
  .box p { margin: 1px 0; font-size: 9.5pt; }
  .kv { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; font-size: 9.5pt; }
  .kv span:nth-child(odd) { color: #5b6478; }

  /* Tableau des lignes : l'en-tête se répète sur chaque page */
  table.items { width: 100%; border-collapse: collapse; }
  table.items thead { display: table-header-group; }
  table.items tr { break-inside: avoid; page-break-inside: avoid; }
  table.items th { background: #14213d; color: #fff; font-size: 8.5pt; font-weight: 600; text-transform: uppercase;
                   letter-spacing: .5px; padding: 7px 6px; text-align: right; }
  table.items th:nth-child(2) { text-align: left; }
  table.items th:first-child { text-align: center; }
  table.items td { padding: 6px 6px; border-bottom: 1px solid #dde2ec; vertical-align: top; text-align: right; font-size: 9.5pt; }
  table.items td:first-child { text-align: center; color: #5b6478; }
  table.items td:nth-child(2) { text-align: left; width: 38%; }
  table.items tbody tr:nth-child(even) td { background: #f6f8fb; }
  table.items td.total { font-weight: 600; }

  /* Totaux + montant en lettres : toujours groupés, jamais coupés entre deux pages */
  .summary { display: flex; justify-content: space-between; gap: 18px; margin-top: 14px; break-inside: avoid; page-break-inside: avoid; }
  .left { flex: 1; }
  .words { border: 1px solid #c9cfdb; border-left: 4px solid #14213d; border-radius: 4px; padding: 8px 12px; font-size: 9.5pt; }
  .words small { display: block; color: #5b6478; margin-bottom: 2px; }
  .words b { color: #14213d; }
  .pay { margin-top: 10px; font-size: 9pt; }
  .pay p { margin: 2px 0; }
  .totals { width: 76mm; border-collapse: collapse; font-size: 10pt; }
  .totals td { padding: 5px 8px; border-bottom: 1px solid #dde2ec; }
  .totals td:last-child { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .totals tr.tva td { font-size: 9pt; color: #3d4659; }
  .totals tr.grand td { background: #14213d; color: #fff; font-size: 11.5pt; font-weight: 700; border: 0; padding: 8px; }

  .notes { margin-top: 12px; font-size: 9pt; break-inside: avoid; }
  .sign { display: flex; gap: 18px; margin-top: 16px; break-inside: avoid; page-break-inside: avoid; }
  .sign div { flex: 1; height: 30mm; border: 1px solid #c9cfdb; border-radius: 6px; padding: 6px 10px; font-size: 8.5pt; color: #5b6478; }
  .legal { margin-top: 10px; font-size: 8pt; color: #5b6478; text-align: center; }

  /* Filigrane sur chaque page tant que la facture n'est pas validée */
  .watermark { position: fixed; top: 42%; left: 0; right: 0; text-align: center; font-size: 96pt; font-weight: 800;
               color: rgba(180, 83, 9, .09); transform: rotate(-30deg); z-index: 0; pointer-events: none; }
`

/** Facture ou devis : même mise en page, seuls les libellés changent. */
export type DocView = Omit<Invoice, 'status'> & { status: string }
const LABELS = {
  facture: { title: 'FACTURE', words: 'Arrêtée la présente facture à la somme de :', due: 'Échéance', name: 'Facture', net: 'NET À PAYER (DT)',
             party: 'Client', signL: 'Cachet et signature du fournisseur', signR: 'Bon pour accord — signature du client' },
  devis: { title: 'DEVIS', words: 'Arrêté le présent devis à la somme de :', due: "Valable jusqu'au", name: 'Devis', net: 'TOTAL TTC (DT)',
           party: 'Client', signL: 'Cachet et signature du fournisseur', signR: 'Bon pour accord — signature du client' },
  bon_livraison: { title: 'BON DE LIVRAISON', words: 'Arrêté le présent bon de livraison à la somme de :', due: 'Livraison prévue le',
                   name: 'Bon de livraison', net: 'TOTAL TTC (DT)', party: 'Client', signL: 'Cachet et signature du fournisseur',
                   signR: 'Reçu en bon état — nom, date et signature du client' },
  bon_commande: { title: 'BON DE COMMANDE', words: 'Arrêté le présent bon de commande à la somme de :', due: 'Livraison souhaitée le',
                  name: 'Bon de commande', net: 'TOTAL TTC (DT)', party: 'Fournisseur', signL: "Cachet et signature de l'acheteur",
                  signR: 'Accusé de réception — signature du fournisseur' }
}

export function renderInvoiceHtml(inv: DocView, co: CompanyInfo, kind: DocKind = 'facture'): string {
  const t = inv.totals
  const L = LABELS[kind]
  const isDraft = inv.status === 'brouillon'

  const companyLines = [
    co.address && esc(co.address),
    [co.phone && `Tél : ${esc(co.phone)}`, co.email && esc(co.email)].filter(Boolean).join(' &nbsp;•&nbsp; '),
    [co.taxId && `<b>MF :</b> ${esc(co.taxId)}`, co.rc && `<b>RC :</b> ${esc(co.rc)}`].filter(Boolean).join(' &nbsp;&nbsp; ')
  ].filter(Boolean).map((l) => `<p>${l}</p>`).join('')

  const rows = inv.lines.map((l, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(l.designation)}</td>
      <td class="nowrap">${esc(l.unit)}</td>
      <td class="nowrap">${qty(l.quantity)}</td>
      <td class="nowrap">${money(l.unitPrice)}</td>
      <td class="nowrap">${l.discountPct ? qty(l.discountPct) + ' %' : '—'}</td>
      <td class="nowrap">${qty(l.tvaRate)} %</td>
      <td class="nowrap total">${money(t.lineTotals[i])}</td>
    </tr>`).join('')

  const tvaRows = t.tvaByRate.map((g) => `
    <tr class="tva"><td>TVA ${qty(g.rate)} % <span class="muted">(base ${money(g.base)})</span></td><td>${money(g.tva)}</td></tr>`).join('')

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${L.name} ${esc(inv.number ?? 'brouillon')}</title><style>${CSS}</style></head>
<body>
  ${isDraft ? '<div class="watermark">BROUILLON</div>' : ''}

  <div class="head">
    <div class="company">
      ${co.logo ? `<img class="logo" src="${co.logo}" alt="">` : ''}
      <h1>${esc(co.name || 'Nom de la société')}</h1>
      ${companyLines}
    </div>
    <div class="doc">
      <div class="title">${L.title}</div>
      ${isDraft ? '<div class="draft">BROUILLON</div>' : `<div class="num">N° ${esc(inv.number)}</div>`}
    </div>
  </div>
  <div class="rule"></div>

  <div class="boxes">
    <div class="box">
      <h3>${L.party}</h3>
      <div class="name">${esc(inv.clientName || '—')}</div>
      ${inv.clientAddress ? `<p>${nl2br(inv.clientAddress)}</p>` : ''}
      ${inv.clientPhone ? `<p>Tél : ${esc(inv.clientPhone)}</p>` : ''}
      ${inv.clientTaxId ? `<p><b>MF :</b> ${esc(inv.clientTaxId)}</p>` : ''}
    </div>
    <div class="box">
      <h3>Informations</h3>
      <div class="kv">
        <span>Date</span><b>${date(inv.issueDate)}</b>
        ${inv.dueDate ? `<span>${L.due}</span><b>${date(inv.dueDate)}</b>` : ''}
        ${kind === 'facture' ? `<span>Règlement</span><b>${esc(inv.paymentMethod)}</b>` : ''}
      </div>
    </div>
  </div>

  <table class="items">
    <thead><tr>
      <th style="width:8mm">N°</th><th>Désignation</th><th>Unité</th><th>Qté</th>
      <th>P.U. HT</th><th>Remise</th><th>TVA</th><th>Total HT</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="summary">
    <div class="left">
      <div class="words"><small>${L.words}</small><b>${esc(amountInWords(t.totalTtc))}</b></div>
      <div class="pay">
        ${kind === 'facture' && co.rib ? `<p><b>RIB :</b> ${esc(co.rib)}</p>` : ''}
        ${inv.timbre ? `<p class="muted">Droit de timbre fiscal inclus : ${money(inv.timbreAmount)} DT</p>` : ''}
      </div>
    </div>
    <table class="totals">
      <tr><td>Total HT</td><td>${money(t.subtotalHt)}</td></tr>
      ${tvaRows}
      <tr><td>Total TVA</td><td>${money(t.totalTva)}</td></tr>
      ${inv.timbre ? `<tr><td>Timbre fiscal</td><td>${money(t.timbre)}</td></tr>` : ''}
      <tr class="grand"><td>${L.net}</td><td>${money(t.totalTtc)}</td></tr>
    </table>
  </div>

  ${inv.notes ? `<div class="notes"><b>Notes :</b> ${nl2br(inv.notes)}</div>` : ''}

  <div class="sign">
    <div>${L.signL}</div>
    <div>${L.signR}</div>
  </div>
  ${co.footer ? `<div class="legal">${nl2br(co.footer)}</div>` : ''}
</body></html>`
}

/** Pied de page répété sur chaque page (gabarit printToPDF) : société à gauche, « Page x / y » à droite. */
export function footerTemplate(co: CompanyInfo, number: string | null, kind: DocKind = 'facture'): string {
  const left = [co.name, co.taxId && `MF ${co.taxId}`].filter(Boolean).map(esc).join(' — ')
  return `<div style="width:100%;font-size:8px;font-family:Segoe UI,Arial,sans-serif;color:#5b6478;padding:0 11mm;display:flex;justify-content:space-between;">
    <span>${left}</span>
    <span>${number ? `${LABELS[kind].name} ${esc(number)} — ` : ''}Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`
}
