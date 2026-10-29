import { useCallback, useEffect, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Coins, Percent, Receipt, ShoppingBasket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/utils'
import { PAY_LABELS, type PayMethod, type ReportData } from '@shared/types'

// Format local AAAA-MM-JJ (évite le décalage UTC de toISOString)
const iso = (d: Date) => d.toLocaleDateString('sv-SE')
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) }

const PRESETS = [
  { label: "Aujourd'hui", from: () => iso(new Date()) },
  { label: '7 jours', from: () => daysAgo(6) },
  { label: '30 jours', from: () => daysAgo(29) },
  { label: 'Ce mois', from: () => iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) }
]

// Palette catégorielle sobre, lisible en clair comme en sombre.
const COLORS = ['hsl(24 95% 53%)', 'hsl(226 70% 56%)', 'hsl(152 55% 42%)', 'hsl(280 55% 58%)', 'hsl(200 80% 48%)', 'hsl(340 70% 55%)', 'hsl(45 90% 50%)', 'hsl(190 20% 50%)']
const AXIS = { fontSize: 12, fill: 'hsl(var(--muted-foreground))' }
const tip = { contentStyle: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 13 } }
const fmt = (v: unknown) => formatMoney(Number(v))

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Coins; label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card p-5 shadow-soft">
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${tone}`}><Icon className="h-6 w-6" /></div>
      <div><div className="text-sm text-muted-foreground">{label}</div><div className="tnum text-2xl font-semibold">{value}</div></div>
    </div>
  )
}

const Card = ({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) => (
  <section className={`rounded-lg border bg-card p-5 shadow-soft ${className}`}>
    <h2 className="mb-4 font-semibold">{title}</h2>{children}
  </section>
)
const Empty = () => <div className="flex h-64 items-center justify-center text-muted-foreground">Aucune vente sur cette période.</div>

export default function RapportsPage() {
  const [from, setFrom] = useState(daysAgo(29))
  const [to, setTo] = useState(iso(new Date()))
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const r = await window.api.reports.get(from, to)
    if (r.ok) { setData(r.data); setError('') } else setError(r.error)
  }, [from, to])
  useEffect(() => { load() }, [load])

  const marginPct = data && data.revenue > 0 ? (data.grossMargin / data.revenue) * 100 : 0

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports</h1>
          <p className="text-muted-foreground">Ventes, marges et produits les plus vendus.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <Button key={p.label} variant="outline" size="sm" onClick={() => { setFrom(p.from()); setTo(iso(new Date())) }}>{p.label}</Button>
          ))}
          <Input type="date" className="h-8 w-40" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          <span className="text-muted-foreground">→</span>
          <Input type="date" className="h-8 w-40" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </div>
      </header>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {data && (
        <>
          <section className="grid grid-cols-4 gap-4">
            <Kpi icon={Coins} label="Chiffre d'affaires" value={formatMoney(data.revenue)} tone="bg-primary/10 text-primary" />
            <Kpi icon={Percent} label={`Marge brute (${marginPct.toFixed(1)} %)`} value={formatMoney(data.grossMargin)} tone="bg-success/12 text-success" />
            <Kpi icon={Receipt} label="Nombre de ventes" value={String(data.salesCount)} tone="bg-warning/15 text-warning" />
            <Kpi icon={ShoppingBasket} label="Panier moyen" value={formatMoney(data.avgBasket)} tone="bg-muted text-foreground" />
          </section>

          <Card title="Évolution du chiffre d'affaires">
            {data.daily.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.daily} margin={{ left: 8, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS[0]} stopOpacity={0.35} /><stop offset="100%" stopColor={COLORS[0]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" tick={AXIS} tickFormatter={(d: string) => d.slice(5)} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} width={70} />
                  <Tooltip {...tip} formatter={fmt} labelFormatter={(d) => `Jour : ${d}`} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" name="Chiffre d'affaires" stroke={COLORS[0]} strokeWidth={2.5} fill="url(#rev)" />
                  <Area type="monotone" dataKey="margin" name="Marge" stroke={COLORS[2]} strokeWidth={2} fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          <div className="grid grid-cols-2 gap-6">
            <Card title="Top articles (chiffre d'affaires)">
              {data.topArticles.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={data.topArticles} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="designation" tick={AXIS} width={150} axisLine={false} tickLine={false}
                      tickFormatter={(s: string) => (s.length > 22 ? s.slice(0, 21) + '…' : s)} />
                    <Tooltip {...tip} formatter={fmt} />
                    <Bar dataKey="total" name="Total" fill={COLORS[1]} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="Ventes par catégorie">
              {data.byCategory.length === 0 ? <Empty /> : (
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
          </div>

          <div className="grid grid-cols-[1fr_2fr] gap-6">
            <Card title="Modes de paiement">
              {data.byMethod.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={data.byMethod.map((d) => ({ ...d, name: PAY_LABELS[d.method as PayMethod] ?? d.method }))}
                      dataKey="total" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3} stroke="none">
                      {data.byMethod.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip {...tip} formatter={fmt} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="Situation (hors période)">
              <dl className="grid grid-cols-2 gap-6">
                <div><dt className="text-sm text-muted-foreground">Valeur du stock (prix d'achat)</dt><dd className="tnum mt-1 text-2xl font-semibold">{formatMoney(data.stockValue)}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Créances clients</dt><dd className="tnum mt-1 text-2xl font-semibold text-warning">{formatMoney(data.clientDebt)}</dd></div>
              </dl>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
