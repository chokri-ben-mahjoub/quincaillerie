import { useEffect, useState } from 'react'
import { DEFAULT_APP_CONFIG, type AppConfig } from '@shared/settings'

/** Configuration de l'application (modes de paiement, remise max, alertes de stock…) lue depuis les Paramètres. */
export function useAppConfig(): AppConfig {
  const [cfg, setCfg] = useState<AppConfig>(DEFAULT_APP_CONFIG)
  useEffect(() => {
    let alive = true
    window.api.app.config().then((r) => { if (alive && r.ok) setCfg(r.data) })
    return () => { alive = false }
  }, [])
  return cfg
}
