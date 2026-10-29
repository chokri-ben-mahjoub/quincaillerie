import { ipcMain } from 'electron'
import { getSettings, saveSettings } from '../settings'
import { currentUser, grantedPermissions } from './auth'
import { ADMIN_PAGES, PERMISSION_IDS } from '@shared/permissions'
import type { Result } from '@shared/types'
import type { AppConfig, SettingsMap } from '@shared/settings'

// Canaux réservés à l'administrateur (voir isAllowed dans auth.ts). Les autres modules lisent via le service `settings.ts`.
export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:getAll', (): Result<SettingsMap> => {
    try { return { ok: true, data: getSettings() } } catch (e: any) { return { ok: false, error: String(e?.message ?? e) } }
  })
  // Configuration en lecture seule pour l'interface, accessible à tout utilisateur connecté (caissier compris).
  ipcMain.handle('app:config', (): Result<AppConfig> => {
    try {
      const s = getSettings()
      return { ok: true, data: {
        maxDiscountPct: currentUser()?.role === 'caissier' ? Number(s.sales_max_discount_pct) : 100,
        paymentMethods: s.sales_payment_methods.split(','), defaultMethod: s.sales_default_method,
        allowBelowStock: s.sales_allow_below_stock === '1', creditDefaultLimit: Number(s.sales_credit_default_limit),
        stockDefaultMin: Number(s.stock_default_min), stockDefaultUnit: s.stock_default_unit,
        alertsEnabled: s.stock_alerts_enabled === '1', alertMarginPct: Number(s.stock_alert_margin_pct),
        units: s.list_units.split(','),
        pages: currentUser()?.role === 'admin' ? [...PERMISSION_IDS, ...ADMIN_PAGES] : currentUser() ? grantedPermissions(currentUser()!.role) : [],
        allowSaleEdit: currentUser()?.role !== 'caissier' || s.sales_allow_edit === '1',
        autoPrintTicket: s.print_ticket_auto === '1', whatsappEnabled: s.share_whatsapp_enabled === '1', emailEnabled: s.share_email_enabled === '1'
      } }
    } catch (e: any) { return { ok: false, error: String(e?.message ?? e) } }
  })
  ipcMain.handle('settings:set', (_e, changes: Record<string, unknown>): Result<SettingsMap> => {
    try { return { ok: true, data: saveSettings(changes) } } catch (e: any) { return { ok: false, error: String(e?.message ?? e) } }
  })
}
