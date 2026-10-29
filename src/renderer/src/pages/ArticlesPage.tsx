import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel,
  getSortedRowModel, useReactTable, type SortingState
} from '@tanstack/react-table'
import { AlertTriangle, ArrowUpDown, FileSpreadsheet, PackageX, Pencil, Plus, Search, Trash2, Wallet, Boxes } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Select } from '@/components/ui/input'
import { formatMoney, formatQty } from '@/lib/utils'
import ArticleForm from './ArticleForm'
import { useAppConfig } from '@/lib/useAppConfig'
import { stockLevel } from '@shared/settings'
import type { Article, Category, ImportReport } from '@shared/types'

const col = createColumnHelper<Article>()

// Carte indicateur en haut de page
function Stat({ icon: Icon, label, value, tone }: { icon: typeof Boxes; label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card p-5 shadow-soft">
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="tnum text-2xl font-semibold">{value}</div>
      </div>
    </div>
  )
}

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [alertOnly, setAlertOnly] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([])
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

  // Filtres appliqués avant le tableau (catégorie + alertes) ; la recherche texte est gérée par TanStack.
  const data = useMemo(
    () => articles.filter((a) =>
      (!categoryFilter || String(a.categoryId) === categoryFilter) && (!alertOnly || stockLevel(a.stock, a.minStock, cfg) !== 'ok')),
    [articles, categoryFilter, alertOnly, cfg]
  )

  const stats = useMemo(() => ({
    total: articles.length,
    value: articles.reduce((s, a) => s + Math.max(a.stock, 0) * a.purchasePrice, 0),
    low: articles.filter((a) => stockLevel(a.stock, a.minStock, cfg) === 'low').length,
    out: articles.filter((a) => a.stock <= 0).length
  }), [articles, cfg])

  const columns = useMemo(() => [
    col.accessor('barcode', { header: 'Code-barres', cell: (c) => <span className="font-mono text-[13px] text-muted-foreground">{c.getValue()}</span> }),
    col.accessor('designation', { header: 'Désignation', cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
    col.accessor('categoryName', { header: 'Catégorie', cell: (c) => (c.getValue() ? <Badge>{c.getValue()}</Badge> : <span className="text-muted-foreground">—</span>) }),
    col.accessor('purchasePrice', { header: 'Prix achat', cell: (c) => <span className="tnum">{formatMoney(c.getValue())}</span> }),
    col.accessor('salePrice', { header: 'Prix vente', cell: (c) => <span className="tnum font-semibold">{formatMoney(c.getValue())}</span> }),
    col.accessor('stock', {
      header: 'Stock',
      cell: (c) => {
        const a = c.row.original
        const lv = stockLevel(a.stock, a.minStock, cfg)
        const tone = lv === 'out' ? 'danger' : lv === 'low' ? 'warning' : 'success'
        return <Badge tone={tone} className="tnum">{formatQty(a.stock)} {a.unit}</Badge>
      }
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: (c) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" title="Modifier" onClick={() => { setEditing(c.row.original); setFormOpen(true) }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Supprimer" onClick={() => setToDelete(c.row.original)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      )
    })
  ], [cfg])

  const table = useReactTable({
    data, columns,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearch,
    // Recherche sur code-barres OU désignation, sans tenir compte de la casse.
    globalFilterFn: (row, _id, value: string) => {
      const q = value.toLowerCase().trim()
      return row.original.designation.toLowerCase().includes(q) || row.original.barcode.toLowerCase().includes(q)
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } }
  })

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
    <div className="mx-auto max-w-[1400px] space-y-6 p-8">
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

      <section className="rounded-lg border bg-card shadow-soft">
        <div className="flex items-center gap-3 border-b p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Rechercher par désignation ou code-barres…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select className="w-56" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Toutes les catégories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button variant={alertOnly ? 'default' : 'outline'} onClick={() => setAlertOnly((v) => !v)}>
            <AlertTriangle className="h-4 w-4" />Alertes
          </Button>
        </div>

        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-4 py-3 font-medium">
                    {h.column.getCanSort() ? (
                      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    ) : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0 hover:bg-muted/50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr><td colSpan={columns.length} className="py-16 text-center text-muted-foreground">Aucun article trouvé.</td></tr>
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t p-4 text-sm text-muted-foreground">
          <span>{table.getFilteredRowModel().rows.length} article(s)</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Précédent</Button>
            <span>Page {table.getState().pagination.pageIndex + 1} / {Math.max(table.getPageCount(), 1)}</span>
            <Button variant="outline" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Suivant</Button>
          </div>
        </div>
      </section>

      {message && (
        <div className="fixed bottom-6 right-6 rounded-lg border bg-card px-4 py-3 shadow-soft">
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
          <DialogDescription>
            Colonnes reconnues : Code-barres, Désignation, Catégorie, Unité, Prix achat, Prix vente, Stock, Stock min.
          </DialogDescription>
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
