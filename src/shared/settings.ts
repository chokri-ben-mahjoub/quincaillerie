// Registre des paramètres de l'application. Chaque réglage a une clé, une valeur par défaut et un type
// qui sert à le valider. La table `settings` (clé/valeur) ne contient que les valeurs modifiées :
// toute clé absente retombe sur sa valeur par défaut ci-dessous (donc « rien en dur » ailleurs dans le code).

export type SettingType = 'text' | 'multiline' | 'int' | 'percent' | 'money' | 'color' | 'bool' | 'rates' | 'choice' | 'image' | 'prefix'

export interface SettingDef {
  key: string
  default: string
  type: SettingType
  min?: number
  max?: number
  maxLength?: number
  options?: string[]
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
  def('tax_prices_mode', 'HT', 'choice', { options: ['HT', 'TTC'] }) // les prix du catalogue sont-ils HT ou TTC ?
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
      return s.length > (d.maxLength ?? 500) ? fail(`${d.maxLength} caractères maximum.`) : { ok: true, value: s }
    case 'prefix': {
      const p = s.toUpperCase()
      return /^[A-Z0-9]{1,6}$/.test(p) ? { ok: true, value: p } : fail('1 à 6 lettres ou chiffres (sans espace).')
    }
    case 'int':
      return Number.isInteger(num) && s !== '' && num >= (d.min ?? 0) && num <= (d.max ?? 1e9)
        ? { ok: true, value: String(num) } : fail(`Entier entre ${d.min} et ${d.max}.`)
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
