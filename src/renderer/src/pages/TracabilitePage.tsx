import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Barcode, History, PackageCheck, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import DataGrid, { datePreset, type GridColumn } from '@/components/DataGrid'
import { ArticleSearchBox } from '@/components/ArticleSearchBox'
import { cn, fmtDate, formatMoney, formatQty } from '@/lib/utils'
import { MOVEMENT_LABELS, type Article } from '@shared/types'
import {
  TRACKING_LABELS, type ArticleEvent, type AuditEntry, type Lot, type LotDetail, type PendingReception, type TrackedArticle, type TrackingMode
} from '@shared/trace'

type Tab = 'lots' | 'pending' | 'history' | 'articles' | 'audit'

const fmtDateTime = (s: string) => `${fmtDate(s)} ${s.slice(11, 16)}`
const today = () => new Date().toLocaleDateString('sv-SE')
const daysFromNow = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE') }

/** État de la date limite : périmé, bientôt (60 jours) ou correct. */
function expiryState(date: string | null): 'none' | 'expired' | 'soon' | 'ok' {
  if (!date) return 'none'
  if (date < today()) return 'expired'
  return date <= daysFromNow(60) ? 'soon' : 'ok'
}

/** Ce qu'on identifie : un article, éventuellement rattaché à une ligne d'achat. */
interface ReceiveTarget {
  articleId: number
  designation: string
  unit: string
  tracking: TrackingMode
  max: number
  purchase: PendingReception | null
}

export default function TracabilitePage({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<Tab>('lots')
  const [lots, setLots] = useState<Lot[]>([])
  const [pending, setPending] = useState<PendingReception[]>([])
  const [tracked, setTracked] = useState<TrackedArticle[]>([])
  const [openLot, setOpenLot] = useState<number | null>(null)
  const [receive, setReceive] = useState<ReceiveTarget | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [l, p, t] = await Promise.all([window.api.trace.lots(), window.api.trace.pending(), window.api.trace.articles()])
    if (l.ok) setLots(l.data)
    if (p.ok) setPending(p.data)
    if (t.ok) setTracked(t.data)
  }, [])
  useEffect(() => { load() }, [load])

  const unidentified = useMemo(() => tracked.filter((a) => a.tracking !== 'aucun' && a.unidentified > 0), [tracked])
  const toIdentify = pending.length + unidentified.length

  async function changeTracking(a: TrackedArticle, mode: TrackingMode) {
    setError('')
    const r = await window.api.trace.setTracking(a.id, mode)
    if (!r.ok) setError(r.error)
    load()
  }

  // ---------- Colonnes ----------
  const lotCols = useMemo<GridColumn<Lot>[]>(() => [
    { id: 'code', header: 'Lot / N° de série', value: (l) => l.code,
      cell: (l) => <div className="flex items-center gap-2"><span className="font-mono font-semibold">{l.code}</span><Badge>{l.kind === 'serie' ? 'Série' : 'Lot'}</Badge></div> },
    { id: 'designation', header: 'Article', value: (l) => `${l.designation} ${l.barcode}`,
      cell: (l) => <><div className="font-medium">{l.designation}</div><div className="font-mono text-xs text-muted-foreground">{l.barcode}</div></> },
    { id: 'supplier', header: 'Fournisseur', type: 'enum', value: (l) => l.supplierName ?? '(Stock existant)' },
    { id: 'purchase', header: 'Réception', value: (l) => l.purchaseRef ?? '', cell: (l) => <span className="text-muted-foreground">{l.purchaseRef ?? '—'}</span> },
    { id: 'expiry', header: 'Date limite', type: 'date', value: (l) => l.expiryDate ?? '',
      cell: (l) => { const st = expiryState(l.expiryDate); return st === 'none' ? <span className="text-muted-foreground">—</span>
        : <Badge tone={st === 'expired' ? 'danger' : st === 'soon' ? 'warning' : 'neutral'} className="tnum">{fmtDate(l.expiryDate)}</Badge> } },
    { id: 'quantityIn', header: 'Reçu', type: 'number', value: (l) => l.quantityIn, align: 'right', hidden: true },
    { id: 'quantityLeft', header: 'Restant', type: 'number', value: (l) => l.quantityLeft, align: 'right',
      cell: (l) => <span className={cn('tnum font-semibold', l.quantityLeft <= 0 && 'text-muted-foreground')}>{formatQty(l.quantityLeft)} / {formatQty(l.quantityIn)} {l.unit}</span> },
    { id: 'state', header: 'État', type: 'enum', value: (l) => (l.quantityLeft > 0 ? 'stock' : 'epuise'),
      options: [{ value: 'stock', label: 'En stock' }, { value: 'epuise', label: 'Épuisé / vendu' }],
      cell: (l) => <Badge tone={l.quantityLeft > 0 ? 'success' : 'neutral'}>{l.quantityLeft > 0 ? 'En stock' : l.kind === 'serie' ? 'Vendu' : 'Épuisé'}</Badge> },
    { id: 'createdAt', header: 'Saisi le', type: 'date', value: (l) => l.createdAt, hidden: true, cell: (l) => <span className="tnum text-muted-foreground">{fmtDateTime(l.createdAt)}</span> }
  ], [])

  const pendingCols = useMemo<GridColumn<PendingReception>[]>(() => [
    { id: 'date', header: 'Achat du', type: 'date', value: (p) => p.purchaseDate, width: '9rem', cell: (p) => <span className="tnum text-muted-foreground">{fmtDate(p.purchaseDate)}</span> },
    { id: 'purchase', header: 'Réception', value: (p) => p.purchaseRef ?? `Achat #${p.purchaseId}` },
    { id: 'supplier', header: 'Fournisseur', type: 'enum', value: (p) => p.supplierName ?? '—' },
    { id: 'designation', header: 'Article', value: (p) => `${p.designation} ${p.barcode}`,
      cell: (p) => <><div className="font-medium">{p.designation}</div><div className="text-xs text-muted-foreground">{TRACKING_LABELS[p.tracking]}</div></> },
    { id: 'left', header: 'À identifier', type: 'number', value: (p) => p.quantity - p.identified, align: 'right',
      cell: (p) => <Badge tone="warning" className="tnum">{formatQty(p.quantity - p.identified)} / {formatQty(p.quantity)} {p.unit}</Badge> },
    { id: 'actions', header: '', value: () => '', filterable: false, sortable: false, align: 'right', width: '9rem',
      cell: (p) => <Button size="sm" onClick={() => setReceive({ articleId: p.articleId, designation: p.designation, unit: p.unit, tracking: p.tracking, max: p.quantity - p.identified, purchase: p })}>
        <Barcode className="h-4 w-4" />Identifier</Button> }
  ], [])

  const trackedCols = useMemo<GridColumn<TrackedArticle>[]>(() => [
    { id: 'designation', header: 'Article', value: (a) => `${a.designation} ${a.barcode}`,
      cell: (a) => <><div className="font-medium">{a.designation}</div><div className="font-mono text-xs text-muted-foreground">{a.barcode}</div></> },
    { id: 'category', header: 'Catégorie', type: 'enum', value: (a) => a.categoryName ?? '(Sans catégorie)' },
    { id: 'tracking', header: 'Suivi', type: 'enum', value: (a) => a.tracking,
      options: Object.entries(TRACKING_LABELS).map(([value, label]) => ({ value, label })), width: '12rem',
      cell: (a) => (
        <Select className="h-8" value={a.tracking} onChange={(e) => changeTracking(a, e.target.value as TrackingMode)} onClick={(e) => e.stopPropagation()}>
          {Object.entries(TRACKING_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>) },
    { id: 'stock', header: 'Stock', type: 'number', value: (a) => a.stock, align: 'right', cell: (a) => <span className="tnum">{formatQty(a.stock)} {a.unit}</span> },
    { id: 'inLots', header: 'Dans des lots', type: 'number', value: (a) => a.inLots, align: 'right',
      cell: (a) => a.tracking === 'aucun' ? <span className="text-muted-foreground">—</span> : <span className="tnum">{formatQty(a.inLots)} ({a.lotCount})</span> },
    { id: 'unidentified', header: 'Non identifié', type: 'number', value: (a) => a.unidentified, align: 'right',
      cell: (a) => a.unidentified > 0 ? <Badge tone="warning" className="tnum">{formatQty(a.unidentified)} {a.unit}</Badge> : <span className="text-muted-foreground">—</span> },
    { id: 'actions', header: '', value: () => '', filterable: false, sortable: false, align: 'right', width: '9rem',
      cell: (a) => a.tracking !== 'aucun' && a.unidentified > 0
        ? <Button size="sm" variant="outline" onClick={() => setReceive({ articleId: a.id, designation: a.designation, unit: a.unit, tracking: a.tracking, max: a.unidentified, purchase: null })}>Identifier</Button>
        : null }
  ], []) // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: [Tab, string][] = [
    ['lots', `Lots & séries (${lots.filter((l) => l.quantityLeft > 0).length})`],
    ['pending', `À identifier (${toIdentify})`],
    ['history', 'Historique article'],
    ['articles', 'Articles suivis'],
    ...(isAdmin ? [['audit', 'Journal d’audit'] as [Tab, string]] : [])
  ]

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Traçabilité</h1>
        <p className="text-muted-foreground">Lots et numéros de série du fournisseur au client, historique complet des articles{isAdmin ? ', actions des utilisateurs' : ''}.</p>
      </header>

      <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn('rounded-md px-4 py-2 text-sm font-medium', tab === id ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {tab === 'lots' && (
        <DataGrid id="trace-lots" data={lots} columns={lotCols} exportName="lots-series" onRowClick={(l) => setOpenLot(l.id)}
          searchPlaceholder="Rechercher un lot, un n° de série, un article…"
          presets={[
            { label: 'En stock', filters: { state: 'stock' } },
            { label: 'Périmés en stock', filters: { expiry: { max: daysFromNow(-1) }, state: 'stock' } },
            { label: 'Périment sous 60 j', filters: { expiry: { min: today(), max: daysFromNow(60) }, state: 'stock' } }
          ]}
          emptyText="Aucun lot. Choisissez les articles à suivre dans l’onglet « Articles suivis »." />
      )}

      {tab === 'pending' && (
        <div className="space-y-6">
          {unidentified.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <span className="font-medium">{unidentified.length} article(s) suivi(s) ont du stock sans lot</span> (stock d’avant l’activation du suivi, ajustements…).
                Les ventes de ce stock ne pourront pas être rattachées à un lot. Identifiez-le depuis l’onglet « Articles suivis ».
              </div>
            </div>
          )}
          <DataGrid id="trace-pending" data={pending} columns={pendingCols} exportName="receptions-a-identifier"
            searchPlaceholder="Rechercher un achat, un article, un fournisseur…"
            emptyText="Toutes les réceptions d’articles suivis sont identifiées." />
        </div>
      )}

      {tab === 'history' && <HistoryTab />}

      {tab === 'articles' && (
        <DataGrid id="trace-articles" data={tracked} columns={trackedCols} exportName="articles-suivis"
          searchPlaceholder="Rechercher un article, un code-barres…"
          presets={[
            { label: 'Par lot', filters: { tracking: 'lot' } },
            { label: 'Par n° de série', filters: { tracking: 'serie' } },
            { label: 'Non suivis', filters: { tracking: 'aucun' } }
          ]}
          emptyText="Aucun article." />
      )}

      {tab === 'audit' && isAdmin && <AuditTab />}

      <LotDialog lotId={openLot} onClose={() => setOpenLot(null)} onChanged={load} onOpen={setOpenLot} />
      <ReceiveDialog target={receive} onClose={() => setReceive(null)} onSaved={() => { setReceive(null); load() }} />
    </div>
  )
}

// ---------- Fiche d'un lot : origine et destinations ----------
function LotDialog({ lotId, onClose, onChanged, onOpen }: {
  lotId: number | null; onClose: () => void; onChanged: () => void; onOpen: (id: number) => void
}) {
  const [lot, setLot] = useState<LotDetail | null>(null)
  const [siblings, setSiblings] = useState<Lot[]>([])
  const [fixing, setFixing] = useState<number | null>(null) // ligne du journal en cours de correction
  const [target, setTarget] = useState<number | ''>('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (lotId === null) return
    const r = await window.api.trace.lot(lotId)
    if (!r.ok) return setError(r.error)
    setLot(r.data)
    const all = await window.api.trace.lots()
    if (all.ok) setSiblings(all.data.filter((l) => l.articleId === r.data.articleId && l.id !== r.data.id && l.quantityLeft > 0))
  }, [lotId])
  useEffect(() => { setLot(null); setFixing(null); setError(''); load() }, [load])

  async function reassign() {
    if (fixing === null || target === '') return
    const r = await window.api.trace.reassign(fixing, target)
    if (!r.ok) return setError(r.error)
    setFixing(null); setTarget(''); setError('')
    load(); onChanged()
  }

  const clients = lot ? [...new Set(lot.events.filter((e) => e.quantity < 0 && e.party).map((e) => e.party!))] : []

  return (
    <Dialog open={lotId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogTitle>{lot ? `${lot.kind === 'serie' ? 'N° de série' : 'Lot'} ${lot.code}` : 'Chargement…'}</DialogTitle>
        <DialogDescription>{lot ? `${lot.designation} — ${lot.barcode}` : ''}</DialogDescription>
        {lot && (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <Info label="Fournisseur" value={lot.supplierName ?? 'Stock existant'} />
              <Info label="Réception" value={lot.purchaseRef ?? '—'} />
              <Info label="Date limite" value={lot.expiryDate ? fmtDate(lot.expiryDate) : '—'} tone={expiryState(lot.expiryDate)} />
              <Info label="Restant" value={`${formatQty(lot.quantityLeft)} / ${formatQty(lot.quantityIn)} ${lot.unit}`} />
            </div>
            {clients.length > 0 && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm">
                <span className="font-medium">Clients ayant reçu ce {lot.kind === 'serie' ? 'numéro' : 'lot'} : </span>{clients.join(', ')}
              </p>
            )}
            <div className="max-h-[45vh] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Opération</th><th className="px-3 py-2">Document</th>
                    <th className="px-3 py-2">Client / fournisseur</th><th className="px-3 py-2 text-right">Quantité</th><th className="px-3 py-2">Par</th><th /></tr>
                </thead>
                <tbody>
                  {lot.events.map((e) => (
                    <tr key={e.id} className="border-t align-top">
                      <td className="tnum whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtDateTime(e.date)}</td>
                      <td className="px-3 py-2">{e.type ? MOVEMENT_LABELS[e.type] : 'Identification'}{e.note && <div className="text-xs text-muted-foreground">{e.note}</div>}</td>
                      <td className="px-3 py-2">{e.docLabel ?? '—'}</td>
                      <td className="px-3 py-2">{e.party ?? '—'}</td>
                      <td className={cn('tnum px-3 py-2 text-right font-semibold', e.quantity > 0 ? 'text-success' : 'text-destructive')}>{e.quantity > 0 ? '+' : ''}{formatQty(e.quantity)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{e.userName ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {e.reassignable && siblings.length > 0 && fixing !== e.id && (
                          <Button size="sm" variant="ghost" onClick={() => { setFixing(e.id); setTarget('') }}>Corriger</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {fixing !== null && (
              <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/50 p-3">
                <div className="min-w-[16rem] flex-1">
                  <Label>Cette sortie concernait en réalité le {lot.kind === 'serie' ? 'n° de série' : 'lot'} :</Label>
                  <Select value={target} onChange={(e) => setTarget(e.target.value ? Number(e.target.value) : '')}>
                    <option value="">Choisir…</option>
                    {siblings.map((s) => <option key={s.id} value={s.id}>{s.code} (reste {formatQty(s.quantityLeft)})</option>)}
                  </Select>
                </div>
                <Button variant="outline" onClick={() => setFixing(null)}>Annuler</Button>
                <Button disabled={target === ''} onClick={reassign}>Réaffecter</Button>
              </div>
            )}
            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <div className="flex justify-between">
              {siblings.length > 0
                ? <Select className="w-64" value="" onChange={(e) => e.target.value && onOpen(Number(e.target.value))}>
                    <option value="">Autres lots de cet article…</option>
                    {siblings.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
                  </Select>
                : <span />}
              <Button variant="outline" onClick={onClose}>Fermer</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Info({ label, value, tone }: { label: string; value: string; tone?: ReturnType<typeof expiryState> }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('font-medium', tone === 'expired' && 'text-destructive', tone === 'soon' && 'text-warning')}>{value}</div>
    </div>
  )
}

// ---------- Saisie des lots / numéros de série ----------
interface Row { code: string; quantity: number; expiryDate: string }

function ReceiveDialog({ target, onClose, onSaved }: { target: ReceiveTarget | null; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [serials, setSerials] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!target) return
    setRows([{ code: '', quantity: target.max, expiryDate: '' }])
    setSerials(''); setNote(''); setError(''); setSaving(false)
  }, [target])

  if (!target) return null
  const serial = target.tracking === 'serie'
  const serialList = serials.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
  const total = serial ? serialList.length : rows.reduce((s, r) => s + (r.quantity || 0), 0)
  const over = total > target.max + 0.0005
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!target) return
    setSaving(true)
    const entries = serial
      ? serialList.map((code) => ({ code, quantity: 1 }))
      : rows.filter((r) => r.code.trim()).map((r) => ({ code: r.code, quantity: r.quantity, expiryDate: r.expiryDate || null }))
    const r = await window.api.trace.receive({ articleId: target.articleId, purchaseId: target.purchase?.purchaseId ?? null, entries, note })
    setSaving(false)
    if (!r.ok) return setError(r.error)
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>{serial ? 'Saisir les numéros de série' : 'Saisir les lots'}</DialogTitle>
        <DialogDescription>
          {target.designation} — {target.purchase
            ? `${target.purchase.purchaseRef ?? `Achat #${target.purchase.purchaseId}`} du ${fmtDate(target.purchase.purchaseDate)}${target.purchase.supplierName ? `, ${target.purchase.supplierName}` : ''}`
            : 'stock déjà en magasin'} · {formatQty(target.max)} {target.unit} à identifier
        </DialogDescription>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {serial ? (
            <div>
              <Label>Numéros de série (un par ligne — un scan + Entrée passe au suivant)</Label>
              <Textarea autoFocus rows={8} className="font-mono" value={serials} onChange={(e) => setSerials(e.target.value)} placeholder={'SN-000123\nSN-000124'} />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_8rem_10rem_2.5rem] gap-2 text-xs font-medium text-muted-foreground">
                <span>N° de lot</span><span>Quantité</span><span>Date limite (option)</span><span />
              </div>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_8rem_10rem_2.5rem] gap-2">
                  <Input autoFocus={i === rows.length - 1} className="font-mono" value={r.code} onChange={(e) => setRow(i, { code: e.target.value })} placeholder="Ex. L2410-07" />
                  <Input type="number" step="0.001" min="0.001" value={r.quantity} onChange={(e) => setRow(i, { quantity: parseFloat(e.target.value) || 0 })} />
                  <Input type="date" value={r.expiryDate} onChange={(e) => setRow(i, { expiryDate: e.target.value })} />
                  <Button type="button" size="icon" variant="ghost" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { code: '', quantity: Math.max(0, target.max - total), expiryDate: '' }])}>
                <Plus className="h-4 w-4" />Ajouter un lot
              </Button>
            </div>
          )}
          <div>
            <Label>Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. étiquettes vérifiées" />
          </div>
          <p className={cn('text-sm', over ? 'text-destructive' : 'text-muted-foreground')}>
            Total saisi : <span className="tnum font-semibold">{formatQty(total)}</span> / {formatQty(target.max)} {target.unit}
            {total < target.max - 0.0005 && !over && ' — le reste pourra être identifié plus tard.'}
          </p>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving || over || total <= 0}><PackageCheck className="h-4 w-4" />Enregistrer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Historique complet d'un article ----------
function HistoryTab() {
  const [articles, setArticles] = useState<Article[]>([])
  const [article, setArticle] = useState<Article | null>(null)
  const [events, setEvents] = useState<ArticleEvent[]>([])

  useEffect(() => { window.api.articles.list().then((r) => r.ok && setArticles(r.data)) }, [])
  useEffect(() => {
    if (!article) return setEvents([])
    window.api.trace.history(article.id).then((r) => r.ok && setEvents(r.data))
  }, [article])

  const cols = useMemo<GridColumn<ArticleEvent>[]>(() => [
    { id: 'date', header: 'Date', type: 'date', value: (e) => e.date, width: '11rem', cell: (e) => <span className="tnum text-muted-foreground">{fmtDateTime(e.date)}</span> },
    { id: 'type', header: 'Opération', type: 'enum', value: (e) => e.type, options: Object.entries(MOVEMENT_LABELS).map(([value, label]) => ({ value, label })),
      cell: (e) => <Badge>{MOVEMENT_LABELS[e.type]}</Badge> },
    { id: 'doc', header: 'Document', value: (e) => e.docLabel ?? '', cell: (e) => e.docLabel ?? <span className="text-muted-foreground">—</span> },
    { id: 'party', header: 'Client / fournisseur', type: 'enum', value: (e) => e.party ?? '—' },
    { id: 'quantity', header: 'Quantité', type: 'number', value: (e) => e.quantity, align: 'right',
      cell: (e) => <span className={cn('tnum inline-flex items-center gap-1 font-semibold', e.quantity > 0 ? 'text-success' : 'text-destructive')}>
        {e.quantity > 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}{e.quantity > 0 ? '+' : ''}{formatQty(e.quantity)}</span> },
    { id: 'balance', header: 'Stock après', type: 'number', value: (e) => e.balance, align: 'right', cell: (e) => <span className="tnum">{formatQty(e.balance)}</span> },
    { id: 'unitCost', header: 'Coût unitaire', type: 'money', value: (e) => e.unitCost ?? 0, align: 'right', hidden: true,
      cell: (e) => e.unitCost === null ? '—' : <span className="tnum">{formatMoney(e.unitCost)}</span> },
    { id: 'lots', header: 'Lots', value: (e) => e.lots ?? '', cell: (e) => <span className="font-mono text-xs">{e.lots ?? '—'}</span> },
    { id: 'user', header: 'Par', type: 'enum', value: (e) => e.userName ?? '—' },
    { id: 'note', header: 'Note', value: (e) => e.note ?? '', hidden: true }
  ], [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ArticleSearchBox articles={articles} onPick={setArticle} placeholder="Scanner ou rechercher l’article à retracer…" className="w-[28rem] max-w-full" />
        {article && (
          <div className="flex items-center gap-3 rounded-md border bg-muted px-3 py-2 text-sm">
            <History className="h-4 w-4 text-primary" />
            <span className="font-medium">{article.designation}</span>
            <span className="font-mono text-xs text-muted-foreground">{article.barcode}</span>
            <span className="tnum">Stock : {formatQty(article.stock)} {article.unit}</span>
          </div>
        )}
      </div>
      {article ? (
        <DataGrid id="trace-history" data={events} columns={cols} exportName={`historique-${article.barcode}`}
          searchPlaceholder="Rechercher un document, un client, un lot…"
          presets={[{ label: 'Entrées', filters: { quantity: { min: '0.001' } } }, { label: 'Sorties', filters: { quantity: { max: '-0.001' } } },
            { label: '30 derniers jours', filters: { date: datePreset('30d') } }]}
          emptyText="Aucun mouvement pour cet article." />
      ) : (
        <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Choisissez un article pour voir tout son parcours : achats, ventes, retours, ajustements, avec le stock après chaque opération.
        </p>
      )}
    </div>
  )
}

// ---------- Journal d'audit (administrateur) ----------
function AuditTab() {
  const [from, setFrom] = useState(daysFromNow(-29))
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState<AuditEntry[]>([])

  useEffect(() => { window.api.audit.list(from, to).then((r) => r.ok && setRows(r.data)) }, [from, to])

  const cols = useMemo<GridColumn<AuditEntry>[]>(() => [
    { id: 'date', header: 'Date', type: 'date', value: (a) => a.date, width: '11rem', cell: (a) => <span className="tnum text-muted-foreground">{fmtDateTime(a.date)}</span> },
    { id: 'user', header: 'Utilisateur', type: 'enum', value: (a) => a.userName },
    { id: 'action', header: 'Action', type: 'enum', value: (a) => a.action, cell: (a) => <span className="font-medium">{a.action}</span> },
    { id: 'ok', header: 'Résultat', type: 'enum', value: (a) => (a.ok ? 'ok' : 'echec'), options: [{ value: 'ok', label: 'Réussi' }, { value: 'echec', label: 'Refusé / échec' }],
      cell: (a) => a.ok ? <Badge tone="success">Réussi</Badge> : <Badge tone="danger" title={a.error ?? ''}>{a.error === 'Accès refusé.' ? 'Accès refusé' : 'Échec'}</Badge> },
    { id: 'details', header: 'Détails', value: (a) => `${a.details ?? ''} ${a.result ?? ''} ${a.error ?? ''}`,
      cell: (a) => <div className="max-w-[36rem] truncate font-mono text-xs text-muted-foreground" title={[a.details, a.result && `→ ${a.result}`, a.error].filter(Boolean).join('\n')}>
        {a.details ?? ''}{a.result ? ` → ${a.result}` : ''}{!a.ok && a.error ? ` ✗ ${a.error}` : ''}</div> },
    { id: 'channel', header: 'Canal', value: (a) => a.channel, hidden: true }
  ], [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><Label>Du</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>Au</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <p className="flex items-center gap-2 pb-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />Journal infalsifiable : aucune ligne ne peut être modifiée ni effacée. Les mots de passe n’y figurent jamais.
        </p>
      </div>
      <DataGrid id="trace-audit" data={rows} columns={cols} exportName={`audit-${from}-${to}`}
        searchPlaceholder="Rechercher un utilisateur, une action, un numéro…"
        presets={[{ label: 'Refus et échecs', filters: { ok: 'echec' } }, { label: 'Connexions', filters: { action: 'Connexion' } }]}
        emptyText="Aucune action sur cette période." />
    </div>
  )
}
