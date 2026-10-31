import { ipcMain } from 'electron'
import { listPrinters, printHtml, testPageHtml, type PrintFormat } from '../print/printer'
import { getCompany } from './invoices'
import { detectPrinters } from '../print/detect'
import type { Result } from '@shared/types'

// Canaux d'administration de l'impression (réservés au gérant et à l'administrateur par isAllowed).
export function registerPrintHandlers(): void {
  const wrap = <T,>(channel: string, fn: (...a: any[]) => Promise<T>) =>
    ipcMain.handle(channel, async (_e, ...args): Promise<Result<T>> => {
      try { return { ok: true, data: await fn(...args) } } catch (err: any) { return { ok: false, error: String(err?.message ?? err) } }
    })

  wrap('print:printers', () => listPrinters())
  wrap('print:detect', () => detectPrinters())
  wrap('print:test', async (format: PrintFormat) => {
    if (format !== 'a4' && format !== 'ticket') throw new Error('Format inconnu.')
    return printHtml(testPageHtml(format, getCompany().name || 'Quincaillerie'), format)
  })
}
