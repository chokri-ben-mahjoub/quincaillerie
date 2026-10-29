import { ipcMain } from 'electron'
import { resetDatabase } from '../db'
import { invalidateSettingsCache } from '../settings'
import { clearSession } from './auth'
import { runBackup } from './backup'
import { demoStats, generateDemo } from '../demo/seed'
import type { DemoOptions, DemoReport, DemoStats, ResetOptions } from '@shared/demo'
import type { Result } from '@shared/types'

// Données de démonstration et remise à zéro de la base (administrateur uniquement : canaux « demo: »).
export function registerDemoHandlers(): void {
  const wrap = <T,>(channel: string, fn: (...a: any[]) => Promise<T> | T) =>
    ipcMain.handle(channel, async (_e, ...args): Promise<Result<T>> => {
      try { return { ok: true, data: await fn(...args) } } catch (err: any) { return { ok: false, error: String(err?.message ?? err) } }
    })

  wrap('demo:stats', (): DemoStats => demoStats())

  wrap('demo:generate', (o: DemoOptions): DemoReport => {
    const opts: DemoOptions = {
      articles: Math.min(Math.max(Math.round(Number(o.articles) || 0), 0), 3000), partners: !!o.partners, purchases: !!o.purchases,
      salesDays: Math.min(Math.max(Math.round(Number(o.salesDays) || 0), 0), 365), documents: !!o.documents
    }
    return generateDemo(opts)
  })

  // Remise à zéro : une sauvegarde est faite d'abord ; en cas d'échec de la sauvegarde, rien n'est supprimé.
  wrap('demo:reset', async (o: ResetOptions) => {
    if (o?.confirm !== 'VIDER') throw new Error('Confirmation incorrecte : tapez VIDER.')
    const backup = await runBackup()
    resetDatabase({ settings: !!o.keepSettings, users: !!o.keepUsers })
    invalidateSettingsCache()
    if (!o.keepUsers) clearSession() // sans comptes, l'application revient à l'écran de création de l'administrateur
    return { backup }
  })
}
