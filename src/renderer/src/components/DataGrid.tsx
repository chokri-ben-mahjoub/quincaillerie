import { useEffect, useMemo, useRef, useState } from 'react'
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type ColumnFiltersState, type FilterFn, type SortingState, type VisibilityState
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, Download, FilterX, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, fmtDate, formatMoney, formatQty, norm } from '@/lib/utils'
import { takeSearchIntent } from '@/lib/searchIntent'

// Grille de données façon DevExpress : ligne de filtres sous les en-têtes (texte, liste déroulante, plage de nombres ou de dates),
// tri multi-colonnes (Maj+clic), recherche globale, choix des colonnes, totaux, pagination, export Excel (CSV).
// Les préférences (colonnes visibles, tri, taille de page) sont mémorisées par grille.

export type GridType = 'text' | 'number' | 'money' | 'date' | 'enum' | 'bool'

export interface GridColumn<T> {
  id: string
  header: string
  value: (row: T) => string | number | boolean | null | undefined
  type?: GridType
  /** Pour « enum » : valeurs proposées (sinon déduites des données). */
  options?: { value: string; label: string }[]
  cell?: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  width?: string
  hidden?: boolean // masquée par défaut (choix des colonnes)
  summary?: 'sum' | 'count'
  filterable?: boolean
  sortable?: boolean
  exportValue?: (row: T) => string | number
}

export interface GridPreset { label: string; filters: Record<string, FilterValue> }
export type FilterValue = string | { min?: string; max?: string; preset?: string }

interface Props<T> {
  id: string
  data: T[]
  columns: GridColumn<T>[]
  pageSize?: number
  searchPlaceholder?: string
  presets?: GridPreset[]
  toolbar?: React.ReactNode
  onRowClick?: (row: T) => void
  exportName?: string
  emptyText?: string
  maxHeight?: string // ex. « calc(100vh - 26rem) » : défilement interne avec en-têtes figés
}

// ---------- Périodes prédéfinies pour les dates ----------
const iso = (d: Date) => d.toLocaleDateString('sv-SE')
const DATE_PRESETS: { id: string; label: string; range: () => { min: string; max: string } }[] = [
  { id: 'today', label: 'Aujourd’hui', range: () => ({ min: iso(new Date()), max: iso(new Date()) }) },
  { id: 'yesterday', label: 'Hier', range: () => { const d = new Date(); d.setDate(d.getDate() - 1); return { min: iso(d), max: iso(d) } } },
  { id: '7d', label: '7 derniers jours', range: () => { const d = new Date(); d.setDate(d.getDate() - 6); return { min: iso(d), max: iso(new Date()) } } },
  { id: '30d', label: '30 derniers jours', range: () => { const d = new Date(); d.setDate(d.getDate() - 29); return { min: iso(d), max: iso(new Date()) } } },
  { id: 'month', label: 'Ce mois', range: () => { const n = new Date(); return { min: iso(new Date(n.getFullYear(), n.getMonth(), 1)), max: iso(new Date()) } } },
  { id: 'lastmonth', label: 'Mois dernier', range: () => { const n = new Date(); return { min: iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), max: iso(new Date(n.getFullYear(), n.getMonth(), 0)) } } },
  { id: 'year', label: 'Cette année', range: () => { const n = new Date(); return { min: iso(new Date(n.getFullYear(), 0, 1)), max: iso(new Date()) } } }
]

/** Valeur de filtre « période » prête à l'emploi pour les préréglages : datePreset('month'). */
export const datePreset = (id: 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'lastmonth' | 'year'): FilterValue => ({ preset: id, ...DATE_PRESETS.find((p) => p.id === id)!.range() })

// ---------- Fonctions de filtre ----------
const emptyFilter = (v: unknown) => v === undefined || v === null || v === '' || (typeof v === 'object' && !(v as any).min && !(v as any).max)
const textFilter: FilterFn<any> = (row, id, v: string) => norm(row.getValue(id)).includes(norm(v))
textFilter.autoRemove = emptyFilter
const exactFilter: FilterFn<any> = (row, id, v: string) => String(row.getValue(id)) === v
exactFilter.autoRemove = emptyFilter
const numberRange: FilterFn<any> = (row, id, v: { min?: string; max?: string }) => {
  const x = Number(row.getValue(id))
  if (!Number.isFinite(x)) return false
  const parse = (s?: string) => (s === undefined || s === '' ? null : Number(String(s).replace(',', '.')))
  const lo = parse(v.min), hi = parse(v.max)
  return (lo === null || x >= lo - 1e-9) && (hi === null || x <= hi + 1e-9)
}
numberRange.autoRemove = emptyFilter
const dateRange: FilterFn<any> = (row, id, v: { min?: string; max?: string }) => {
  const x = String(row.getValue(id) ?? '').slice(0, 10)
  return !!x && (!v.min || x >= v.min) && (!v.max || x <= v.max)
}
dateRange.autoRemove = emptyFilter

// ---------- Préférences mémorisées ----------
function usePersisted<S>(key: string, initial: S): [S, (v: S | ((p: S) => S)) => void] {
  const [state, setState] = useState<S>(() => { try { const raw = localStorage.getItem(key); return raw ? { ...initial, ...JSON.parse(raw) } : initial } catch { return initial } })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)) } catch { /* ignoré */ } }, [key, state])
  return [state, setState]
}

const CSV_SEP = ';' // Excel en français
function toCsv<T>(rows: T[], cols: GridColumn<T>[]): string {
  const q = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const cell = (c: GridColumn<T>, r: T): string => {
    const v = c.exportValue ? c.exportValue(r) : c.value(r)
    if (v === null || v === undefined) return ''
    if (typeof v === 'number') return String(v).replace('.', ',')
    if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
    if (c.type === 'enum' && c.options) return c.options.find((o) => o.value === String(v))?.label ?? String(v)
    return String(v)
  }
  return [cols.map((c) => q(c.header)).join(CSV_SEP), ...rows.map((r) => cols.map((c) => q(cell(c, r))).join(CSV_SEP))].join('\r\n')
}

// ---------- Filtres d'une colonne (ligne sous l'en-tête) ----------
const fieldCls = 'h-8 w-full rounded border border-input bg-card px-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

function FilterCell<T>({ col, value, onChange, options }: { col: GridColumn<T>; value: FilterValue | undefined; onChange: (v: FilterValue | undefined) => void; options: { value: string; label: string }[] }) {
  const type = col.type ?? 'text'
  if (col.filterable === false) return null
  if (type === 'enum' || type === 'bool') {
    const opts = type === 'bool' ? [{ value: 'true', label: 'Oui' }, { value: 'false', label: 'Non' }] : options
    return (
      <select className={fieldCls} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">(Tous)</option>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }
  if (type === 'date') {
    const v = (typeof value === 'object' ? value : {}) as { min?: string; max?: string; preset?: string }
    return (
      <div className="space-y-1">
        <select className={fieldCls} value={v.preset ?? ''} onChange={(e) => {
          const id = e.target.value
          if (!id) return onChange(undefined)
          if (id === 'custom') return onChange({ preset: 'custom', min: v.min, max: v.max })
          onChange({ preset: id, ...DATE_PRESETS.find((p) => p.id === id)!.range() })
        }}>
          <option value="">(Toutes les dates)</option>
          {DATE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          <option value="custom">Période…</option>
        </select>
        {v.preset === 'custom' && (
          <div className="flex gap-1">
            <input type="date" className={fieldCls} value={v.min ?? ''} onChange={(e) => onChange({ ...v, min: e.target.value || undefined })} />
            <input type="date" className={fieldCls} value={v.max ?? ''} onChange={(e) => onChange({ ...v, max: e.target.value || undefined })} />
          </div>
        )}
      </div>
    )
  }
  if (type === 'number' || type === 'money') {
    const v = (typeof value === 'object' ? value : {}) as { min?: string; max?: string }
    const set = (p: { min?: string; max?: string }) => onChange({ ...v, ...p })
    return (
      <div className="flex gap-1">
        <input className={fieldCls} placeholder="≥ min" inputMode="decimal" value={v.min ?? ''} onChange={(e) => set({ min: e.target.value })} />
        <input className={fieldCls} placeholder="≤ max" inputMode="decimal" value={v.max ?? ''} onChange={(e) => set({ max: e.target.value })} />
      </div>
    )
  }
  return <input className={fieldCls} placeholder="Contient…" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)} />
}

function defaultCell<T>(c: GridColumn<T>, row: T, optLabels: Map<string, string>): React.ReactNode {
  const v = c.value(row)
  if (v === null || v === undefined || v === '') return <span className="text-muted-foreground">—</span>
  switch (c.type) {
    case 'money': return <span className="tnum">{formatMoney(Number(v))}</span>
    case 'number': return <span className="tnum">{formatQty(Number(v))}</span>
    case 'date': return <span className="tnum text-muted-foreground">{fmtDate(String(v))}</span>
    case 'bool': return v ? 'Oui' : 'Non'
    case 'enum': return optLabels.get(`${c.id}:${v}`) ?? String(v)
    default: return String(v)
  }
}

// ---------- Grille ----------
export default function DataGrid<T>({ id, data, columns, pageSize = 15, searchPlaceholder = 'Rechercher…', presets, toolbar, onRowClick, exportName, emptyText = 'Aucun résultat.', maxHeight }: Props<T>) {
  const defaults = useMemo(() => ({ hidden: columns.filter((c) => c.hidden).map((c) => c.id), pageSize, sorting: [] as SortingState }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [prefs, setPrefs] = usePersisted(`grid:${id}`, defaults)
  const [filters, setFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState(() => takeSearchIntent(id) ?? '') // recherche venue de Ctrl+K, s'il y en a une
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: prefs.pageSize })
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Valeurs proposées par les listes déroulantes : celles des données (ou celles fournies).
  const enumOptions = useMemo(() => {
    const out = new Map<string, { value: string; label: string }[]>()
    for (const c of columns) {
      if (c.type !== 'enum') continue
      if (c.options) { out.set(c.id, c.options); continue }
      const vals = [...new Set(data.map((r) => c.value(r)).filter((v) => v !== null && v !== undefined && v !== '').map(String))].sort((a, b) => a.localeCompare(b, 'fr'))
      out.set(c.id, vals.map((v) => ({ value: v, label: v })))
    }
    return out
  }, [columns, data])
  const optLabels = useMemo(() => { const m = new Map<string, string>(); enumOptions.forEach((opts, cid) => opts.forEach((o) => m.set(`${cid}:${o.value}`, o.label))); return m }, [enumOptions])

  const tcols = useMemo<ColumnDef<T>[]>(() => columns.map((c) => ({
    id: c.id,
    accessorFn: (r: T) => c.value(r) ?? '',
    header: c.header,
    enableSorting: c.sortable !== false,
    sortUndefined: 'last' as const,
    filterFn: c.type === 'date' ? dateRange : c.type === 'number' || c.type === 'money' ? numberRange : c.type === 'enum' || c.type === 'bool' ? exactFilter : textFilter,
    meta: { grid: c }
  })), [columns])

  const globalFn = useMemo<FilterFn<T>>(() => (row, _id, value: string) => {
    const hay = norm(columns.map((c) => { const v = c.value(row.original); return c.type === 'enum' ? `${v} ${optLabels.get(`${c.id}:${v}`) ?? ''}` : v }).join(' '))
    return norm(value).split(/\s+/).filter(Boolean).every((t) => hay.includes(t))
  }, [columns, optLabels])

  const visibility: VisibilityState = useMemo(() => Object.fromEntries(columns.map((c) => [c.id, !prefs.hidden.includes(c.id)])), [columns, prefs.hidden])

  const table = useReactTable({
    data, columns: tcols,
    state: { sorting: prefs.sorting, columnFilters: filters, globalFilter, pagination, columnVisibility: visibility },
    onSortingChange: (u) => setPrefs((p) => ({ ...p, sorting: typeof u === 'function' ? u(p.sorting) : u })),
    onColumnFiltersChange: setFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: (u) => setPagination((p) => { const n = typeof u === 'function' ? u(p) : u; if (n.pageSize !== p.pageSize) setPrefs((s) => ({ ...s, pageSize: n.pageSize })); return n }),
    globalFilterFn: globalFn,
    autoResetPageIndex: true,
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel()
  })

  useEffect(() => {
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const filterOf = (cid: string) => filters.find((f) => f.id === cid)?.value as FilterValue | undefined
  const setFilter = (cid: string, v: FilterValue | undefined) =>
    setFilters((fs) => { const rest = fs.filter((f) => f.id !== cid); return emptyFilter(v) ? rest : [...rest, { id: cid, value: v }] })
  const clearAll = () => { setFilters([]); setGlobalFilter('') }

  const visibleCols = columns.filter((c) => visibility[c.id])
  const filteredRows = table.getFilteredRowModel().rows
  const sortedRows = table.getSortedRowModel().rows
  const activeCount = filters.length + (globalFilter ? 1 : 0)
  const presetActive = (p: GridPreset) => {
    const keys = Object.keys(p.filters)
    return keys.length === filters.length && keys.every((k) => JSON.stringify(filterOf(k)) === JSON.stringify(p.filters[k]))
  }

  const chipLabel = (cid: string, v: FilterValue): string => {
    const c = columns.find((x) => x.id === cid)!
    if (typeof v === 'string') return `${c.header} : ${c.type === 'enum' ? optLabels.get(`${cid}:${v}`) ?? v : c.type === 'bool' ? (v === 'true' ? 'Oui' : 'Non') : v}`
    if (c.type === 'date') return `${c.header} : ${v.preset && v.preset !== 'custom' ? DATE_PRESETS.find((p) => p.id === v.preset)?.label : `${fmtDate(v.min) || '…'} → ${fmtDate(v.max) || '…'}`}`
    return `${c.header} : ${v.min ? `≥ ${v.min}` : ''}${v.min && v.max ? ' et ' : ''}${v.max ? `≤ ${v.max}` : ''}`
  }

  function exportCsv() {
    const csv = '﻿' + toCsv(sortedRows.map((r) => r.original), visibleCols) // BOM : accents corrects dans Excel
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${exportName ?? id}-${iso(new Date())}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const sums = visibleCols.map((c) => (c.summary ? filteredRows.reduce((s, r) => s + (c.summary === 'sum' ? Number(c.value(r.original)) || 0 : 1), 0) : null))
  const hasSummary = sums.some((s) => s !== null)
  const { pageIndex, pageSize: size } = table.getState().pagination
  const total = filteredRows.length
  const first = total ? pageIndex * size + 1 : 0
  const last = Math.min((pageIndex + 1) * size, total)

  return (
    <section className="rounded-lg border bg-card shadow-soft">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={searchPlaceholder} value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} />
        </div>
        {presets && (
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button className={cn('rounded-md px-3 py-1.5 text-sm font-medium', !filters.length && !globalFilter ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')} onClick={clearAll}>Tous</button>
            {presets.map((p) => (
              <button key={p.label} className={cn('rounded-md px-3 py-1.5 text-sm font-medium', presetActive(p) ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                onClick={() => setFilters(Object.entries(p.filters).map(([cid, value]) => ({ id: cid, value })))}>{p.label}</button>
            ))}
          </div>
        )}
        {toolbar}
        <div className="relative" ref={menuRef}>
          <Button variant="outline" onClick={() => setMenuOpen((o) => !o)}><Columns3 className="h-4 w-4" />Colonnes</Button>
          {menuOpen && (
            <div className="absolute right-0 z-30 mt-1 w-60 rounded-lg border bg-card p-2 shadow-soft">
              {columns.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <input type="checkbox" className="accent-[hsl(var(--primary))]" checked={visibility[c.id]}
                    onChange={(e) => setPrefs((p) => ({ ...p, hidden: e.target.checked ? p.hidden.filter((h) => h !== c.id) : [...p.hidden, c.id] }))} />
                  {c.header || '(actions)'}
                </label>
              ))}
              <button className="mt-1 w-full rounded px-2 py-1.5 text-left text-xs text-primary hover:bg-muted" onClick={() => setPrefs((p) => ({ ...p, hidden: defaults.hidden, sorting: [] }))}>Réinitialiser l’affichage</button>
            </div>
          )}
        </div>
        <Button variant="outline" onClick={exportCsv} title="Exporter la liste filtrée vers Excel (CSV)"><Download className="h-4 w-4" />Exporter</Button>
      </div>

      {/* Filtres actifs */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Filtres :</span>
          {globalFilter && <button className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1" onClick={() => setGlobalFilter('')}>Recherche : « {globalFilter} » <X className="h-3 w-3" /></button>}
          {filters.map((f) => (
            <button key={f.id} className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1" onClick={() => setFilter(f.id, undefined)}>{chipLabel(f.id, f.value as FilterValue)} <X className="h-3 w-3" /></button>
          ))}
          <button className="ml-auto inline-flex items-center gap-1 text-primary" onClick={clearAll}><FilterX className="h-3.5 w-3.5" />Tout effacer</button>
        </div>
      )}

      {/* Tableau */}
      <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              {table.getHeaderGroups()[0].headers.map((h) => {
                const c = (h.column.columnDef.meta as any).grid as GridColumn<T>
                const sorted = h.column.getIsSorted()
                return (
                  <th key={h.id} className={cn('px-3 py-2.5 font-medium', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')} style={c.width ? { width: c.width } : undefined}>
                    {h.column.getCanSort() && c.header ? (
                      <button className={cn('inline-flex items-center gap-1 uppercase hover:text-foreground', sorted && 'text-foreground')} onClick={h.column.getToggleSortingHandler()} title="Trier (Maj+clic : tri multiple)">
                        {c.header}
                        {sorted === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : sorted === 'desc' ? <ArrowDown className="h-3 w-3 text-primary" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                        {prefs.sorting.length > 1 && sorted && <span className="text-[10px] text-primary">{h.column.getSortIndex() + 1}</span>}
                      </button>
                    ) : c.header}
                  </th>
                )
              })}
            </tr>
            <tr className="border-b bg-muted/30 normal-case">
              {visibleCols.map((c) => (
                <th key={c.id} className="px-2 py-1.5 font-normal">
                  <FilterCell col={c} value={filterOf(c.id)} onChange={(v) => setFilter(c.id, v)} options={enumOptions.get(c.id) ?? []} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={cn('border-b last:border-0 hover:bg-muted/50', onRowClick && 'cursor-pointer')} onClick={onRowClick ? () => onRowClick(row.original) : undefined}>
                {visibleCols.map((c) => (
                  <td key={c.id} className={cn('px-3 py-2.5', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}>
                    {c.cell ? c.cell(row.original) : defaultCell(c, row.original, optLabels)}
                  </td>
                ))}
              </tr>
            ))}
            {!table.getRowModel().rows.length && <tr><td colSpan={visibleCols.length} className="py-16 text-center text-muted-foreground">{activeCount ? 'Aucun résultat pour ces filtres.' : emptyText}</td></tr>}
          </tbody>
          {hasSummary && (
            <tfoot className="sticky bottom-0 bg-card">
              <tr className="border-t-2 bg-muted/40 font-semibold">
                {visibleCols.map((c, i) => (
                  <td key={c.id} className={cn('px-3 py-2.5', c.align === 'right' && 'text-right')}>
                    {sums[i] !== null ? (c.type === 'money' ? <span className="tnum">{formatMoney(sums[i]!)}</span> : <span className="tnum">{formatQty(sums[i]!)}</span>) : i === 0 ? <span className="text-xs uppercase tracking-wide text-muted-foreground">Total ({total} ligne{total > 1 ? 's' : ''})</span> : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pied : pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-sm text-muted-foreground">
        <span>{total ? `${first}–${last} sur ${total.toLocaleString('fr-FR')}` : '0 ligne'}{total !== data.length && ` (filtré sur ${data.length.toLocaleString('fr-FR')})`}</span>
        <div className="flex items-center gap-2">
          <span>Lignes par page</span>
          <select className="h-8 rounded border border-input bg-card px-2 text-sm" value={size} onChange={(e) => table.setPageSize(Number(e.target.value))}>
            {[10, 15, 25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={!table.getCanPreviousPage()} onClick={() => table.setPageIndex(0)}><ChevronsLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="tnum min-w-[5rem] text-center">Page {pageIndex + 1} / {Math.max(table.getPageCount(), 1)}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={!table.getCanNextPage()} onClick={() => table.setPageIndex(table.getPageCount() - 1)}><ChevronsRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </section>
  )
}
