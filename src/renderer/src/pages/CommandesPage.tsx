import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Eye, Printer, Share2, PackageCheck, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/utils'
import { ORDER_LABELS, type OrderStatus, type OrderSummary } from '@shared/invoice'
import InvoiceEditor from './InvoiceEditor'
import ShareDialog from '@/components/ShareDialog'

const fmtDate = (iso: string) => iso.split('-').reverse().join('/')
const TONES: Record<OrderStatus, 'neutral' | 'success' | 'warning'> = { brouillon: 'warning', valide: 'neutral', recu: 'success' }

/** Bons de commande adressés aux fournisseurs (A4, même modèle que facture et devis). */
export default function CommandesPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<number | 'new' | null>(null)
  const [message, setMessage] = useState('')
  const [shareId, setShareId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const r = await window.api.orders.list()
    if (r.ok) setOrders(r.data)
  }, [])
  useEffect(() => { load() }, [load])

  const q = search.toLowerCase().trim()
  const shown = useMemo(
    () => orders.filter((o) => !q || o.clientName.toLowerCase().includes(q) || (o.number ?? '').toLowerCase().includes(q)), [orders, q])

  async function run(p: Promise<{ ok: boolean; error?: string }>, success = '') {
    const r = await p
    setMessage(r.ok ? success : r.error ?? 'Erreur')
    load()
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bons de commande</h1>
          <p className="text-muted-foreground">Commandes envoyées à vos fournisseurs.</p>
        </div>
        <Button onClick={() => setEditor('new')}><Plus className="h-4 w-4" />Nouveau bon de commande</Button>
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
            <Input className="pl-9" placeholder="Rechercher par numéro ou fournisseur…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              {['N°', 'Date', 'Fournisseur', 'Total TTC', 'Statut', ''].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((o) => (
              <tr key={o.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3 font-mono text-[13px] font-medium">{o.number ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="tnum px-4 py-3 text-muted-foreground">{fmtDate(o.issueDate)}</td>
                <td className="px-4 py-3 font-medium">{o.clientName}</td>
                <td className="tnum px-4 py-3 font-semibold">{formatMoney(o.totalTtc)}</td>
                <td className="px-4 py-3"><Badge tone={TONES[o.status]}>{ORDER_LABELS[o.status]}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {o.status === 'valide' && (
                      <Button size="sm" variant="outline" onClick={() => run(window.api.orders.setReceived(o.id), 'Bon de commande marqué reçu.')}>
                        <PackageCheck className="h-4 w-4" />Marquer reçu
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" title="Imprimer (imprimante A4 des paramètres)" onClick={() => run(window.api.orders.print(o.id))}><Printer className="h-4 w-4" /></Button>
                    {o.status !== 'brouillon' && <Button variant="ghost" size="icon" title="Partager (WhatsApp / e-mail)" onClick={() => setShareId(o.id)}><Share2 className="h-4 w-4" /></Button>}
                    <Button variant="ghost" size="icon" title="Aperçu avant impression" onClick={() => run(window.api.orders.preview(o.id))}><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Exporter en PDF" onClick={async () => {
                      const r = await window.api.orders.exportPdf(o.id)
                      setMessage(r.ok ? (r.data ? `PDF enregistré : ${r.data}` : '') : r.error)
                    }}><Download className="h-4 w-4" /></Button>
                    {o.status === 'brouillon' && (
                      <>
                        <Button variant="ghost" size="icon" title="Modifier" onClick={() => setEditor(o.id)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="Supprimer" onClick={() => confirm('Supprimer ce brouillon ?') && run(window.api.orders.remove(o.id), 'Brouillon supprimé.')}>
                          <Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className="py-16 text-center text-muted-foreground">Aucun bon de commande.</td></tr>}
          </tbody>
        </table>
      </section>

      <ShareDialog kind="bon_commande" id={shareId} onClose={() => setShareId(null)} />
      <InvoiceEditor kind="bon_commande" target={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load() }} />
    </div>
  )
}
