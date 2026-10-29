import { BrowserWindow } from 'electron'
import { tmpdir } from 'os'
import { join } from 'path'
import { unlinkSync, writeFileSync } from 'fs'

/** Rend un HTML en PDF A4 avec pied de page paginé. Fenêtre invisible, fichier temporaire supprimé après usage. */
export async function htmlToPdf(html: string, footer: string): Promise<Buffer> {
  const file = join(tmpdir(), `quincaillerie-print-${Date.now()}.html`)
  writeFileSync(file, html, 'utf8')
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  try {
    await win.loadFile(file)
    return await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true, // nécessaire pour les fonds de tableau et d'en-tête
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footer,
      margins: { top: 0.4, bottom: 0.7, left: 0.4, right: 0.4 } // en pouces (≈ 10 mm / 18 mm)
    })
  } finally {
    win.destroy()
    try { unlinkSync(file) } catch { /* déjà supprimé */ }
  }
}
