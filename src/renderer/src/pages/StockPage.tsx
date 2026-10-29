import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Plus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label, Select } from '@/components/ui/input'
import { cn, formatQty } from '@/lib/utils'
import { useAppConfig } from '@/lib/useAppConfig'
import { stockLevel } from '@shared/settings'
import { MOVEMENT_LABELS, type Article, type MovementInput, type StockMovement } from '@shared/types'

type Tab = 'alertes' | 'mouvements'

// Motifs de saisie manuelle et sens autorisé (null = au choix).
const REASONS: { value: MovementInput['type']; label: string; dir: 'in' | 'out' | null }[] = [
  { value: 'ajustement', label: 'Ajustement (inventaire)', dir: null },
  { value: 'perte', label: 'Perte / casse', dir: 'out' },
  { value: 'retour_client', label: 'Retour client', dir: 'in' },
  { value: 'retour_fournisseur', label: 'Retour fournisseur', dir: 'out' }
]

export default function StockPage() {
  const cfg = useAppConfig()
  const [tab, setTab] = useState<Tab>('alertes')
  const [articles, setArticles] = useState<Article[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [search, setSearch] = useState('')
  const [dialogFor, setDialogFor] = useState<Article | null | 'new'>(null)

  const load = useCallback(async () => {
    const [a, m] = await Promise.all([window.api.articles.list(), window.api.stock.movements()])
    if (a.ok) setArticles(a.data)
    if (m.ok) setMovements(m.data)
  }, [])
  useEffect(() => { load() }, [load])

  const alerts = useMemo(
    () => articles.filter((a) => stockLevel(a.stock, a.minStock, cfg) !== 'ok').sort((x, y) => x.stock - y.stock),
    [articles, cfg]
  )
  const q = search.toLowerCase().trim()
  const shownMovements = movements.filter((m) => !q || m.designation.toLowerCase().includes(q) || m.barcode.toLowerCase().includes(q))

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
          <p className="text-muted-foreground">Alertes de réapprovisionnement et journal des mouvements.</p>
        </div>
        <Button onClick={() => setDialogFor('new')}><Plus className="h-4 w-4" />Nouveau mouvement</Button>
      </header>

      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {([['alertes', `Alertes (${alerts.length})`], ['mouvements', 'Mouvements']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn('rounded-md px-4 py-2 text-sm font-medium', tab === id ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {label}
          </button>
        ))}
      </div>

      <section className="rounded-lg border bg-card shadow-soft">
        {tab === 'mouvements' && (
          <div className="border-b p-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Filtrer par article ou code-barres…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              {(tab === 'alertes' ? ['Article', 'Stock', 'Seuil', ''] : ['Date', 'Article', 'Type', 'Quantité', 'Note']).map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tab === 'alertes' && alerts.map((a) => (
              <tr key={a.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3"><div className="font-medium">{a.designation}</div><div className="font-mono text-xs text-muted-foreground">{a.barcode}</div></td>
                <td className="px-4 py-3"><Badge tone={a.stock <= 0 ? 'danger' : 'warning'} className="tnum">{formatQty(a.stock)} {a.unit}</Badge></td>
                <td className="tnum px-4 py-3 text-muted-foreground">{formatQty(a.minStock)}</td>
                <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setDialogFor(a)}>Ajuster</Button></td>
              </tr>
            ))}
            {tab === 'mouvements' && shownMovements.map((m) => (
              <tr key={m.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="tnum px-4 py-3 text-muted-foreground">{m.createdAt}</td>
                <td className="px-4 py-3"><div className="font-medium">{m.designation}</div><div className="font-mono text-xs text-muted-foreground">{m.barcode}</div></td>
                <td className="px-4 py-3"><Badge>{MOVEMENT_LABELS[m.type]}</Badge></td>
                <td className={cn('tnum px-4 py-3 font-semibold', m.quantity > 0 ? 'text-success' : 'text-destructive')}>
                  <span className="inline-flex items-center gap-1">
                    {m.quantity > 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    {m.quantity > 0 ? '+' : ''}{formatQty(m.quantity)} {m.unit}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{m.note ?? '—'}</td>
              </tr>
            ))}
            {((tab === 'alertes' && !alerts.length) || (tab === 'mouvements' && !shownMovements.length)) && (
              <tr><td colSpan={5} className="py-16 text-center text-muted-foreground">
                {tab === 'alertes' ? 'Aucune alerte : tous les stocks sont suffisants.' : 'Aucun mouvement.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </section>

      <MovementDialog articles={articles} target={dialogFor} onClose={() => setDialogFor(null)} onSaved={() => { setDialogFor(null); load() }} />
    </div>
  )
}

function MovementDialog({ articles, target, onClose, onSaved }: {
  articles: Article[]; target: Article | null | 'new'; onClose: () => void; onSaved: () => void
}) {
  const [articleId, setArticleId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [type, setType] = useState<MovementInput['type']>('ajustement')
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  // Réinitialise à chaque ouverture ; un article peut être présélectionné depuis les alertes.
  useEffect(() => {
    if (!target) return
    setArticleId(target !== 'new' ? target.id : null)
    setQuery(''); setType('ajustement'); setDirection('in'); setQuantity(1); setNote(''); setError('')
  }, [target])

  const article = articles.find((a) => a.id === articleId)
  const reason = REASONS.find((r) => r.value === type)!
  const effectiveDir = reason.dir ?? direction
  // Recherche par désignation ou code-barres (un scan + Entrée sélectionne l'article exact).
  const matches = query.trim()
    ? articles.filter((a) => (a.designation + ' ' + a.barcode).toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : []

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!articleId) return setError('Choisissez un article.')
    const res = await window.api.stock.add({ articleId, type, direction: effectiveDir, quantity, note })
    if (!res.ok) return setError(res.error)
    onSaved()
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Nouveau mouvement de stock</DialogTitle>
        <DialogDescription>Le stock ne change que par des mouvements enregistrés dans le journal.</DialogDescription>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <Label>Article</Label>
            {article ? (
              <div className="flex items-center justify-between rounded-md border bg-muted px-3 py-2">
                <div><div className="font-medium">{article.designation}</div>
                  <div className="text-xs text-muted-foreground">Stock actuel : {formatQty(article.stock)} {article.unit}</div></div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setArticleId(null)}>Changer</Button>
              </div>
            ) : (
              <>
                <Input autoFocus placeholder="Scanner ou rechercher…" value={query} onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && matches.length) { e.preventDefault(); setArticleId(matches[0].id) } }} />
                {matches.length > 0 && (
                  <ul className="mt-1 overflow-hidden rounded-md border">
                    {matches.map((a) => (
                      <li key={a.id}><button type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => setArticleId(a.id)}>
                        <span>{a.designation}</span><span className="font-mono text-xs text-muted-foreground">{a.barcode}</span></button></li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Motif</Label>
              <Select value={type} onChange={(e) => setType(e.target.value as MovementInput['type'])}>
                {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </div>
            <div>
              <Label>Sens</Label>
              <Select value={effectiveDir} disabled={!!reason.dir} onChange={(e) => setDirection(e.target.value as 'in' | 'out')}>
                <option value="in">Entrée (+)</option>
                <option value="out">Sortie (−)</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Quantité</Label>
            <Input type="number" step="0.001" min="0.001" value={quantity} onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <Label>Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. inventaire du 30/10" />
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
