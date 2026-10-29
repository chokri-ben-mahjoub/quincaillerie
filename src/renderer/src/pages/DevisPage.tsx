import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Download, Eye, Printer, Share2, FileOutput, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/utils'
import { QUOTE_LABELS, type QuoteStatus, type QuoteSummary } from '@shared/invoice'
import InvoiceEditor from './InvoiceEditor'
import ShareDialog from '@/components/ShareDialog'

const fmtDate = (iso: string) => iso.split('-').reverse().join('/')
const TONES: Record<QuoteStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  brouillon: 'warning', valide: 'neutral', accepte: 'success', refuse: 'danger', converti: 'success'
}

export default function DevisPage() {
  const [quotes, setQuotes] = useState<QuoteSummary[]>([])
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<number | 'new' | null>(null)
  const [message, setMessage] = useState('')
  const [shareId, setShareId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const r = await window.api.quotes.list()
    if (r.ok) setQuotes(r.data)
  }, [])
  useEffect(() => { load() }, [load])

  const q = search.toLowerCase().trim()
  const shown = useMemo(
    () => quotes.filter((x) => !q || x.clientName.toLowerCase().includes(q) || (x.number ?? '').toLowerCase().includes(q)), [quotes, q])

  async function run(p: Promise<{ ok: boolean; error?: string }>, success = '') {
    const r = await p
    setMessage(r.ok ? success : r.error ?? 'Erreur')
    load()
  }

  async function convert(x: QuoteSummary) {
    if (!confirm(`Convertir le devis ${x.number} en facture ? Un brouillon de facture sera créé.`)) return
    run(window.api.quotes.convert(x.id), 'Brouillon de facture créé : retrouvez-le dans Factures pour le vérifier et le valider.')
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Devis</h1>
          <p className="text-muted-foreground">Offres de prix convertibles en facture en un clic.</p>
        </div>
        <Button onClick={() => setEditor('new')}><Plus className="h-4 w-4" />Nouveau devis</Button>
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
            {shown.map((x) => {
              const open = x.status === 'valide' || x.status === 'accepte' // encore convertible
              return (
                <tr key={x.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 font-mono text-[13px] font-medium">{x.number ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="tnum px-4 py-3 text-muted-foreground">{fmtDate(x.issueDate)}</td>
                  <td className="px-4 py-3 font-medium">{x.clientName}</td>
                  <td className="tnum px-4 py-3 font-semibold">{formatMoney(x.totalTtc)}</td>
                  <td className="px-4 py-3"><Badge tone={TONES[x.status]}>{QUOTE_LABELS[x.status]}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {open && <Button size="sm" onClick={() => convert(x)}><FileOutput className="h-4 w-4" />Convertir</Button>}
                      {x.status === 'valide' && (
                        <>
                          <Button variant="ghost" size="icon" title="Marquer accepté" onClick={() => run(window.api.quotes.setStatus(x.id, 'accepte'))}><Check className="h-4 w-4 text-success" /></Button>
                          <Button variant="ghost" size="icon" title="Marquer refusé" onClick={() => run(window.api.quotes.setStatus(x.id, 'refuse'))}><X className="h-4 w-4 text-destructive" /></Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon" title="Imprimer (imprimante A4 des paramètres)" onClick={() => run(window.api.quotes.print(x.id))}><Printer className="h-4 w-4" /></Button>
                    {x.status !== 'brouillon' && <Button variant="ghost" size="icon" title="Partager (WhatsApp / e-mail)" onClick={() => setShareId(x.id)}><Share2 className="h-4 w-4" /></Button>}
                    <Button variant="ghost" size="icon" title="Aperçu avant impression" onClick={() => run(window.api.quotes.preview(x.id))}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Exporter en PDF" onClick={async () => {
                        const r = await window.api.quotes.exportPdf(x.id)
                        setMessage(r.ok ? (r.data ? `PDF enregistré : ${r.data}` : '') : r.error)
                      }}><Download className="h-4 w-4" /></Button>
                      {x.status === 'brouillon' && (
                        <>
                          <Button variant="ghost" size="icon" title="Modifier" onClick={() => setEditor(x.id)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Supprimer" onClick={() => confirm('Supprimer ce brouillon ?') && run(window.api.quotes.remove(x.id), 'Brouillon supprimé.')}>
                            <Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!shown.length && <tr><td colSpan={6} className="py-16 text-center text-muted-foreground">Aucun devis.</td></tr>}
          </tbody>
        </table>
      </section>

      <ShareDialog kind="devis" id={shareId} onClose={() => setShareId(null)} />
      <InvoiceEditor kind="devis" target={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load() }} />
    </div>
  )
}
