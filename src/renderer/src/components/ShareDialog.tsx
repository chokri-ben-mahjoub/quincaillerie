import { useEffect, useState } from 'react'
import { Mail, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label, Textarea } from '@/components/ui/input'
import { useAppConfig } from '@/lib/useAppConfig'
import type { DocKind } from '@shared/invoice'
import type { ShareDraft } from '@shared/share'

/** Partage d'un document par WhatsApp ou e-mail : message prérempli (Paramètres > Partage), modifiable avant l'envoi. */
export default function ShareDialog({ kind, id, onClose }: { kind: DocKind; id: number | null; onClose: () => void }) {
  const cfg = useAppConfig()
  const [draft, setDraft] = useState<ShareDraft | null>(null)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [waMessage, setWaMessage] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (id === null) return
    setDraft(null); setError(''); setDone('')
    window.api.share.compose(kind, id).then((r) => {
      if (!r.ok) return setError(r.error)
      setDraft(r.data); setPhone(r.data.phone); setEmail(r.data.email)
      setWaMessage(r.data.whatsappMessage); setSubject(r.data.emailSubject); setBody(r.data.emailBody)
    })
  }, [kind, id])

  async function send(channel: 'whatsapp' | 'email') {
    setBusy(true); setError(''); setDone('')
    const r = await window.api.share.open({ kind, id: id!, channel, phone, email, subject, message: channel === 'whatsapp' ? waMessage : body })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setDone(`Le PDF est prêt dans le dossier ouvert : glissez-le dans le message. (${r.data.pdfPath})`)
  }

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-auto">
        <DialogTitle>Partager le document</DialogTitle>
        <DialogDescription>
          Le message s’ouvre dans WhatsApp ou votre messagerie ; le PDF est enregistré et affiché pour être joint.
        </DialogDescription>

        {draft && (
          <div className="mt-5 space-y-6">
            {cfg.whatsappEnabled && (
              <section className="space-y-3 rounded-lg border p-4">
                <h3 className="flex items-center gap-2 font-semibold"><MessageCircle className="h-4 w-4 text-success" />WhatsApp</h3>
                <div><Label>Téléphone du client</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98 123 456" />
                  <p className="mt-1 text-xs text-muted-foreground">Sans indicatif, le +216 est ajouté automatiquement.</p></div>
                <div><Label>Message</Label><Textarea value={waMessage} onChange={(e) => setWaMessage(e.target.value)} className="min-h-[110px]" /></div>
                <Button disabled={busy} onClick={() => send('whatsapp')}><MessageCircle className="h-4 w-4" />Ouvrir WhatsApp</Button>
              </section>
            )}
            {cfg.emailEnabled && (
              <section className="space-y-3 rounded-lg border p-4">
                <h3 className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4 text-primary" />E-mail</h3>
                <div><Label>Adresse e-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@exemple.tn" /></div>
                <div><Label>Objet</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
                <div><Label>Message</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[120px]" /></div>
                <Button disabled={busy} onClick={() => send('email')}><Mail className="h-4 w-4" />Ouvrir la messagerie</Button>
              </section>
            )}
            {!cfg.whatsappEnabled && !cfg.emailEnabled && <p className="text-sm text-muted-foreground">Le partage est désactivé dans Paramètres &gt; Partage.</p>}
          </div>
        )}

        {error && <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {done && <p className="mt-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">{done}</p>}
        <div className="mt-5 flex justify-end"><Button variant="outline" onClick={onClose}>Fermer</Button></div>
      </DialogContent>
    </Dialog>
  )
}
