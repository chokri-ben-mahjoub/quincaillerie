import { getDb } from './db'
import { SETTING_DEFAULTS, SETTING_DEFS, validateSetting, type SettingsMap } from '@shared/settings'

// Service des paramètres : seul point d'accès à la table clé/valeur pour les autres modules.

/** Toutes les valeurs, avec la valeur par défaut pour les clés jamais modifiées. */
export function getSettings(): SettingsMap {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string | null }[]
  const out: SettingsMap = { ...SETTING_DEFAULTS }
  for (const r of rows) if (r.key in out && r.value !== null) out[r.key] = r.value
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

  // Règle croisée : le taux par défaut doit faire partie des taux proposés.
  const merged = { ...getSettings(), ...clean }
  if (!merged.tax_rates.split(',').map(Number).includes(Number(merged.tax_default_rate)))
    throw new Error('Le taux de TVA par défaut doit figurer dans la liste des taux.')

  const up = getDb().prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  getDb().transaction(() => { for (const [k, v] of Object.entries(clean)) up.run(k, v) })()
  return getSettings()
}
