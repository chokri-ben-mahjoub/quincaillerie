import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Eye, Printer, Share2, Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/utils'
import type { InvoiceSummary } from '@shared/invoice'
import InvoiceEditor from './InvoiceEditor'
import ShareDialog from '@/components/ShareDialog'

const fmtDate = (iso: string) => iso.split('-').reverse().join('/')

export default function FacturesPage() {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<number | 'new' | null>(null)
  const [message, setMessage] = useState('')
  const [shareId, setShareId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const r = await window.api.invoices.list()
    if (r.ok) setInvoices(r.data)
  }, [])
  useEffect(() => { load() }, [load])

  const q = search.toLowerCase().trim()
  const shown = useMemo(
    () => invoices.filter((i) => !q || i.clientName.toLowerCase().includes(q) || (i.number ?? '').toLowerCase().includes(q)),
    [invoices, q])

  const act = async (p: Promise<{ ok: boolean; error?: string; data?: unknown }>, ok = '') => {
    const r = await p
    setMessage(r.ok ? ok : r.error ?? 'Erreur')
    load()
  }

  async function remove(i: InvoiceSummary) {
    if (confirm('Supprimer ce brouillon ?')) act(window.api.invoices.remove(i.id), 'Brouillon supprimé.')
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Factures</h1>
          <p className="text-muted-foreground">Facturation A4 avec TVA, timbre fiscal et montant en lettres.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setEditor('new')}><Plus className="h-4 w-4" />Nouvelle facture</Button>
        </div>
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
              {['N°', 'Date', 'Client', 'Net à payer', 'Statut', ''].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3 font-mono text-[13px] font-medium">{i.number ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="tnum px-4 py-3 text-muted-foreground">{fmtDate(i.issueDate)}</td>
                <td className="px-4 py-3 font-medium">{i.clientName}</td>
                <td className="tnum px-4 py-3 font-semibold">{formatMoney(i.totalTtc)}</td>
                <td className="px-4 py-3">
                  {i.status === 'validee'
                    ? <Badge tone="success"><Lock className="mr-1 h-3 w-3" />Validée</Badge>
                    : <Badge tone="warning">Brouillon</Badge>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title="Imprimer (imprimante A4 des paramètres)" onClick={() => act(window.api.invoices.print(i.id))}><Printer className="h-4 w-4" /></Button>
                    {i.status !== 'brouillon' && <Button variant="ghost" size="icon" title="Partager (WhatsApp / e-mail)" onClick={() => setShareId(i.id)}><Share2 className="h-4 w-4" /></Button>}
                    <Button variant="ghost" size="icon" title="Aperçu avant impression" onClick={() => act(window.api.invoices.preview(i.id))}><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Exporter en PDF" onClick={async () => {
                      const r = await window.api.invoices.exportPdf(i.id)
                      setMessage(r.ok ? (r.data ? `PDF enregistré : ${r.data}` : '') : r.error)
                    }}><Download className="h-4 w-4" /></Button>
                    {i.status === 'brouillon' && (
                      <>
                        <Button variant="ghost" size="icon" title="Modifier" onClick={() => setEditor(i.id)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="Supprimer" onClick={() => remove(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className="py-16 text-center text-muted-foreground">Aucune facture.</td></tr>}
          </tbody>
        </table>
      </section>

      <ShareDialog kind="facture" id={shareId} onClose={() => setShareId(null)} />
      <InvoiceEditor target={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load() }} />
    </div>
  )
}
