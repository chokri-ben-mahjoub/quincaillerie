import { getDb } from './db'
import { SETTING_DEFAULTS, SETTING_DEFS, validateSetting, type SettingsMap } from '@shared/settings'

// Service des paramètres : seul point d'accès à la table clé/valeur pour les autres modules.

/** Toutes les valeurs, avec la valeur par défaut pour les clés jamais modifiées. */
let cache: SettingsMap | null = null // invalidé à chaque enregistrement
export const invalidateSettingsCache = (): void => { cache = null }

export function getSettings(): SettingsMap {
  if (cache) return cache
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string | null }[]
  const out: SettingsMap = { ...SETTING_DEFAULTS }
  for (const r of rows) if (r.key in out && r.value !== null) out[r.key] = r.value
  cache = out
  return out
}

export const getSetting = (key: string): string => getSettings()[key] ?? ''
export const getSettingNumber = (key: string): number => Number(getSetting(key)) || 0
export const getSettingBool = (key: string): boolean => getSetting(key) === '1'

/** Enregistre un lot de modifications : tout est validé d'abord, puis écrit en une transaction (tout ou rien). */
export function saveSettings(changes: Record<string, unknown>): SettingsMap {
  const defs = new Map(SETTING_DEFS.map((d) => [d.key, d]))
  const clean: Record<string, string> = {}
  const errors: string[] = []

  for (const [key, raw] of Object.entries(changes)) {
    const d = defs.get(key)
    if (!d) { errors.push(`Réglage inconnu : ${key}`); continue }
    const r = validateSetting(d, raw)
    if (r.ok) clean[key] = r.value
    else errors.push(`${key} : ${r.error}`)
  }
  if (errors.length) throw new Error(errors.join('\n'))

  const merged = { ...getSettings(), ...clean }
  // Règle croisée : l'unité par défaut doit exister dans la liste des unités.
  if (!merged.list_units.split(',').includes(merged.stock_default_unit))
    throw new Error('L’unité par défaut doit faire partie de la liste des unités.')

  // Règle croisée : le mode de paiement par défaut doit être activé.
  if (!merged.sales_payment_methods.split(',').includes(merged.sales_default_method))
    throw new Error('Le mode de paiement par défaut doit faire partie des modes activés.')

  // Règle croisée : le taux par défaut doit faire partie des taux proposés.
  if (!merged.tax_rates.split(',').map(Number).includes(Number(merged.tax_default_rate)))
    throw new Error('Le taux de TVA par défaut doit figurer dans la liste des taux.')

  const up = getDb().prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  getDb().transaction(() => { for (const [k, v] of Object.entries(clean)) up.run(k, v) })()
  cache = null
  return getSettings()
}
