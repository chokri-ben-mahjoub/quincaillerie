import { ipcMain } from 'electron'
import { getSettings, saveSettings } from '../settings'
import type { Result } from '@shared/types'
import type { SettingsMap } from '@shared/settings'

// Canaux réservés à l'administrateur (voir isAllowed dans auth.ts). Les autres modules lisent via le service `settings.ts`.
export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:getAll', (): Result<SettingsMap> => {
    try { return { ok: true, data: getSettings() } } catch (e: any) { return { ok: false, error: String(e?.message ?? e) } }
  })
  ipcMain.handle('settings:set', (_e, changes: Record<string, unknown>): Result<SettingsMap> => {
    try { return { ok: true, data: saveSettings(changes) } } catch (e: any) { return { ok: false, error: String(e?.message ?? e) } }
  })
}
