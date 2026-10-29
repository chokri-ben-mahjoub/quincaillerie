import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, FileSpreadsheet, PackageX, Pencil, Plus, Trash2, Wallet, Boxes } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import DataGrid, { type GridColumn } from '@/components/DataGrid'
import { formatMoney, formatQty } from '@/lib/utils'
import ArticleForm from './ArticleForm'
import { useAppConfig } from '@/lib/useAppConfig'
import { stockLevel } from '@shared/settings'
import type { Article, Category, ImportReport } from '@shared/types'

const NO_CATEGORY = '(Sans catégorie)'
const LEVELS = [{ value: 'out', label: 'Rupture' }, { value: 'low', label: 'Stock bas' }, { value: 'ok', label: 'Normal' }]
const LEVEL_TONE = { out: 'danger', low: 'warning', ok: 'success' } as const

// Carte indicateur en haut de page
function Stat({ icon: Icon, label, value, tone }: { icon: typeof Boxes; label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card p-5 shadow-soft">
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${tone}`}><Icon className="h-6 w-6" /></div>
      <div>
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={`tnum whitespace-nowrap font-semibold ${value.length > 12 ? 'text-xl' : 'text-2xl'}`}>{value}</div>
      </div>
    </div>
  )
}

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [editing, setEditing] = useState<Article | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Article | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [message, setMessage] = useState('')
  const cfg = useAppConfig()

  const load = useCallback(async () => {
    const [a, c] = await Promise.all([window.api.articles.list(), window.api.categories.list()])
    if (a.ok) setArticles(a.data)
    if (c.ok) setCategories(c.data)
  }, [])
  useEffect(() => { load() }, [load])

  const stats = useMemo(() => ({
    total: articles.length,
    value: articles.reduce((s, a) => s + Math.max(a.stock, 0) * a.purchasePrice, 0),
    low: articles.filter((a) => stockLevel(a.stock, a.minStock, cfg) === 'low').length,
    out: articles.filter((a) => a.stock <= 0).length
  }), [articles, cfg])

  const level = useCallback((a: Article) => stockLevel(a.stock, a.minStock, cfg), [cfg])
  const margin = (a: Article) => (a.purchasePrice > 0 ? Math.round(((a.salePrice - a.purchasePrice) / a.purchasePrice) * 1000) / 10 : null)

  const columns = useMemo<GridColumn<Article>[]>(() => [
    { id: 'barcode', header: 'Code-barres', value: (a) => a.barcode, cell: (a) => <span className="font-mono text-[13px] text-muted-foreground">{a.barcode}</span>, width: '10rem' },
    { id: 'designation', header: 'Désignation', value: (a) => a.designation, cell: (a) => <span className="font-medium">{a.designation}</span> },
    { id: 'category', header: 'Catégorie', type: 'enum', value: (a) => a.categoryName ?? NO_CATEGORY,
      options: [...categories.map((c) => ({ value: c.name, label: c.name })), { value: NO_CATEGORY, label: NO_CATEGORY }],
      cell: (a) => (a.categoryName ? <Badge>{a.categoryName}</Badge> : <span className="text-muted-foreground">—</span>) },
    { id: 'unit', header: 'Unité', type: 'enum', value: (a) => a.unit, hidden: true },
    { id: 'purchasePrice', header: 'Prix achat', type: 'money', value: (a) => a.purchasePrice, align: 'right' },
    { id: 'salePrice', header: 'Prix vente', type: 'money', value: (a) => a.salePrice, align: 'right', cell: (a) => <span className="tnum font-semibold">{formatMoney(a.salePrice)}</span> },
    { id: 'margin', header: 'Marge %', type: 'number', value: margin, align: 'right', cell: (a) => <span className="tnum text-muted-foreground">{margin(a) === null ? '—' : `${formatQty(margin(a)!)} %`}</span>, hidden: true },
    { id: 'stock', header: 'Stock', type: 'number', value: (a) => a.stock, align: 'right', cell: (a) => <span className="tnum">{formatQty(a.stock)} <span className="text-muted-foreground">{a.unit}</span></span> },
    { id: 'minStock', header: 'Seuil', type: 'number', value: (a) => a.minStock, align: 'right', hidden: true },
    { id: 'level', header: 'État du stock', type: 'enum', value: level, options: LEVELS, width: '10rem',
      cell: (a) => <Badge tone={LEVEL_TONE[level(a)]}>{LEVELS.find((l) => l.value === level(a))!.label}</Badge> },
    { id: 'stockValue', header: 'Valeur du stock', type: 'money', value: (a) => Math.round(Math.max(a.stock, 0) * a.purchasePrice * 1000) / 1000, align: 'right', summary: 'sum', hidden: true },
    { id: 'actions', header: '', value: () => '', filterable: false, sortable: false, align: 'right', width: '6rem',
      cell: (a) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" title="Modifier" onClick={() => { setEditing(a); setFormOpen(true) }}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" title="Supprimer" onClick={() => setToDelete(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      ) }
  ], [categories, level])

  async function confirmDelete() {
    if (!toDelete) return
    const res = await window.api.articles.remove(toDelete.id)
    setToDelete(null)
    if (res.ok) { setMessage('Article supprimé.'); load() } else setMessage(res.error)
  }

  async function runImport() {
    const res = await window.api.articles.importExcel()
    if (!res.ok) return setMessage(res.error)
    if (res.data) { setReport(res.data); load() }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Articles</h1>
          <p className="text-muted-foreground">Catalogue des produits, prix et niveaux de stock.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runImport}><FileSpreadsheet className="h-4 w-4" />Importer Excel</Button>
          <Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="h-4 w-4" />Nouvel article</Button>
        </div>
      </header>

      <section className="grid grid-cols-4 gap-4">
        <Stat icon={Boxes} label="Articles" value={String(stats.total)} tone="bg-primary/10 text-primary" />
        <Stat icon={Wallet} label="Valeur du stock (achat)" value={formatMoney(stats.value)} tone="bg-success/12 text-success" />
        <Stat icon={AlertTriangle} label="Stock faible" value={String(stats.low)} tone="bg-warning/15 text-warning" />
        <Stat icon={PackageX} label="En rupture" value={String(stats.out)} tone="bg-destructive/12 text-destructive" />
      </section>

      <DataGrid id="articles" data={articles} columns={columns} exportName="articles" searchPlaceholder="Rechercher : désignation, code-barres, catégorie… (plusieurs mots possibles)"
        presets={[{ label: 'En rupture', filters: { level: 'out' } }, { label: 'Stock bas', filters: { level: 'low' } }]}
        emptyText="Aucun article. Importez un fichier Excel ou créez un article."
        onRowClick={(a) => { setEditing(a); setFormOpen(true) }} />

      {message && (
        <div className="fixed bottom-6 right-6 z-40 rounded-lg border bg-card px-4 py-3 shadow-soft">
          {message} <button className="ml-3 text-primary" onClick={() => setMessage('')}>OK</button>
        </div>
      )}

      <ArticleForm open={formOpen} article={editing} categories={categories}
        onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); load() }} />

      {/* Confirmation de suppression */}
      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Supprimer l’article ?</DialogTitle>
          <DialogDescription>« {toDelete?.designation} » sera retiré du catalogue. L’historique des ventes est conservé.</DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setToDelete(null)}>Annuler</Button>
            <Button variant="destructive" onClick={confirmDelete}>Supprimer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rapport d'import Excel */}
      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>Import terminé</DialogTitle>
          <DialogDescription>Colonnes reconnues : Code-barres, Désignation, Catégorie, Unité, Prix achat, Prix vente, Stock, Stock min.</DialogDescription>
          <div className="mt-4 flex gap-3">
            <Badge tone="success">{report?.created} créé(s)</Badge>
            <Badge>{report?.updated} mis à jour</Badge>
            <Badge tone={report?.errors.length ? 'danger' : 'neutral'}>{report?.errors.length} erreur(s)</Badge>
          </div>
          {!!report?.errors.length && (
            <ul className="mt-4 max-h-48 space-y-1 overflow-auto rounded-md bg-muted p-3 text-sm">
              {report.errors.map((e) => <li key={e.line}>Ligne {e.line} : {e.message}</li>)}
            </ul>
          )}
          <div className="mt-6 flex justify-end"><Button onClick={() => setReport(null)}>Fermer</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
