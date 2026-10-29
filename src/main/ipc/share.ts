import { app, ipcMain, shell } from 'electron'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getSettings } from '../settings'
import { buildPdf, getCompany, KINDS, readDoc } from './invoices'
import { normalizePhone, renderTemplate } from '@shared/settings'
import type { DocKind } from '@shared/invoice'
import type { ShareDraft, ShareRequest } from '@shared/share'
import type { Result } from '@shared/types'

const LABELS: Record<DocKind, string> = { facture: 'Facture', devis: 'Devis', bon_commande: 'Bon de commande', bon_livraison: 'Bon de livraison' }
const money = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).replace(/[  ]/g, ' ')
const isKind = (k: unknown): k is DocKind => typeof k === 'string' && k in KINDS

/** Variables disponibles dans les modèles de message (Paramètres > Partage). */
function variables(kind: DocKind, id: number): Record<string, string> {
  const doc = readDoc(KINDS[kind], id)
  return {
    client: doc.clientName, document: LABELS[kind], numero: doc.number ?? '(brouillon)', montant: money(doc.totals.totalTtc),
    date: doc.issueDate.split('-').reverse().join('/'), societe: getCompany().name
  }
}

export function registerShareHandlers(): void {
  const wrap = <T,>(channel: string, fn: (...a: any[]) => Promise<T> | T) =>
    ipcMain.handle(channel, async (_e, ...args): Promise<Result<T>> => {
      try { return { ok: true, data: await fn(...args) } } catch (err: any) { return { ok: false, error: String(err?.message ?? err) } }
    })

  // Prépare les messages à partir des modèles (modifiables ensuite par l'utilisateur avant l'envoi).
  wrap('share:compose', (kind: DocKind, id: number): ShareDraft => {
    if (!isKind(kind)) throw new Error('Type de document inconnu.')
    const s = getSettings()
    const v = variables(kind, id)
    return {
      phone: readDoc(KINDS[kind], id).clientPhone, email: '',
      whatsappMessage: renderTemplate(s.share_whatsapp_message, v),
      emailSubject: renderTemplate(s.share_email_subject, v),
      emailBody: renderTemplate(s.share_email_body, v)
    }
  })

  // Ouvre WhatsApp ou le client de messagerie avec le message, et prépare le PDF à joindre.
  wrap('share:open', async (req: ShareRequest) => {
    if (!isKind(req.kind)) throw new Error('Type de document inconnu.')
    const s = getSettings()
    let url: string
    if (req.channel === 'whatsapp') {
      if (s.share_whatsapp_enabled !== '1') throw new Error('Le partage WhatsApp est désactivé dans les paramètres.')
      const phone = normalizePhone(req.phone, s.share_country_code)
      if (phone.length < 8) throw new Error('Numéro de téléphone invalide.')
      url = `https://wa.me/${phone}?text=${encodeURIComponent(req.message)}`
    } else if (req.channel === 'email') {
      if (s.share_email_enabled !== '1') throw new Error("Le partage par e-mail est désactivé dans les paramètres.")
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.email)) throw new Error('Adresse e-mail invalide.')
      url = `mailto:${encodeURIComponent(req.email)}?subject=${encodeURIComponent(req.subject)}&body=${encodeURIComponent(req.message)}`
    } else throw new Error('Canal inconnu.')

    // Les deux services n'acceptent pas de pièce jointe par lien : le PDF est enregistré et mis en évidence pour être glissé dans le message.
    const { pdf, name } = await buildPdf(req.kind, req.id)
    const dir = join(app.getPath('documents'), 'Quincaillerie', 'Partage')
    mkdirSync(dir, { recursive: true })
    const pdfPath = join(dir, name)
    writeFileSync(pdfPath, pdf)
    shell.showItemInFolder(pdfPath)
    await shell.openExternal(url)
    return { url, pdfPath }
  })
}
