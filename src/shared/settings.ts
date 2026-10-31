// Registre des paramètres de l'application. Chaque réglage a une clé, une valeur par défaut et un type
// qui sert à le valider. La table `settings` (clé/valeur) ne contient que les valeurs modifiées :
// toute clé absente retombe sur sa valeur par défaut ci-dessous (donc « rien en dur » ailleurs dans le code).

import { UNITS } from './types'
import { PERMISSION_IDS } from './permissions'

export type SettingType = 'strings' | 'list' | 'number' | 'text' | 'multiline' | 'int' | 'percent' | 'money' | 'color' | 'bool' | 'rates' | 'choice' | 'image' | 'prefix'

export interface SettingDef {
  key: string
  default: string
  type: SettingType
  min?: number
  max?: number
  maxLength?: number
  options?: string[]
  pattern?: string // expression régulière pour les textes
  patternMessage?: string
}

const def = (key: string, dflt: string, type: SettingType, extra: Partial<SettingDef> = {}): SettingDef =>
  ({ key, default: dflt, type, ...extra })

export const SETTING_DEFS: SettingDef[] = [
  // ----- Société -----
  def('company_name', '', 'text', { maxLength: 120 }),
  def('company_mf', '', 'text', { maxLength: 40 }), // matricule fiscal
  def('company_rc', '', 'text', { maxLength: 40 }), // registre de commerce
  def('company_address', '', 'multiline', { maxLength: 300 }),
  def('company_phone', '', 'text', { maxLength: 40 }),
  def('company_email', '', 'text', { maxLength: 120 }),
  def('company_website', '', 'text', { maxLength: 120 }),
  def('company_bank', '', 'text', { maxLength: 80 }),
  def('company_rib', '', 'text', { maxLength: 40 }),
  def('company_logo', '', 'image'),

  // ----- Documents -----
  def('doc_prefix_facture', 'FA', 'prefix'),
  def('doc_prefix_devis', 'DV', 'prefix'),
  def('doc_prefix_bon_commande', 'BC', 'prefix'),
  def('doc_prefix_bon_livraison', 'BL', 'prefix'),
  def('doc_separator', '-', 'choice', { options: ['-', '/', '.', '_'] }),
  def('doc_include_year', '1', 'bool'),
  def('doc_number_digits', '4', 'int', { min: 3, max: 8 }),
  def('doc_reset_yearly', '1', 'bool'), // 1 = le compteur repart à 1 chaque année
  def('doc_accent_color', '#14213d', 'color'),
  def('doc_layout', 'classique', 'choice', { options: ['classique', 'moderne'] }), // modèle d'impression A4
  def('doc_header_title', '', 'text', { maxLength: 60 }), // grand titre de l'en-tête ('' = raison sociale)
  def('doc_show_code', '1', 'bool'), // colonne « Code » (code-barres de l'article)
  def('doc_show_signatures', '1', 'bool'), // cadres de signature en bas du document
  def('doc_quote_validity_days', '30', 'int', { min: 0, max: 365 }), // 0 = pas de date de validité par défaut
  def('doc_invoice_due_days', '0', 'int', { min: 0, max: 365 }), // 0 = pas d'échéance par défaut
  def('company_footer', '', 'multiline', { maxLength: 300 }), // pied de page de tous les documents
  def('doc_conditions_facture', '', 'multiline', { maxLength: 500 }),
  def('doc_conditions_devis', '', 'multiline', { maxLength: 500 }),
  def('doc_conditions_bon_commande', '', 'multiline', { maxLength: 500 }),
  def('doc_conditions_bon_livraison', '', 'multiline', { maxLength: 500 }),

  // ----- Taxes -----
  def('tax_rates', '0,7,13,19', 'rates'), // taux proposés dans les documents
  def('tax_default_rate', '19', 'percent'),
  def('tax_timbre_amount', '1.000', 'money'), // droit de timbre, en dinars
  def('tax_timbre_default', '1', 'bool'), // coché par défaut sur les nouvelles factures
  def('tax_prices_mode', 'HT', 'choice', { options: ['HT', 'TTC'] }), // les prix du catalogue sont-ils HT ou TTC ?

  // ----- Ventes -----
  def('sales_max_discount_pct', '100', 'percent'), // remise maximale d'un caissier (gérant et admin : sans limite)
  def('sales_payment_methods', 'especes,carte,cheque,credit', 'list', { options: ['especes', 'carte', 'cheque', 'credit'] }),
  def('sales_default_method', 'especes', 'choice', { options: ['especes', 'carte', 'cheque', 'credit'] }),
  def('sales_allow_below_stock', '0', 'bool'), // autoriser la vente quand le stock est insuffisant
  def('sales_credit_default_limit', '0.000', 'money'), // plafond de crédit proposé pour un nouveau client
  def('sales_allow_edit', '1', 'bool'), // le caissier peut modifier / annuler une vente encaissée
  def('sales_cashier_edit_hours', '24', 'int', { min: 0, max: 720 }), // délai pour le caissier (0 = sans limite)

  // ----- Stock -----
  def('stock_default_min', '0', 'number'), // seuil d'alerte proposé pour un nouvel article
  def('stock_default_unit', 'pièce', 'text', { maxLength: 20 }), // doit faire partie de list_units
  def('stock_alerts_enabled', '1', 'bool'),
  def('stock_alert_margin_pct', '0', 'int', { min: 0, max: 200 }), // alerte dès seuil + X %

  // ----- Sauvegarde -----
  def('backup_dir', '', 'text', { maxLength: 300 }), // '' = dossier « backups » des données de l'application
  def('backup_keep', '14', 'int', { min: 1, max: 365 }), // nombre de sauvegardes conservées
  def('backup_frequency', 'daily', 'choice', { options: ['off', '6h', '12h', 'daily', 'weekly'] }),
  def('backup_on_quit', '0', 'bool'), // sauvegarde à la fermeture de l'application

  // ----- Listes -----
  def('list_units', UNITS.join(','), 'strings', { maxLength: 20 }), // unités proposées (articles, documents)

  // ----- Droits (l'administrateur a tous les droits) -----
  def('perm_gerant', PERMISSION_IDS.join(','), 'list', { options: PERMISSION_IDS }),
  def('perm_caissier', 'caisse', 'list', { options: PERMISSION_IDS }),

  // ----- Caisse : ouverture et clôture -----
  def('cash_session_required', '0', 'bool'), // interdire d'encaisser tant que la caisse n'est pas ouverte
  def('cash_default_float', '100.000', 'money'), // fond de caisse proposé à l'ouverture
  def('cash_gap_tolerance', '0.500', 'money'), // écart toléré sans explication à la clôture
  def('cash_denominations', '50,20,10,5,2,1,0.5,0.2,0.1,0.05,0.02,0.01', 'strings', { maxLength: 8 }), // billets et pièces à compter (DT)
  def('cash_blind_count', '0', 'bool'), // comptage « à l'aveugle » : le montant attendu n'est montré qu'après le comptage
  def('cash_print_z', '1', 'bool'), // imprimer le ticket de clôture (Z)

  // ----- Chèques et traites -----
  def('cheques_auto_capture', '1', 'bool'), // chaque paiement par chèque crée sa ligne à compléter
  def('cheques_remind_days', '3', 'int', { min: 0, max: 60 }), // rappel avant la date d'encaissement / d'échéance
  def('cheques_banks', 'BIAT,STB,BNA,Attijari Bank,Amen Bank,BH Bank,UIB,UBCI,Banque Zitouna,ATB,BT,QNB,Al Baraka Bank,Wifak Bank,La Poste', 'strings', { maxLength: 40 }),

  // ----- Dépenses -----
  def('expenses_methods', 'especes,cheque,virement,carte,prelevement', 'list', { options: ['especes', 'cheque', 'virement', 'carte', 'prelevement'] }),
  def('expenses_default_method', 'especes', 'choice', { options: ['especes', 'cheque', 'virement', 'carte', 'prelevement'] }),
  def('expenses_remind_days', '7', 'int', { min: 0, max: 60 }), // rappel sur l'accueil X jours avant l'échéance
  def('expenses_auto_next', '1', 'bool'), // charge récurrente payée : prépare l'échéance suivante
  def('expenses_cash_enabled', '1', 'bool'), // « payée avec l'argent de la caisse » (déduite des espèces attendues)
  def('expenses_require_attachment', '0', 'bool'), // photo / PDF de la facture obligatoire
  def('expenses_report_basis', 'facture', 'choice', { options: ['facture', 'paiement'] }), // date retenue dans les rapports

  // ----- Impression ('' = imprimante par défaut de Windows) -----
  def('print_a4_printer', '', 'text', { maxLength: 200 }),
  def('print_a4_copies', '1', 'int', { min: 1, max: 10 }),
  def('print_a4_silent', '0', 'bool'), // impression directe, sans boîte de dialogue
  def('print_ticket_printer', '', 'text', { maxLength: 200 }),
  def('print_ticket_copies', '1', 'int', { min: 1, max: 10 }),
  def('print_ticket_silent', '0', 'bool'),
  def('print_ticket_paper', '80', 'choice', { options: ['80', '58'] }), // largeur du rouleau en mm
  def('print_ticket_auto', '0', 'bool'), // imprimer le ticket automatiquement après chaque vente

  // ----- Partage (WhatsApp / e-mail) -----
  def('share_country_code', '+216', 'text', { maxLength: 5, pattern: '^\\+\\d{1,4}$', patternMessage: 'Indicatif au format +216.' }),
  def('share_whatsapp_enabled', '1', 'bool'),
  def('share_email_enabled', '1', 'bool'),
  def('share_whatsapp_message', "Bonjour {client},\nVeuillez trouver ci-joint votre {document} n° {numero} d'un montant de {montant} DT.\nMerci pour votre confiance.\n{societe}", 'multiline', { maxLength: 1000 }),
  def('share_email_subject', '{document} n° {numero} — {societe}', 'text', { maxLength: 200 }),
  def('share_email_body', "Bonjour {client},\n\nVeuillez trouver ci-joint votre {document} n° {numero} du {date}, d'un montant de {montant} DT.\n\nCordialement,\n{societe}", 'multiline', { maxLength: 2000 })
]

export type SettingsMap = Record<string, string>
export const SETTING_DEFAULTS: SettingsMap = Object.fromEntries(SETTING_DEFS.map((d) => [d.key, d.default]))

export type ValidationResult = { ok: true; value: string } | { ok: false; error: string }

/** Valide et normalise une valeur (ex. « 1,5 » -> « 1.500 »). Utilisé côté principal, qui fait foi. */
export function validateSetting(d: SettingDef, raw: unknown): ValidationResult {
  const s = String(raw ?? '').trim()
  const fail = (error: string): ValidationResult => ({ ok: false, error })
  const num = Number(s.replace(',', '.'))

  switch (d.type) {
    case 'text':
    case 'multiline':
      if (s.length > (d.maxLength ?? 500)) return fail(`${d.maxLength} caractères maximum.`)
      if (d.pattern && !new RegExp(d.pattern).test(s)) return fail(d.patternMessage ?? 'Format invalide.')
      return { ok: true, value: s }
    case 'prefix': {
      const p = s.toUpperCase()
      return /^[A-Z0-9]{1,6}$/.test(p) ? { ok: true, value: p } : fail('1 à 6 lettres ou chiffres (sans espace).')
    }
    case 'int':
      return Number.isInteger(num) && s !== '' && num >= (d.min ?? 0) && num <= (d.max ?? 1e9)
        ? { ok: true, value: String(num) } : fail(`Entier entre ${d.min} et ${d.max}.`)
    case 'strings': {
      const items = s.split(',').map((x) => x.trim()).filter(Boolean)
      const seen = new Set<string>()
      for (const it of items) {
        if (it.length > (d.maxLength ?? 20)) return fail(`${d.maxLength} caractères maximum par élément.`)
        if (seen.has(it.toLowerCase())) return fail(`« ${it} » apparaît deux fois.`)
        seen.add(it.toLowerCase())
      }
      return items.length >= 1 && items.length <= 60 ? { ok: true, value: items.join(',') } : fail('Entre 1 et 60 éléments.')
    }
    case 'number':
      return s !== '' && num >= 0 && num <= 1_000_000 ? { ok: true, value: String(num) } : fail('Nombre positif.')
    case 'list': {
      const items = s.split(',').map((x) => x.trim()).filter(Boolean)
      if (items.some((x) => !d.options!.includes(x)) || (!items.length && !d.key.startsWith('perm_'))) return fail('Choix invalide.')
      return { ok: true, value: d.options!.filter((o) => items.includes(o)).join(',') } // ordre canonique
    }
    case 'percent':
      return s !== '' && num >= 0 && num <= 100 ? { ok: true, value: String(num) } : fail('Pourcentage entre 0 et 100.')
    case 'money':
      return s !== '' && num >= 0 && num <= 100000 ? { ok: true, value: num.toFixed(3) } : fail('Montant positif en dinars.')
    case 'color':
      return /^#[0-9a-fA-F]{6}$/.test(s) ? { ok: true, value: s.toLowerCase() } : fail('Couleur au format #RRGGBB.')
    case 'bool':
      return ['0', '1', 'true', 'false'].includes(s) ? { ok: true, value: s === '1' || s === 'true' ? '1' : '0' } : fail('Valeur invalide.')
    case 'choice':
      return d.options!.includes(s) ? { ok: true, value: s } : fail('Choix invalide.')
    case 'rates': {
      const list = s.split(',').map((x) => Number(x.trim().replace(',', '.')))
      if (!list.length || list.some((n) => !Number.isFinite(n) || n < 0 || n > 100)) return fail('Taux entre 0 et 100, séparés par des virgules.')
      return { ok: true, value: [...new Set(list)].sort((a, b) => a - b).join(',') }
    }
    case 'image':
      if (s === '') return { ok: true, value: '' }
      if (!/^data:image\/(png|jpeg|svg\+xml);base64,/.test(s)) return fail('Image PNG, JPG ou SVG attendue.')
      return s.length > 1_500_000 ? fail('Image trop volumineuse (1 Mo maximum).') : { ok: true, value: s }
  }
}

/** Numéro de document : préfixe + [année] + compteur, ex. FA-2026-0001 ou FA/0001. */
export function formatDocNumber(
  o: { prefix: string; separator: string; includeYear: boolean; digits: number }, year: number, seq: number
): string {
  const parts = [o.prefix]
  if (o.includeYear) parts.push(String(year))
  parts.push(String(seq).padStart(o.digits, '0'))
  return parts.join(o.separator)
}

// ---------- Configuration lue par l'interface (tout rôle connecté) ----------
export interface AppConfig {
  maxDiscountPct: number // remise maximale pour l'utilisateur courant
  paymentMethods: string[]
  defaultMethod: string
  allowBelowStock: boolean
  creditDefaultLimit: number
  stockDefaultMin: number
  stockDefaultUnit: string
  alertsEnabled: boolean
  alertMarginPct: number
  units: string[] // unités proposées
  pages: string[] // pages accessibles à l'utilisateur courant
  allowSaleEdit: boolean // l'utilisateur courant peut modifier / annuler les ventes
  autoPrintTicket: boolean
  whatsappEnabled: boolean
  emailEnabled: boolean
  expenseMethods: string[] // modes de paiement proposés pour les dépenses
  expenseDefaultMethod: string
  expenseCashEnabled: boolean // option « payée avec l'argent de la caisse »
  expenseRequireAttachment: boolean
  cashSessionRequired: boolean
  cashDefaultFloat: number
  cashGapTolerance: number
  cashDenominations: number[]
  cashBlindCount: boolean
  chequeBanks: string[]
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  maxDiscountPct: 100, paymentMethods: ['especes', 'carte', 'cheque', 'credit'], defaultMethod: 'especes', allowBelowStock: false,
  creditDefaultLimit: 0, stockDefaultMin: 0, stockDefaultUnit: 'pièce', alertsEnabled: true, alertMarginPct: 0,
  units: [...UNITS], pages: [],
  allowSaleEdit: true, autoPrintTicket: false, whatsappEnabled: true, emailEnabled: true,
  expenseMethods: ['especes', 'cheque', 'virement', 'carte', 'prelevement'], expenseDefaultMethod: 'especes', expenseCashEnabled: true, expenseRequireAttachment: false,
  cashSessionRequired: false, cashDefaultFloat: 100, cashGapTolerance: 0.5, cashDenominations: [50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01], cashBlindCount: false, chequeBanks: []
}

/** Niveau de stock d'un article : rupture, bas (alerte) ou normal. L'alerte se déclenche à seuil + marge %. */
export function stockLevel(stock: number, min: number, cfg: Pick<AppConfig, 'alertsEnabled' | 'alertMarginPct'>): 'out' | 'low' | 'ok' {
  if (stock <= 0) return 'out'
  if (cfg.alertsEnabled && min > 0 && stock <= min * (1 + cfg.alertMarginPct / 100)) return 'low'
  return 'ok'
}

// ---------- Partage : modèles de message et numéros ----------
export const SHARE_PLACEHOLDERS = ['client', 'document', 'numero', 'montant', 'date', 'societe'] as const

/** Remplace {client}, {numero}… dans un modèle ; une variable inconnue est laissée telle quelle. */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
}

/** Numéro au format international sans « + » pour wa.me : « 73 000 111 » -> « 21673000111 » (indicatif +216). */
export function normalizePhone(raw: string, countryCode: string): string {
  const cc = countryCode.replace(/\D/g, '')
  let d = raw.replace(/[^\d+]/g, '')
  if (d.startsWith('+')) return d.slice(1)
  d = d.replace(/\D/g, '')
  if (d.startsWith('00')) return d.slice(2)
  if (d.startsWith(cc) && d.length > 8) return d // déjà avec l'indicatif
  return cc + d.replace(/^0+/, '')
}
