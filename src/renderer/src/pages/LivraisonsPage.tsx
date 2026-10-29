import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Eye, Printer, Share2, PackageCheck, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/utils'
import { DELIVERY_LABELS, type DeliveryStatus, type DeliverySummary } from '@shared/invoice'
import InvoiceEditor from './InvoiceEditor'
import ShareDialog from '@/components/ShareDialog'

const fmtDate = (iso: string) => iso.split('-').reverse().join('/')
const TONES: Record<DeliveryStatus, 'neutral' | 'success' | 'warning'> = { brouillon: 'warning', valide: 'neutral', livre: 'success' }

/** Bons de livraison remis aux clients (A4, même modèle que facture et devis). Sans effet sur le stock. */
export default function LivraisonsPage() {
  const [notes, setNotes] = useState<DeliverySummary[]>([])
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<number | 'new' | null>(null)
  const [message, setMessage] = useState('')
  const [shareId, setShareId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const r = await window.api.deliveries.list()
    if (r.ok) setNotes(r.data)
  }, [])
  useEffect(() => { load() }, [load])

  const q = search.toLowerCase().trim()
  const shown = useMemo(
    () => notes.filter((n) => !q || n.clientName.toLowerCase().includes(q) || (n.number ?? '').toLowerCase().includes(q)), [notes, q])

  async function run(p: Promise<{ ok: boolean; error?: string }>, success = '') {
    const r = await p
    setMessage(r.ok ? success : r.error ?? 'Erreur')
    load()
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bons de livraison</h1>
          <p className="text-muted-foreground">Marchandises remises à vos clients, avec signature de réception.</p>
        </div>
        <Button onClick={() => setEditor('new')}><Plus className="h-4 w-4" />Nouveau bon de livraison</Button>
      </header>

      {message && (
        <p className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
          {message}<button className="text-primary" onClick={() => setMessage('')}>OK</button>
        </p>
      )}

      <section className="rounded-lg border bg-card shadow-soft">
        <div className="border-b p-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Rechercher par numéro ou client…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              {['N°', 'Date', 'Client', 'Total TTC', 'Statut', ''].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((n) => (
              <tr key={n.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3 font-mono text-[13px] font-medium">{n.number ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="tnum px-4 py-3 text-muted-foreground">{fmtDate(n.issueDate)}</td>
                <td className="px-4 py-3 font-medium">{n.clientName}</td>
                <td className="tnum px-4 py-3 font-semibold">{formatMoney(n.totalTtc)}</td>
                <td className="px-4 py-3"><Badge tone={TONES[n.status]}>{DELIVERY_LABELS[n.status]}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {n.status === 'valide' && (
                      <Button size="sm" variant="outline" onClick={() => run(window.api.deliveries.setDelivered(n.id), 'Bon de livraison marqué livré.')}>
                        <PackageCheck className="h-4 w-4" />Marquer livré
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" title="Imprimer (imprimante A4 des paramètres)" onClick={() => run(window.api.deliveries.print(n.id))}><Printer className="h-4 w-4" /></Button>
                    {n.status !== 'brouillon' && <Button variant="ghost" size="icon" title="Partager (WhatsApp / e-mail)" onClick={() => setShareId(n.id)}><Share2 className="h-4 w-4" /></Button>}
                    <Button variant="ghost" size="icon" title="Aperçu avant impression" onClick={() => run(window.api.deliveries.preview(n.id))}><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Exporter en PDF" onClick={async () => {
                      const r = await window.api.deliveries.exportPdf(n.id)
                      setMessage(r.ok ? (r.data ? `PDF enregistré : ${r.data}` : '') : r.error)
                    }}><Download className="h-4 w-4" /></Button>
                    {n.status === 'brouillon' && (
                      <>
                        <Button variant="ghost" size="icon" title="Modifier" onClick={() => setEditor(n.id)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="Supprimer" onClick={() => confirm('Supprimer ce brouillon ?') && run(window.api.deliveries.remove(n.id), 'Brouillon supprimé.')}>
                          <Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className="py-16 text-center text-muted-foreground">Aucun bon de livraison.</td></tr>}
          </tbody>
        </table>
      </section>

      <ShareDialog kind="bon_livraison" id={shareId} onClose={() => setShareId(null)} />
      <InvoiceEditor kind="bon_livraison" target={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load() }} />
    </div>
  )
}
