import { BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import { getSettings } from '../settings'
import type { DetectedPrinter, PrinterDetection, PrinterKind, PrinterLink, PrinterState } from '@shared/printers'

// Imprimantes virtuelles (fichier) : jamais proposées pour imprimer un ticket ou une facture papier.
const VIRTUAL = /pdf|xps|onenote|fax|send to|envoyer vers|microsoft print to|document writer|cutepdf/i
// Imprimantes thermiques à ticket : marques et pilotes courants au comptoir.
const THERMAL = /\b(pos|receipt|thermal|thermique|ticket)\b|pos-?\d{2}|tm-?[a-z]?\d{2}|tsp\s?\d|xp-?\s?\d{2,3}|xprinter|rongta|bixolon|srp-|citizen ct|star (tsp|mc|sp)|sewoo|gprinter|zjiang|hprt|sunmi|munbyn|epson tm|\b(58|80)\s?mm\b/i

interface WinPrinter { Name: string; PortName?: string; DriverName?: string; PrinterStatus?: number; Shared?: boolean; Type?: number }

/** Détails Windows (port, pilote) via PowerShell ; rien ailleurs ou en cas d'échec : la détection reste utilisable. */
function windowsDetails(): Promise<Map<string, WinPrinter>> {
  if (process.platform !== 'win32') return Promise.resolve(new Map())
  return new Promise((resolve) => {
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-Printer | Select-Object Name,PortName,DriverName,PrinterStatus,Shared,Type | ConvertTo-Json -Compress'],
      { timeout: 6000, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout.trim()) return resolve(new Map())
        try {
          const parsed = JSON.parse(stdout)
          const list: WinPrinter[] = Array.isArray(parsed) ? parsed : [parsed]
          resolve(new Map(list.map((p) => [p.Name, p])))
        } catch { resolve(new Map()) }
      })
  })
}

function linkOf(port: string, name: string, kind: PrinterKind, win?: WinPrinter): PrinterLink {
  if (kind === 'virtuelle' || /^(portprompt|nul|file|xps|pdf)/i.test(port)) return 'virtuelle'
  if (/^usb|^dot4/i.test(port)) return 'usb'
  if (/^bth|bluetooth/i.test(port)) return 'bluetooth'
  if (/^\\\\/.test(name) || win?.Type === 1) return 'partagee' // \\serveur\imprimante
  if (/^(ip_|wsd|tcp|http|lpr)|\d{1,3}(\.\d{1,3}){3}/i.test(port)) return 'reseau'
  if (/^com\d|^lpt\d/i.test(port)) return 'usb' // port série / parallèle direct : branché au poste
  return 'inconnue'
}

/** État : drapeaux Windows remontés par Electron (0 = prête), complétés par Get-Printer. */
function stateOf(status: number, win?: WinPrinter): PrinterState {
  const s = status | 0
  if (s & 0x80 || win?.PrinterStatus === 7) return 'hors_ligne'
  if (s & (0x8 | 0x10 | 0x40) || win?.PrinterStatus === 4 || win?.PrinterStatus === 5) return 'papier'
  if (s & 0x2 || win?.PrinterStatus === 2) return 'erreur'
  if (s & 0x1 || win?.PrinterStatus === 1) return 'pause'
  return s === 0 ? 'prete' : 'inconnu'
}

export function classify(name: string, driver: string): { kind: PrinterKind; paperMm: 58 | 80 | null } {
  const text = `${name} ${driver}`
  if (VIRTUAL.test(text)) return { kind: 'virtuelle', paperMm: null }
  if (THERMAL.test(text)) return { kind: 'ticket', paperMm: /58/.test(text) ? 58 : /80/.test(text) ? 80 : null }
  return { kind: 'a4', paperMm: null }
}

export async function detectPrinters(): Promise<PrinterDetection> {
  const host = BrowserWindow.getAllWindows()[0]
  const temp = host ? null : new BrowserWindow({ show: false })
  const [infos, win] = await Promise.all([(host ?? temp!).webContents.getPrintersAsync(), windowsDetails()])
  temp?.destroy()

  const order: Record<PrinterState, number> = { prete: 0, inconnu: 1, pause: 2, papier: 3, erreur: 4, hors_ligne: 5 }
  const printers: DetectedPrinter[] = infos.map((p) => {
    const w = win.get(p.name)
    const opts = (p.options ?? {}) as Record<string, string>
    const driver = w?.DriverName || opts['printer-make-and-model'] || opts['system_driverinfo']?.split(';')[0] || p.description || ''
    const port = w?.PortName ?? ''
    const { kind, paperMm } = classify(p.name, driver)
    return { name: p.name, displayName: p.displayName || p.name, driver, port, isDefault: !!p.isDefault, kind, paperMm,
      link: linkOf(port, p.name, kind, w), state: stateOf(p.status ?? 0, w) }
  }).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || ({ ticket: 0, a4: 1, virtuelle: 2 })[a.kind] - ({ ticket: 0, a4: 1, virtuelle: 2 })[b.kind])

  // Meilleur candidat : branché et prêt d'abord, puis l'imprimante par défaut.
  const best = (kind: PrinterKind) => printers.filter((p) => p.kind === kind)
    .sort((a, b) => order[a.state] - order[b.state] || Number(b.isDefault) - Number(a.isDefault))[0]

  const s = getSettings()
  const exists = (n: string) => !!n && printers.some((p) => p.name === n)
  const ticketPick = exists(s.print_ticket_printer) ? printers.find((p) => p.name === s.print_ticket_printer) : best('ticket')
  const defaultPrinter = printers.find((p) => p.isDefault)
  const a4Pick = exists(s.print_a4_printer) ? s.print_a4_printer
    : defaultPrinter?.kind === 'a4' ? '' // l'imprimante par défaut de Windows convient déjà
    : best('a4')?.name ?? ''

  return {
    printers,
    ticket: { configured: s.print_ticket_printer, found: exists(s.print_ticket_printer), suggestion: ticketPick?.name ?? '', paperMm: ticketPick?.paperMm ?? null },
    a4: { configured: s.print_a4_printer, found: !s.print_a4_printer || exists(s.print_a4_printer), suggestion: a4Pick }
  }
}
