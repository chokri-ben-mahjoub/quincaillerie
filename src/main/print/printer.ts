import { BrowserWindow } from 'electron'
import { tmpdir } from 'os'
import { join } from 'path'
import { unlinkSync, writeFileSync } from 'fs'
import { getSettings } from '../settings'

export type PrintFormat = 'a4' | 'ticket'
const PX_TO_MICRONS = 264.583 // 1 px CSS = 0.2646 mm

/** Imprimantes installées sur le poste (nom système + imprimante par défaut). */
export async function listPrinters(): Promise<{ name: string; isDefault: boolean }[]> {
  const host = BrowserWindow.getAllWindows()[0] ?? new BrowserWindow({ show: false })
  const printers = await host.webContents.getPrintersAsync()
  return printers.map((p) => ({ name: p.name, isDefault: !!p.isDefault }))
}

/**
 * Imprime un HTML avec les réglages de Paramètres > Impression : imprimante, copies, impression directe,
 * largeur du rouleau (ticket). Sans imprimante choisie, la boîte de dialogue de Windows s'affiche
 * (sauf impression directe : alors l'imprimante par défaut est utilisée).
 * Renvoie false si l'utilisateur annule.
 */
export async function printHtml(html: string, format: PrintFormat): Promise<boolean> {
  const s = getSettings()
  const p = format === 'ticket' ? 'print_ticket_' : 'print_a4_'
  const deviceName = s[p + 'printer'] || undefined
  const copies = Math.max(1, Number(s[p + 'copies']) || 1)
  const silent = s[p + 'silent'] === '1'

  const file = join(tmpdir(), `quincaillerie-print-${Date.now()}.html`)
  writeFileSync(file, html, 'utf8')
  const win = new BrowserWindow({ show: false, width: format === 'ticket' ? 320 : 794, height: 600, webPreferences: { sandbox: true, contextIsolation: true } })
  try {
    await win.loadFile(file)
    // Ticket : papier de largeur fixe et de hauteur ajustée au contenu (rouleau). A4 : page standard.
    let pageSize: Electron.WebContentsPrintOptions['pageSize'] = 'A4'
    let margins: Electron.WebContentsPrintOptions['margins'] = { marginType: 'custom', top: 38, bottom: 38, left: 30, right: 30 } // ≈ 10 mm
    if (format === 'ticket') {
      const h = (await win.webContents.executeJavaScript('document.documentElement.scrollHeight')) as number
      pageSize = { width: Number(s.print_ticket_paper) * 1000, height: Math.round((h + 8) * PX_TO_MICRONS) }
      margins = { marginType: 'none' }
    }
    return await new Promise<boolean>((resolve, reject) => {
      win.webContents.print({ silent, printBackground: true, deviceName, copies, pageSize, margins }, (success, reason) => {
        if (success) return resolve(true)
        if (/cancel/i.test(reason)) return resolve(false)
        reject(new Error(deviceName && /device|printer/i.test(reason)
          ? `Imprimante « ${deviceName} » introuvable ou indisponible. Vérifiez qu’elle est allumée et branchée, puis Paramètres > Impression > Détecter.`
          : `Échec de l'impression : ${reason}`))
      })
    })
  } finally {
    win.destroy()
    try { unlinkSync(file) } catch { /* déjà supprimé */ }
  }
}

/** Page de test (A4 ou ticket) pour vérifier l'imprimante choisie. */
export function testPageHtml(format: PrintFormat, shopName: string): string {
  const w = format === 'ticket' ? `${getSettings().print_ticket_paper}mm` : '190mm'
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    body { font-family: "Segoe UI", Arial, sans-serif; width: ${w}; padding: ${format === 'ticket' ? '3mm 4mm' : '0'}; font-size: 10pt; }
    h1 { font-size: 14pt; margin: 0 0 4px; } .box { border: 1px solid #000; padding: 6px 10px; margin-top: 8px; }
  </style></head><body>
    <h1>${shopName.replace(/[<>&]/g, '')}</h1>
    <div>Page de test — ${format === 'ticket' ? 'ticket ' + getSettings().print_ticket_paper + ' mm' : 'A4'}</div>
    <div class="box">Si vous lisez ce texte en entier, l'imprimante est bien réglée.</div>
    <div class="box">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>0123456789 — 123 456,789 DT</div>
  </body></html>`
}
