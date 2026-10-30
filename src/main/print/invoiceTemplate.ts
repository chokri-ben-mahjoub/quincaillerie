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
  .company h1 { margin: 0 0 4px; font-size: 15pt; color: var(--accent); letter-spacing: .2px; }
  .company p { margin: 0; font-size: 9pt; color: #3d4659; }
  .company b { color: #1b2233; }
  .doc { text-align: right; min-width: 62mm; }
  .doc .title { font-size: 20pt; font-weight: 700; color: var(--accent); letter-spacing: 2px; line-height: 1; }
  .doc .num { margin-top: 6px; font-size: 12pt; font-weight: 600; }
  .doc .draft { margin-top: 6px; display: inline-block; padding: 2px 10px; border: 1.5px solid #b45309; color: #b45309;
                font-weight: 700; font-size: 9pt; border-radius: 4px; letter-spacing: 1px; }
  .rule { height: 3px; background: var(--accent); margin: 12px 0 14px; border-radius: 2px; }

  /* Blocs client / informations */
  .boxes { display: flex; gap: 14px; margin-bottom: 14px; }
  .box { flex: 1; border: 1px solid #c9cfdb; border-radius: 6px; padding: 8px 12px; }
  .box h3 { margin: 0 0 5px; font-size: 8pt; text-transform: uppercase; letter-spacing: 1.2px; color: #5b6478; font-weight: 600; }
  .box .name { font-size: 11pt; font-weight: 700; color: var(--accent); }
  .box p { margin: 1px 0; font-size: 9.5pt; }
  .kv { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; font-size: 9.5pt; }
  .kv span:nth-child(odd) { color: #5b6478; }

  /* Tableau des lignes : l'en-tête se répète sur chaque page */
  table.items { width: 100%; border-collapse: collapse; }
  table.items thead { display: table-header-group; }
  table.items tr { break-inside: avoid; page-break-inside: avoid; }
  table.items th { background: var(--accent); color: #fff; font-size: 8.5pt; font-weight: 600; text-transform: uppercase;
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
  .words { border: 1px solid #c9cfdb; border-left: 4px solid var(--accent); border-radius: 4px; padding: 8px 12px; font-size: 9.5pt; }
  .words small { display: block; color: #5b6478; margin-bottom: 2px; }
  .words b { color: var(--accent); }
  .pay { margin-top: 10px; font-size: 9pt; }
  .pay p { margin: 2px 0; }
  .totals { width: 76mm; border-collapse: collapse; font-size: 10pt; }
  .totals td { padding: 5px 8px; border-bottom: 1px solid #dde2ec; }
  .totals td:last-child { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .totals tr.tva td { font-size: 9pt; color: #3d4659; }
  .totals tr.grand td { background: var(--accent); color: #fff; font-size: 11.5pt; font-weight: 700; border: 0; padding: 8px; }

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

/** Modèle « moderne » : bandeaux de couleur, blocs arrondis. */
function renderModern(inv: DocView, co: CompanyInfo, kind: DocKind, x: PrintExtras = {}): string {
  const t = inv.totals
  const L = LABELS[kind]
  const isDraft = inv.status === 'brouillon'

  const companyLines = [
    co.address && esc(co.address),
    [co.phone && `Tél : ${esc(co.phone)}`, co.email && esc(co.email), co.website && esc(co.website)].filter(Boolean).join(' &nbsp;•&nbsp; '),
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
<html lang="fr"><head><meta charset="utf-8"><title>${L.name} ${esc(inv.number ?? 'brouillon')}</title><style>:root { --accent: ${esc(co.accentColor)}; }${CSS}</style></head>
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
        ${inv.representative ? `<span>Représentant</span><b>${esc(inv.representative)}</b>` : ''}
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
        ${kind === 'facture' && co.rib ? `<p><b>RIB :</b> ${esc(co.rib)}${co.bank ? ` — ${esc(co.bank)}` : ''}</p>` : ''}
        ${inv.timbre ? `<p class="muted">Droit de timbre fiscal inclus : ${money(inv.timbreAmount)} DT</p>` : ''}
      </div>
    </div>
    <table class="totals">
      <tr><td>Total HT</td><td>${money(t.subtotalHt)}</td></tr>
      ${tvaRows}
      <tr><td>Total TVA</td><td>${money(t.totalTva)}</td></tr>
      ${inv.timbre ? `<tr><td>Timbre fiscal</td><td>${money(t.timbre)}</td></tr>` : ''}
      <tr class="grand"><td>${L.net}</td><td>${money(t.totalTtc)}</td></tr>
      ${x.paid !== undefined ? `<tr><td>Total des règlements</td><td>${money(x.paid)}</td></tr>
      <tr><td><b>Reste à payer</b></td><td><b>${money(Math.max(0, t.totalTtc - x.paid))}</b></td></tr>` : ''}
    </table>
  </div>

  ${co.conditions[kind] ? `<div class="notes"><b>Conditions :</b> ${nl2br(co.conditions[kind])}</div>` : ''}
  ${inv.notes ? `<div class="notes"><b>Notes :</b> ${nl2br(inv.notes)}</div>` : ''}

  ${co.showSignatures ? `<div class="sign">
    <div>${L.signL}</div>
    <div>${L.signR}</div>
  </div>` : ''}
  ${co.footer ? `<div class="legal">${nl2br(co.footer)}</div>` : ''}
</body></html>`
}

// ======================================================================================================
// Modèle « classique » : présentation des logiciels de gestion tunisiens (cadre client à droite, bandeau
// d'informations, grille à colonnes pleine hauteur, récapitulatif TVA et totaux en bas de page).
// ======================================================================================================

/** Informations calculées à l'impression (non stockées sur le document). */
export interface PrintExtras {
  codes?: string[] // code de chaque ligne (code-barres de l'article)
  clientCode?: string
  reference?: string // ex. « Devis DV-2026-0012 » pour une facture issue d'un devis
  paid?: number // total des règlements d'une facture validée (absent : ligne non imprimée)
  page?: { width: number; height: number } // zone imprimable en px : la grille s'étire jusqu'aux totaux
}

const fix = (n: number, d: number): string =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[\u202f\u00a0]/g, ' ')

const CLASSIC_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, "Segoe UI", sans-serif; font-size: 8.5pt; color: #000; line-height: 1.3; }
  .sheet { display: flex; flex-direction: column; padding: 0 2px; }
  .r { text-align: right; } .c { text-align: center; } .nw { white-space: nowrap; }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }

  /* En-tête société */
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-top: 4mm; }
  .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .brand img { max-height: 20mm; max-width: 45mm; object-fit: contain; }
  .brand h1 { margin: 0; font-size: 22pt; font-weight: 800; letter-spacing: .5px; color: var(--accent); line-height: 1.05; }
  .brand p { margin: 2px 0 0; font-size: 8pt; color: #333; }
  .ids { text-align: right; font-size: 8.5pt; line-height: 1.6; white-space: nowrap; }
  .ids b { display: inline-block; min-width: 9mm; }

  /* Titre du document + cadre client */
  .mid { display: flex; align-items: center; margin: 9mm 0 5mm; gap: 16px; }
  .doctitle { flex: 1; text-align: center; }
  .doctitle .t { font-size: 17pt; font-weight: 400; }
  .doctitle .draft { display: inline-block; margin-top: 4px; padding: 1px 8px; border: 1.2px solid #b45309; color: #b45309;
                     font-weight: 700; font-size: 8pt; letter-spacing: 1px; border-radius: 3px; }
  .party { width: 78mm; min-height: 26mm; border: 1.2px solid #000; border-radius: 3mm; padding: 2.5mm 4mm; font-size: 8.5pt; }
  .party .lbl { font-size: 7pt; color: #555; text-transform: uppercase; letter-spacing: .6px; }
  .party .name { font-size: 10pt; font-weight: 700; margin: 1px 0 2px; }
  .party p { margin: 1px 0; }

  /* Grilles à traits fins */
  table { border-collapse: collapse; width: 100%; }
  .info th, .info td { border: 1px solid #000; padding: 2px 4px; text-align: center; font-size: 8pt; }
  .info th { font-weight: 700; background: #f1f1f1; }
  .items { margin-top: 2.5mm; flex: 1; }
  .items thead { display: table-header-group; }
  .items th { border: 1px solid #000; padding: 3px 4px; font-size: 8pt; font-weight: 700; background: #f1f1f1; text-align: center; }
  .items td { border-left: 1px solid #000; border-right: 1px solid #000; padding: 2px 4px; vertical-align: top; font-size: 8pt; }
  .items tbody tr { break-inside: avoid; page-break-inside: avoid; }
  .items tbody tr:last-child td { border-bottom: 1px solid #000; }
  .items td.num { text-align: right; }

  /* Bas de page : récap TVA + totaux + montant en lettres, jamais coupés */
  .bottom { margin-top: 3mm; break-inside: avoid; page-break-inside: avoid; }
  .totrow { display: flex; gap: 3mm; align-items: flex-start; }
  .vat { width: 62mm; }
  .vat th, .vat td { border: 1px solid #000; padding: 2px 4px; font-size: 8pt; }
  .vat th { background: #f1f1f1; }
  .vat td { text-align: right; }
  .tot { flex: 1; }
  .tot td { border: 1px solid #000; padding: 2px 5px; font-size: 8.5pt; }
  .tot td.k { font-weight: 700; white-space: nowrap; width: 22%; }
  .tot td.v { text-align: right; width: 28%; }
  .tot td.grand { font-weight: 800; font-size: 9.5pt; background: #f1f1f1; }
  .words { border: 1px solid #000; border-top: 0; padding: 3px 6px 8px; font-size: 8pt; margin-left: calc(62mm + 3mm); }
  .meta { display: flex; justify-content: space-between; gap: 12px; margin-top: 3mm; font-size: 8pt; }
  .notes { margin-top: 2mm; font-size: 8pt; }
  .sign { display: flex; gap: 6mm; margin-top: 4mm; }
  .sign div { flex: 1; height: 22mm; border: 1px solid #000; border-radius: 2mm; padding: 2mm 3mm; font-size: 7.5pt; color: #333; }
  .legal { margin-top: 3mm; padding-top: 2mm; border-top: 1.5px solid #000; font-size: 7.5pt; color: #333; text-align: center; }

  .watermark { position: fixed; top: 42%; left: 0; right: 0; text-align: center; font-size: 96pt; font-weight: 800;
               color: rgba(180, 83, 9, .09); transform: rotate(-30deg); z-index: 0; pointer-events: none; }
`

// Libellés propres au modèle classique : titre en casse normale et libellé de la date de la colonne de droite.
const CLASSIC = {
  facture: { title: 'Facture', due: 'Échéance', partyCode: 'Client' },
  devis: { title: 'Devis', due: 'Validité', partyCode: 'Client' },
  bon_livraison: { title: 'Bon de livraison', due: 'Livraison', partyCode: 'Client' },
  bon_commande: { title: 'Bon de commande', due: 'Livraison souhaitée', partyCode: 'Fournisseur' }
}

function renderClassic(inv: DocView, co: CompanyInfo, kind: DocKind, x: PrintExtras): string {
  const t = inv.totals
  const L = LABELS[kind]
  const C = CLASSIC[kind]
  const isDraft = inv.status === 'brouillon'
  const showCode = co.showCode && (x.codes ?? []).some(Boolean)

  // Remise de ligne : Total HT brut (avant remise) - Net HT. Calcul en millimes pour éviter les écarts d'arrondi.
  const grossMm = inv.lines.reduce((s, l) => s + Math.round((Number(l.quantity) || 0) * Math.round(l.unitPrice * 1000)), 0)
  const netMm = Math.round(t.subtotalHt * 1000)
  const gross = grossMm / 1000
  const discount = Math.max(0, grossMm - netMm) / 1000

  const rows = inv.lines.map((l, i) => {
    const pun = l.unitPrice * (1 - (Number(l.discountPct) || 0) / 100)
    return `<tr>
      ${showCode ? `<td class="nw">${esc(x.codes?.[i])}</td>` : ''}
      <td>${esc(l.designation)}</td>
      <td class="c nw">${esc(l.unit)}</td>
      <td class="num">${fix(l.quantity, 3)}</td>
      <td class="num">${money(l.unitPrice)}</td>
      <td class="num">${fix(Number(l.discountPct) || 0, 2)}</td>
      <td class="num">${money(pun)}</td>
      <td class="num">${money(t.lineTotals[i])}</td>
      <td class="num">${qty(l.tvaRate)}</td>
    </tr>`
  }).join('')
  const cols = showCode ? 9 : 8
  // Ligne vide qui étire la grille jusqu'aux totaux (hauteur calculée par le script en fin de page).
  const filler = `<tr class="fill">${'<td></td>'.repeat(cols)}</tr>`

  const vatRows = t.tvaByRate.map((g) =>
    `<tr><td>${fix(g.rate, 2)}</td><td>${money(g.base)}</td><td>${money(g.tva)}</td></tr>`).join('')

  const title = co.headerTitle || co.name || 'Nom de la société'
  const contact = [co.phone && `Tél : ${esc(co.phone)}`, co.email && esc(co.email), co.website && esc(co.website)].filter(Boolean).join(' — ')
  const page = x.page

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${L.name} ${esc(inv.number ?? 'brouillon')}</title>
<style>:root { --accent: ${esc(co.accentColor)}; }${CLASSIC_CSS}${page ? `@media screen { .sheet { width: ${page.width}px; } }` : ''}</style></head>
<body>
  ${isDraft ? '<div class="watermark">BROUILLON</div>' : ''}
  <div class="sheet">
    <div class="top">
      <div class="brand">
        ${co.logo ? `<img src="${co.logo}" alt="">` : ''}
        <div>
          <h1>${esc(title)}</h1>
          ${co.headerTitle && co.name && co.headerTitle !== co.name ? `<p><b>${esc(co.name)}</b></p>` : ''}
          ${co.address ? `<p>${nl2br(co.address)}</p>` : ''}
          ${contact ? `<p>${contact}</p>` : ''}
        </div>
      </div>
      <div class="ids">
        <div><b>MF :</b> ${esc(co.taxId)}</div>
        <div><b>RC :</b> ${esc(co.rc)}</div>
      </div>
    </div>

    <div class="mid">
      <div class="doctitle">
        <div class="t">${C.title}</div>
        ${isDraft ? '<div class="draft">BROUILLON</div>' : ''}
      </div>
      <div class="party">
        <div class="lbl">${L.party}</div>
        <div class="name">${esc(inv.clientName || '—')}</div>
        ${inv.clientAddress ? `<p>${nl2br(inv.clientAddress)}</p>` : ''}
        ${inv.clientPhone ? `<p>Tél : ${esc(inv.clientPhone)}</p>` : ''}
        <p><b>MF :</b> ${esc(inv.clientTaxId)}</p>
      </div>
    </div>

    <table class="info">
      <thead><tr><th>Date</th><th>Numéro</th><th>${C.partyCode}</th><th>Référence</th><th>Mode règlement</th><th>Représentant</th><th>${C.due}</th></tr></thead>
      <tbody><tr>
        <td>${date(inv.issueDate)}</td>
        <td><b>${isDraft ? 'Brouillon' : esc(inv.number)}</b></td>
        <td>${esc(x.clientCode)}</td>
        <td>${esc(x.reference)}</td>
        <td>${esc(inv.paymentMethod)}</td>
        <td>${esc(inv.representative)}</td>
        <td>${date(inv.dueDate)}</td>
      </tr></tbody>
    </table>

    <table class="items">
      <thead><tr>
        ${showCode ? '<th style="width:24mm">Code</th>' : ''}
        <th>Désignation</th><th style="width:12mm">Unité</th><th style="width:15mm">Qté</th>
        <th style="width:17mm">P.U. HT</th><th style="width:12mm">Rem.%</th><th style="width:17mm">P.U.N. HT</th>
        <th style="width:20mm">Net HT</th><th style="width:9mm">TVA</th>
      </tr></thead>
      <tbody>${rows}${filler}</tbody>
    </table>

    <div class="bottom">
      <div class="totrow">
        <table class="vat">
          <thead><tr><th>Taux</th><th>Base</th><th>TVA</th></tr></thead>
          <tbody>${vatRows}</tbody>
        </table>
        <table class="tot">
          <tr><td class="k">Total HT :</td><td class="v num">${money(gross)}</td><td class="k">Total TVA :</td><td class="v num">${money(t.totalTva)}</td></tr>
          <tr><td class="k">Remise lignes :</td><td class="v num">${money(discount)}</td><td class="k">Timbre :</td><td class="v num">${money(t.timbre)}</td></tr>
          <tr><td class="k">Net HT :</td><td class="v num">${money(t.subtotalHt)}</td><td class="k grand">Total TTC :</td><td class="v num grand">${money(t.totalTtc)}</td></tr>
        </table>
      </div>
      <div class="words">${L.words.replace(' :', '')} : <b>${esc(amountInWords(t.totalTtc))}</b></div>

      <div class="meta">
        <span>${kind === 'facture' && co.rib ? `<b>RIB :</b> ${esc(co.rib)}${co.bank ? ` — ${esc(co.bank)}` : ''}` : ''}</span>
        <span>${x.paid !== undefined
          ? `<b>Total des règlements :</b> ${money(x.paid)} &nbsp;&nbsp; <b>Reste à payer :</b> ${money(Math.max(0, t.totalTtc - x.paid))} DT`
          : kind === 'facture' ? `<b>Net à payer :</b> ${money(t.totalTtc)} DT` : ''}</span>
      </div>
      ${co.conditions[kind] ? `<div class="notes"><b>Conditions :</b> ${nl2br(co.conditions[kind])}</div>` : ''}
      ${inv.notes ? `<div class="notes"><b>Notes :</b> ${nl2br(inv.notes)}</div>` : ''}
      ${co.showSignatures ? `<div class="sign"><div>${L.signL}</div><div>${L.signR}</div></div>` : ''}
      ${co.footer ? `<div class="legal">${nl2br(co.footer)}</div>` : ''}
    </div>
  </div>
  ${page ? `<script>
    // Une seule page : la grille s'étire pour que les totaux tombent en bas de la feuille.
    (function () {
      var fill = document.querySelector('tr.fill'), sheet = document.querySelector('.sheet')
      if (!fill || !sheet) return
      var free = ${page.height} - sheet.getBoundingClientRect().height - 2
      if (free > 0) fill.style.height = free + 'px'
    })()
  </script>` : ''}
</body></html>`
}

/** Point d'entrée : choisit le modèle selon Paramètres > Documents > Mise en page. */
export function renderInvoiceHtml(inv: DocView, co: CompanyInfo, kind: DocKind = 'facture', extras: PrintExtras = {}): string {
  return co.layout === 'moderne' ? renderModern(inv, co, kind, extras) : renderClassic(inv, co, kind, extras)
}

/** Pied de page répété sur chaque page (gabarit printToPDF) : société à gauche, « Page x / y » à droite. */
export function footerTemplate(co: CompanyInfo, number: string | null, kind: DocKind = 'facture'): string {
  if (co.layout !== 'moderne') {
    // Classique : simple « 1 / 1 » à droite, comme sur les documents papier habituels.
    return `<div style="width:100%;font-size:8px;font-family:Arial,sans-serif;color:#000;padding:0 11mm;text-align:right;">
      <span class="pageNumber"></span> / <span class="totalPages"></span></div>`
  }
  const left = [co.name, co.taxId && `MF ${co.taxId}`].filter(Boolean).map(esc).join(' — ')
  return `<div style="width:100%;font-size:8px;font-family:Segoe UI,Arial,sans-serif;color:#5b6478;padding:0 11mm;display:flex;justify-content:space-between;">
    <span>${left}</span>
    <span>${number ? `${LABELS[kind].name} ${esc(number)} — ` : ''}Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`
}
