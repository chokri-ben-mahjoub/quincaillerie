import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'
import { cn, fmtDate, formatMoney, formatQty } from '@/lib/utils'
import { PAY_LABELS, type PayMethod, type ReportData, type TopArticlesBy } from '@shared/types'

// Format local AAAA-MM-JJ (évite le décalage UTC de toISOString)
const iso = (d: Date) => d.toLocaleDateString('sv-SE')
const shift = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }

type PeriodId = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'lastmonth' | 'year'
const PERIODS: { id: PeriodId; label: string; range: () => [string, string] }[] = [
  { id: 'today', label: 'Aujourd’hui', range: () => [iso(new Date()), iso(new Date())] },
  { id: 'yesterday', label: 'Hier', range: () => [shift(-1), shift(-1)] },
  { id: '7d', label: '7 jours', range: () => [shift(-6), iso(new Date())] },
  { id: '30d', label: '30 jours', range: () => [shift(-29), iso(new Date())] },
  { id: 'month', label: 'Ce mois', range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)] } },
  { id: 'lastmonth', label: 'Mois dernier', range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), iso(new Date(n.getFullYear(), n.getMonth(), 0))] } },
  { id: 'year', label: 'Cette année', range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), 0, 1)), iso(n)] } }
]

// ---------- Disposition personnalisable (enregistrée pour chaque utilisateur) ----------
type BlockId = 'kpis' | 'evolution' | 'top' | 'categories' | 'methods' | 'situation'
const BLOCK_LABELS: Record<BlockId, string> = {
  kpis: 'Indicateurs clés', evolution: 'Évolution du chiffre d’affaires', top: 'Meilleurs articles',
  categories: 'Ventes par catégorie', methods: 'Modes de paiement', situation: 'Stock et créances'
}
interface Layout {
  blocks: { id: BlockId; visible: boolean; wide: boolean }[]
  compare: boolean
  period: PeriodId
  evolution: { chart: 'area' | 'bar' | 'line'; group: 'day' | 'week' | 'month'; margin: boolean }
  top: { count: number; by: TopArticlesBy }
  categories: { chart: 'bar' | 'pie' }
  methods: { chart: 'pie' | 'bar' }
}
const DEFAULT_LAYOUT: Layout = {
  blocks: [
    { id: 'kpis', visible: true, wide: true }, { id: 'evolution', visible: true, wide: true },
    { id: 'top', visible: true, wide: false }, { id: 'categories', visible: true, wide: false },
    { id: 'methods', visible: true, wide: false }, { id: 'situation', visible: true, wide: false }
  ],
  compare: true, period: '30d',
  evolution: { chart: 'area', group: 'day', margin: true },
  top: { count: 8, by: 'total' },
  categories: { chart: 'bar' },
  methods: { chart: 'pie' }
}
/** Fusionne une disposition enregistrée avec les valeurs par défaut (blocs ajoutés ou retirés depuis). */
function mergeLayout(saved: Partial<Layout> | null): Layout {
  if (!saved) return DEFAULT_LAYOUT
  const known = (saved.blocks ?? []).filter((b) => b.id in BLOCK_LABELS)
  const missing = DEFAULT_LAYOUT.blocks.filter((d) => !known.some((b) => b.id === d.id))
  return {
    ...DEFAULT_LAYOUT, ...saved, blocks: [...known, ...missing],
    evolution: { ...DEFAULT_LAYOUT.evolution, ...saved.evolution }, top: { ...DEFAULT_LAYOUT.top, ...saved.top },
    categories: { ...DEFAULT_LAYOUT.categories, ...saved.categories }, methods: { ...DEFAULT_LAYOUT.methods, ...saved.methods }
  }
}

// Palette catégorielle sobre, lisible en clair comme en sombre.
const COLORS = ['hsl(24 95% 53%)', 'hsl(226 70% 56%)', 'hsl(152 55% 42%)', 'hsl(280 55% 58%)', 'hsl(200 80% 48%)', 'hsl(340 70% 55%)', 'hsl(45 90% 50%)', 'hsl(190 20% 50%)']
const AXIS = { fontSize: 12, fill: 'hsl(var(--muted-foreground))' }
const tip = { contentStyle: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 13 } }
const fmt = (v: unknown) => formatMoney(Number(v))
const TOP_BY_LABELS: Record<TopArticlesBy, string> = { total: 'chiffre d’affaires', quantity: 'quantité vendue', margin: 'marge' }

/** Regroupe les jours par semaine (lundi) ou par mois ; en mode jour, ajoute les jours sans vente à 0. */
function groupDaily(daily: ReportData['daily'], from: string, to: string, group: Layout['evolution']['group']) {
  const byDay = new Map(daily.map((d) => [d.day, d]))
  const out = new Map<string, { key: string; label: string; revenue: number; margin: number }>()
  const end = new Date(to + 'T00:00:00')
  for (let d = new Date(from + 'T00:00:00'), i = 0; d <= end && i < 1200; d.setDate(d.getDate() + 1), i++) {
    const day = iso(d)
    let key = day, label = `${day.slice(8)}/${day.slice(5, 7)}`
    if (group === 'week') {
      const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      key = iso(monday); label = `sem. ${key.slice(8)}/${key.slice(5, 7)}`
    } else if (group === 'month') {
      key = day.slice(0, 7); label = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
    }
    const row = out.get(key) ?? { key, label, revenue: 0, margin: 0 }
    row.revenue += byDay.get(day)?.revenue ?? 0
    row.margin += byDay.get(day)?.margin ?? 0
    out.set(key, row)
  }
  return [...out.values()]
}

function Delta({ now, before, show }: { now: number; before: number; show: boolean }) {
  if (!show) return null
  if (before === 0) return <span className="text-xs text-muted-foreground">{now === 0 ? 'stable' : 'nouveau'}</span>
  const pct = Math.round(((now - before) / Math.abs(before)) * 100)
  return (
    <span className={cn('tnum inline-flex items-center gap-0.5 text-xs font-semibold', pct >= 0 ? 'text-success' : 'text-destructive')}>
      {pct >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{Math.abs(pct)} %
      <span className="ml-1 font-normal text-muted-foreground">vs période précédente</span>
    </span>
  )
}

function Kpi({ label, value, delta, accent }: { label: string; value: string; delta?: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-lg border bg-card p-5 shadow-soft">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn('tnum mt-1 whitespace-nowrap text-2xl font-semibold tracking-tight', accent)}>{value}</div>
      {delta && <div className="mt-1.5 h-4">{delta}</div>}
    </div>
  )
}

const Card = ({ title, children, className = '' }: { title: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <section className={`rounded-lg border bg-card p-5 shadow-soft ${className}`}>
    <h2 className="mb-4 font-semibold">{title}</h2>{children}
  </section>
)
const Empty = () => <div className="flex h-64 items-center justify-center text-muted-foreground">Aucune vente sur cette période.</div>

export default function RapportsPage() {
  const [layout, setLayout] = useState<Layout | null>(null)
  const [from, setFrom] = useState(shift(-29))
  const [to, setTo] = useState(iso(new Date()))
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState('')
  const [customizing, setCustomizing] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

  // Disposition de l'utilisateur : lue une fois, puis enregistrée à chaque changement (regroupé sur 600 ms).
  useEffect(() => {
    window.api.profile.getPrefs<Partial<Layout>>('reports').then((r) => {
      const l = mergeLayout(r.ok ? r.data : null)
      setLayout(l)
      const [f, t] = (PERIODS.find((p) => p.id === l.period) ?? PERIODS[3]).range()
      setFrom(f); setTo(t)
    })
  }, [])
  const update = (patch: Partial<Layout>) => setLayout((l) => {
    const next = { ...l!, ...patch }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => window.api.profile.setPrefs('reports', next), 600)
    return next
  })

  const load = useCallback(async () => {
    if (!layout) return
    const r = await window.api.reports.get(from, to, { topCount: layout.top.count, topBy: layout.top.by })
    if (r.ok) { setData(r.data); setError('') } else setError(r.error)
  }, [from, to, layout?.top.count, layout?.top.by]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  const activePeriod = PERIODS.find((p) => { const [f, t] = p.range(); return f === from && t === to })?.id
  const series = useMemo(() => (data && layout ? groupDaily(data.daily, from, to, layout.evolution.group) : []), [data, from, to, layout?.evolution.group]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!layout) return null
  const marginPct = data && data.revenue > 0 ? (data.grossMargin / data.revenue) * 100 : 0
  const cmp = layout.compare && !!data
  const prevLabel = data ? `${fmtDate(data.previous.from)} au ${fmtDate(data.previous.to)}` : ''

  const blocks: Record<BlockId, () => React.ReactNode> = {
    kpis: () => data && (
      <div className="space-y-2">
        <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Kpi label="Chiffre d’affaires" value={formatMoney(data.revenue)} accent="text-primary" delta={cmp && <Delta show now={data.revenue} before={data.previous.revenue} />} />
          <Kpi label={`Marge brute (${marginPct.toFixed(1)} %)`} value={formatMoney(data.grossMargin)} delta={cmp && <Delta show now={data.grossMargin} before={data.previous.grossMargin} />} />
          <Kpi label="Nombre de ventes" value={String(data.salesCount)} delta={cmp && <Delta show now={data.salesCount} before={data.previous.salesCount} />} />
          <Kpi label="Panier moyen" value={formatMoney(data.avgBasket)} delta={cmp && <Delta show now={data.avgBasket} before={data.previous.avgBasket} />} />
        </section>
        {cmp && <p className="text-xs text-muted-foreground">Période précédente de même durée : du {prevLabel}, chiffre d’affaires {formatMoney(data.previous.revenue)}.</p>}
      </div>
    ),
    evolution: () => data && (
      <Card title={`Évolution du chiffre d’affaires, par ${({ day: 'jour', week: 'semaine', month: 'mois' })[layout.evolution.group]}`}>
        {data.daily.length === 0 ? <Empty /> : <EvolutionChart rows={series} chart={layout.evolution.chart} margin={layout.evolution.margin} />}
      </Card>
    ),
    top: () => data && (
      <Card title={`${layout.top.count} meilleurs articles, par ${TOP_BY_LABELS[layout.top.by]}`}>
        {data.topArticles.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={Math.max(220, data.topArticles.length * 34 + 30)}>
            <BarChart data={data.topArticles} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="designation" tick={AXIS} width={160} axisLine={false} tickLine={false}
                tickFormatter={(s: string) => (s.length > 24 ? s.slice(0, 23) + '…' : s)} />
              <Tooltip {...tip} formatter={(v, name) => (name === 'Quantité' ? formatQty(Number(v)) : formatMoney(Number(v)))} />
              <Bar dataKey={layout.top.by} name={({ total: 'Chiffre d’affaires', quantity: 'Quantité', margin: 'Marge' })[layout.top.by]}
                fill={layout.top.by === 'margin' ? COLORS[2] : COLORS[1]} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    ),
    categories: () => data && (
      <Card title="Ventes par catégorie">
        {data.byCategory.length === 0 ? <Empty /> : layout.categories.chart === 'pie'
          ? <Donut rows={data.byCategory.map((c) => ({ name: c.name, total: c.total }))} />
          : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data.byCategory} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} width={70} />
                <Tooltip {...tip} formatter={fmt} />
                <Bar dataKey="total" name="Total" radius={[6, 6, 0, 0]}>
                  {data.byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
      </Card>
    ),
    methods: () => data && (
      <Card title="Modes de paiement">
        {data.byMethod.length === 0 ? <Empty /> : (() => {
          const rows = data.byMethod.map((d) => ({ name: PAY_LABELS[d.method as PayMethod] ?? d.method, total: d.total }))
          return layout.methods.chart === 'pie' ? <Donut rows={rows} /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={AXIS} width={80} axisLine={false} tickLine={false} />
                <Tooltip {...tip} formatter={fmt} />
                <Bar dataKey="total" name="Total" radius={[0, 6, 6, 0]}>{rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          )
        })()}
      </Card>
    ),
    situation: () => data && (
      <Card title="Stock et créances (à ce jour)">
        <dl className="grid grid-cols-2 gap-6">
          <div><dt className="text-sm text-muted-foreground">Valeur du stock (prix d’achat)</dt><dd className="tnum mt-1 text-2xl font-semibold">{formatMoney(data.stockValue)}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Créances clients</dt><dd className="tnum mt-1 text-2xl font-semibold text-warning">{formatMoney(data.clientDebt)}</dd></div>
        </dl>
      </Card>
    )
  }

  const visible = layout.blocks.filter((b) => b.visible)

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports</h1>
          <p className="text-muted-foreground">Ventes, marges et produits les plus vendus.</p>
        </div>
        <Button variant="outline" onClick={() => setCustomizing(true)}><SlidersHorizontal className="h-4 w-4" />Personnaliser</Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => { const [f, t] = p.range(); setFrom(f); setTo(t) }}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium', activePeriod === p.id ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="Du" className="h-9 w-40" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          <span className="text-muted-foreground">au</span>
          <Input type="date" aria-label="Au" className="h-9 w-40" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </div>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">Tous les blocs sont masqués. Utilisez « Personnaliser » pour en afficher.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {visible.map((b) => <div key={b.id} className={cn('min-w-0', b.wide && 'lg:col-span-2')}>{blocks[b.id]()}</div>)}
        </div>
      )}

      <CustomizePanel open={customizing} onClose={() => setCustomizing(false)} layout={layout} update={update}
        onReset={() => update({ ...DEFAULT_LAYOUT })} />
    </div>
  )
}

function EvolutionChart({ rows, chart, margin }: { rows: ReturnType<typeof groupDaily>; chart: Layout['evolution']['chart']; margin: boolean }) {
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
      <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} minTickGap={16} />
      <YAxis tick={AXIS} axisLine={false} tickLine={false} width={70} />
      <Tooltip {...tip} formatter={fmt} />
      <Legend />
    </>
  )
  return (
    <ResponsiveContainer width="100%" height={300}>
      {chart === 'bar' ? (
        <BarChart data={rows} margin={{ left: 8, right: 8, top: 8 }}>
          {common}
          <Bar dataKey="revenue" name="Chiffre d’affaires" fill={COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={36} />
          {margin && <Bar dataKey="margin" name="Marge" fill={COLORS[2]} radius={[4, 4, 0, 0]} maxBarSize={36} />}
        </BarChart>
      ) : chart === 'line' ? (
        <LineChart data={rows} margin={{ left: 8, right: 8, top: 8 }}>
          {common}
          <Line type="monotone" dataKey="revenue" name="Chiffre d’affaires" stroke={COLORS[0]} strokeWidth={2.5} dot={rows.length < 40} />
          {margin && <Line type="monotone" dataKey="margin" name="Marge" stroke={COLORS[2]} strokeWidth={2} dot={false} />}
        </LineChart>
      ) : (
        <AreaChart data={rows} margin={{ left: 8, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS[0]} stopOpacity={0.35} /><stop offset="100%" stopColor={COLORS[0]} stopOpacity={0} />
            </linearGradient>
          </defs>
          {common}
          <Area type="monotone" dataKey="revenue" name="Chiffre d’affaires" stroke={COLORS[0]} strokeWidth={2.5} fill="url(#rev)" />
          {margin && <Area type="monotone" dataKey="margin" name="Marge" stroke={COLORS[2]} strokeWidth={2} fill="none" />}
        </AreaChart>
      )}
    </ResponsiveContainer>
  )
}

function Donut({ rows }: { rows: { name: string; total: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={rows} dataKey="total" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3} stroke="none">
          {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip {...tip} formatter={fmt} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ---------- Panneau « Personnaliser » : les changements s'appliquent en direct ----------
function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md bg-muted p-0.5">
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn('rounded px-2.5 py-1 text-xs font-medium', value === v ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          {l}
        </button>
      ))}
    </div>
  )
}

function CustomizePanel({ open, onClose, layout, update, onReset }: {
  open: boolean; onClose: () => void; layout: Layout; update: (p: Partial<Layout>) => void; onReset: () => void
}) {
  const setBlock = (i: number, patch: Partial<Layout['blocks'][number]>) =>
    update({ blocks: layout.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) })
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= layout.blocks.length) return
    const blocks = [...layout.blocks];
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]]
    update({ blocks })
  }

  const options: Partial<Record<BlockId, React.ReactNode>> = {
    evolution: (
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Graphique" value={layout.evolution.chart} onChange={(chart) => update({ evolution: { ...layout.evolution, chart } })}
          options={[['area', 'Aire'], ['bar', 'Barres'], ['line', 'Courbe']]} />
        <Segmented label="Regroupement" value={layout.evolution.group} onChange={(group) => update({ evolution: { ...layout.evolution, group } })}
          options={[['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']]} />
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" className="accent-[hsl(var(--primary))]" checked={layout.evolution.margin}
            onChange={(e) => update({ evolution: { ...layout.evolution, margin: e.target.checked } })} />Afficher la marge
        </label>
      </div>
    ),
    top: (
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Nombre d’articles" className="h-8 w-28 text-xs" value={layout.top.count} onChange={(e) => update({ top: { ...layout.top, count: Number(e.target.value) } })}>
          {[5, 8, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n} articles</option>)}
        </Select>
        <Segmented label="Classer par" value={layout.top.by} onChange={(by) => update({ top: { ...layout.top, by } })}
          options={[['total', 'CA'], ['quantity', 'Quantité'], ['margin', 'Marge']]} />
      </div>
    ),
    categories: (
      <Segmented label="Graphique" value={layout.categories.chart} onChange={(chart) => update({ categories: { chart } })}
        options={[['bar', 'Barres'], ['pie', 'Anneau']]} />
    ),
    methods: (
      <Segmented label="Graphique" value={layout.methods.chart} onChange={(chart) => update({ methods: { chart } })}
        options={[['pie', 'Anneau'], ['bar', 'Barres']]} />
    )
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20" />
        <DialogPrimitive.Content aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-card shadow-soft">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <DialogPrimitive.Title className="text-lg font-semibold">Personnaliser les rapports</DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Fermer"><X className="h-4 w-4" /></DialogPrimitive.Close>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Général</h3>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 accent-[hsl(var(--primary))]" checked={layout.compare} onChange={(e) => update({ compare: e.target.checked })} />
                <span>Comparer avec la période précédente<span className="block text-xs text-muted-foreground">Flèches d’évolution sur les indicateurs clés.</span></span>
              </label>
              <div>
                <Label htmlFor="rp-period">Période à l’ouverture</Label>
                <Select id="rp-period" value={layout.period} onChange={(e) => update({ period: e.target.value as PeriodId })}>
                  {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Select>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Blocs, ordre et largeur</h3>
              <ul className="space-y-2">
                {layout.blocks.map((b, i) => (
                  <li key={b.id} className={cn('rounded-lg border p-3', !b.visible && 'bg-muted/50')}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setBlock(i, { visible: !b.visible })} title={b.visible ? 'Masquer' : 'Afficher'}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                        {b.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                      <span className={cn('flex-1 text-sm font-medium', !b.visible && 'text-muted-foreground')}>{BLOCK_LABELS[b.id]}</span>
                      {b.visible && b.id !== 'kpis' && (
                        <Segmented label="Largeur" value={b.wide ? 'wide' : 'half'} onChange={(v) => setBlock(i, { wide: v === 'wide' })}
                          options={[['half', 'Demi'], ['wide', 'Pleine']]} />
                      )}
                      <button onClick={() => move(i, -1)} disabled={i === 0} title="Monter" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                      <button onClick={() => move(i, 1)} disabled={i === layout.blocks.length - 1} title="Descendre" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                    </div>
                    {b.visible && options[b.id] && <div className="mt-2 pl-8">{options[b.id]}</div>}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="flex items-center justify-between border-t px-5 py-3">
            <Button variant="ghost" size="sm" onClick={onReset}><RotateCcw className="h-4 w-4" />Disposition d’origine</Button>
            <span className="text-xs text-muted-foreground">Enregistré automatiquement</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
