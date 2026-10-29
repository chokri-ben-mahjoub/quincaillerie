import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Eye, Lock, Pencil, Plus, Printer, Share2, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import DataGrid, { type GridColumn, type GridPreset } from '@/components/DataGrid'
import ShareDialog from '@/components/ShareDialog'
import type { DocKind } from '@shared/invoice'
import InvoiceEditor from './InvoiceEditor'

export interface DocRow { id: number; number: string | null; status: string; issueDate: string; clientName: string; totalTtc: number }
type Tone = 'neutral' | 'success' | 'warning' | 'danger'
type Result<T> = { ok: boolean; error?: string; data?: T }

/** API commune à tous les documents (window.api.invoices / quotes / orders / deliveries). */
interface DocApi {
  list: () => Promise<{ ok: true; data: DocRow[] } | { ok: false; error: string }>
  remove: (id: number) => Promise<Result<unknown>>
  preview: (id: number) => Promise<Result<unknown>>
  print: (id: number) => Promise<Result<unknown>>
  exportPdf: (id: number) => Promise<Result<string | null>>
}

interface Props {
  kind: DocKind
  title: string
  subtitle: string
  newLabel: string
  api: DocApi
  partyLabel: 'Client' | 'Fournisseur'
  totalLabel: string
  statusLabels: Record<string, string>
  statusTones: Record<string, Tone>
  presets: GridPreset[]
  /** Actions propres au type de document (convertir, accepter, marquer reçu…). */
  extraActions?: (row: DocRow, run: (p: Promise<Result<unknown>>, success?: string) => void) => React.ReactNode
}

/** Liste de documents façon DevExpress : filtres par colonne (statut en liste déroulante, période, montant), tri, export, totaux. */
export default function DocumentListPage({ kind, title, subtitle, newLabel, api, partyLabel, totalLabel, statusLabels, statusTones, presets, extraActions }: Props) {
  const [rows, setRows] = useState<DocRow[]>([])
  const [editor, setEditor] = useState<number | 'new' | null>(null)
  const [shareId, setShareId] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const r = await api.list()
    if (r.ok) setRows(r.data)
  }, [api])
  useEffect(() => { load() }, [load])

  const run = useCallback(async (p: Promise<Result<unknown>>, success = '') => {
    const r = await p
    setMessage(r.ok ? success : r.error ?? 'Erreur')
    load()
  }, [load])

  const columns = useMemo<GridColumn<DocRow>[]>(() => [
    { id: 'number', header: 'N°', value: (r) => r.number ?? '', cell: (r) => <span className="font-mono text-[13px] font-medium">{r.number ?? <span className="text-muted-foreground">—</span>}</span> },
    { id: 'issueDate', header: 'Date', type: 'date', value: (r) => r.issueDate, width: '12rem' },
    { id: 'clientName', header: partyLabel, value: (r) => r.clientName, cell: (r) => <span className="font-medium">{r.clientName}</span> },
    { id: 'totalTtc', header: totalLabel, type: 'money', value: (r) => r.totalTtc, align: 'right', summary: 'sum', cell: (r) => <span className="tnum font-semibold">{new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3 }).format(r.totalTtc)} DT</span> },
    { id: 'status', header: 'Statut', type: 'enum', value: (r) => r.status, options: Object.entries(statusLabels).map(([value, label]) => ({ value, label })), width: '10rem',
      cell: (r) => <Badge tone={statusTones[r.status] ?? 'neutral'}>{r.status !== 'brouillon' && kind === 'facture' && <Lock className="mr-1 h-3 w-3" />}{statusLabels[r.status] ?? r.status}</Badge> },
    { id: 'actions', header: '', value: () => '', filterable: false, sortable: false, align: 'right', width: '17rem',
      cell: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {extraActions?.(r, run)}
          <Button variant="ghost" size="icon" title="Imprimer (imprimante A4 des paramètres)" onClick={() => run(api.print(r.id))}><Printer className="h-4 w-4" /></Button>
          {r.status !== 'brouillon' && <Button variant="ghost" size="icon" title="Partager (WhatsApp / e-mail)" onClick={() => setShareId(r.id)}><Share2 className="h-4 w-4" /></Button>}
          <Button variant="ghost" size="icon" title="Aperçu avant impression" onClick={() => run(api.preview(r.id))}><Eye className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" title="Exporter en PDF" onClick={async () => { const x = await api.exportPdf(r.id); setMessage(x.ok ? (x.data ? `PDF enregistré : ${x.data}` : '') : x.error ?? '') }}><Download className="h-4 w-4" /></Button>
          {r.status === 'brouillon' && (
            <>
              <Button variant="ghost" size="icon" title="Modifier" onClick={() => setEditor(r.id)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" title="Supprimer" onClick={() => confirm('Supprimer ce brouillon ?') && run(api.remove(r.id), 'Brouillon supprimé.')}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </>
          )}
        </div>
      ) }
  ], [partyLabel, totalLabel, statusLabels, statusTones, kind, api, extraActions, run])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        <Button onClick={() => setEditor('new')}><Plus className="h-4 w-4" />{newLabel}</Button>
      </header>

      {message && (
        <p className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">{message}<button className="text-primary" onClick={() => setMessage('')}>OK</button></p>
      )}

      <DataGrid id={`documents-${kind}`} data={rows} columns={columns} presets={presets} exportName={title.toLowerCase().replace(/\s+/g, '-')}
        searchPlaceholder={`Rechercher par numéro, ${partyLabel.toLowerCase()}, montant…`} emptyText={`Aucun document. Cliquez sur « ${newLabel} » ou appuyez sur le bouton en haut à droite.`}
        onRowClick={(r) => r.status === 'brouillon' && setEditor(r.id)} />

      <ShareDialog kind={kind} id={shareId} onClose={() => setShareId(null)} />
      <InvoiceEditor kind={kind} target={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load() }} />
    </div>
  )
}

