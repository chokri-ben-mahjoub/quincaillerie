import { useCallback, useEffect, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CheckCircle2, ChevronRight, RefreshCw, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatMoney } from '@/lib/utils'
import type { PageId } from '@/components/Sidebar'
import { PAY_LABELS, type User } from '@shared/types'
import type { DashboardData } from '@shared/dashboard'

const ORANGE = 'hsl(24 95% 53%)'
const SLATE = 'hsl(220 10% 60%)'
const AXIS = { fontSize: 12, fill: 'hsl(var(--muted-foreground))' }
const REFRESH_MS = 60_000

type Tone = 'danger' | 'warning' | 'neutral'
interface Todo { key: string; tone: Tone; text: string; detail?: string; page: PageId }

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** Ce qui demande une action aujourd'hui, du plus urgent au moins urgent. */
function todos(d: DashboardData): Todo[] {
  const t: Todo[] = []
  if (d.stock?.out) t.push({ key: 'out', tone: 'danger', page: 'stock', text: `${plural(d.stock.out, 'article', 'articles')} en rupture`,
    detail: d.stock.items.filter((i) => i.stock <= 0).slice(0, 3).map((i) => i.designation).join(', ') })
  if (d.invoices?.overdueCount) t.push({ key: 'late', tone: 'danger', page: 'factures',
    text: `${plural(d.invoices.overdueCount, 'facture en retard', 'factures en retard')} de paiement`, detail: `${formatMoney(d.invoices.overdueTotal)} à relancer` })
  if (d.lots?.expired) t.push({ key: 'expired', tone: 'danger', page: 'tracabilite', text: `${plural(d.lots.expired, 'lot périmé', 'lots périmés')} encore en stock` })
  if (d.stock?.low) t.push({ key: 'low', tone: 'warning', page: 'stock', text: `${plural(d.stock.low, 'article', 'articles')} sous le seuil de réapprovisionnement` })
  if (d.lots?.soon) t.push({ key: 'soon', tone: 'warning', page: 'tracabilite', text: `${plural(d.lots.soon, 'lot périme', 'lots périment')} dans les 60 jours` })
  if (d.lots?.pending) t.push({ key: 'pending', tone: 'warning', page: 'tracabilite', text: `${plural(d.lots.pending, 'réception', 'réceptions')} à identifier (lots ou n° de série)` })
  const notLate = (d.invoices?.unpaidCount ?? 0) - (d.invoices?.overdueCount ?? 0)
  if (d.invoices && notLate > 0) t.push({ key: 'unpaid', tone: 'neutral', page: 'factures', text: `${plural(notLate, 'facture', 'factures')} à encaisser`,
    detail: formatMoney(d.invoices.unpaidTotal - d.invoices.overdueTotal) })
  if (d.clients?.debtorCount) t.push({ key: 'debt', tone: 'neutral', page: 'clients',
    text: `${plural(d.clients.debtorCount, 'client vous doit', 'clients vous doivent')} de l’argent`, detail: `${formatMoney(d.clients.debtTotal)} au total` })
  return t
}

const DOT: Record<Tone, string> = { danger: 'bg-destructive', warning: 'bg-warning', neutral: 'bg-muted-foreground/40' }

export default function AccueilPage({ user, onNavigate }: { user: User; onNavigate: (p: PageId) => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await window.api.dashboard.today()
    setLoading(false)
    if (r.ok) { setData(r.data); setUpdatedAt(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })) }
  }, [])
  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS) // la page reste à jour si elle reste ouverte au comptoir
    return () => clearInterval(t)
  }, [load])

  const firstName = user.fullName.trim().split(/\s+/)[0]
  const hour = new Date().getHours()
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const list = data ? todos(data) : []
  const hasTodoSources = !!data && (data.stock || data.invoices || data.clients || data.lots)

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{hour < 18 ? 'Bonjour' : 'Bonsoir'} {firstName}</h1>
          <p className="text-muted-foreground first-letter:uppercase">{date}</p>
        </div>
        <button onClick={load} title="Actualiser" className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />{updatedAt && `Mis à jour à ${updatedAt}`}
        </button>
      </header>

      {data && (
        <div className={cn('grid gap-6', data.sales && hasTodoSources && 'xl:grid-cols-[minmax(0,1.7fr)_minmax(22rem,1fr)]')}>
          {data.sales && <SalesBlock s={data.sales} onNavigate={onNavigate} />}
          {hasTodoSources && (
            <section className="rounded-lg border bg-card p-6">
              <h2 className="font-semibold">À faire</h2>
              {list.length === 0 ? (
                <p className="mt-6 flex items-center gap-3 text-muted-foreground"><CheckCircle2 className="h-5 w-5 text-success" />Rien d’urgent : tout est à jour.</p>
              ) : (
                <ul className="-mx-3 mt-3 divide-y">
                  {list.map((t) => (
                    <li key={t.key}>
                      <button onClick={() => onNavigate(t.page)}
                        className="group flex w-full items-start gap-3 rounded-md px-3 py-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', DOT[t.tone])} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{t.text}</span>
                          {t.detail && <span className="block truncate text-sm text-muted-foreground">{t.detail}</span>}
                        </span>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      {data && data.sales && <RecentBlock s={data.sales} onNavigate={onNavigate} />}

      {data && !data.sales && !hasTodoSources && (
        <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">Utilisez le menu à gauche ou Ctrl+K pour ouvrir un écran.</p>
      )}
    </div>
  )
}

function SalesBlock({ s, onNavigate }: { s: NonNullable<DashboardData['sales']>; onNavigate: (p: PageId) => void }) {
  const diff = s.yesterdaySameTime > 0 ? Math.round(((s.total - s.yesterdaySameTime) / s.yesterdaySameTime) * 100) : null
  return (
    <section className="rounded-lg border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Ventes du jour</h2>
          <p className="tnum mt-3 text-4xl font-semibold tracking-tight">{formatMoney(s.total)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {diff !== null
              ? <><span className={cn('font-semibold', diff >= 0 ? 'text-success' : 'text-destructive')}>{diff >= 0 ? '+' : ''}{diff} %</span> par rapport à hier à la même heure ({formatMoney(s.yesterdaySameTime)})</>
              : 'Aucune vente hier à la même heure.'}
          </p>
        </div>
        <Button variant="outline" onClick={() => onNavigate('caisse')}><ShoppingCart className="h-4 w-4" />Ouvrir la caisse</Button>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-5 text-sm sm:grid-cols-4">
        <Stat label="Ventes" value={String(s.count)} hint={s.cancelledCount ? `${s.cancelledCount} annulée${s.cancelledCount > 1 ? 's' : ''}` : undefined} />
        <Stat label="Panier moyen" value={formatMoney(s.avgBasket)} />
        {s.margin !== null && <Stat label="Marge" value={formatMoney(s.margin)} />}
        <Stat label="Reste dû (crédit)" value={formatMoney(s.creditToday)} />
      </dl>

      <div className="mt-6">
        <div className="mb-2 flex gap-5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: ORANGE }} />Aujourd’hui</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: SLATE }} />Hier</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={s.byHour} margin={{ left: 0, right: 8, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="hour" tick={AXIS} tickFormatter={(h: number) => `${h} h`} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={56} />
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} labelFormatter={(h) => `${h} h – ${Number(h) + 1} h`} formatter={(v) => formatMoney(Number(v))}
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 13 }} />
            <Bar dataKey="today" name="Aujourd’hui" fill={ORANGE} radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Line dataKey="yesterday" name="Hier" stroke={SLATE} strokeDasharray="4 4" strokeWidth={2} dot={false} type="monotone" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tnum mt-0.5 text-base font-semibold">{value}{hint && <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span>}</dd>
    </div>
  )
}

function RecentBlock({ s, onNavigate }: { s: NonNullable<DashboardData['sales']>; onNavigate: (p: PageId) => void }) {
  const max = Math.max(1, ...s.byMethod.map((m) => m.total))
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(22rem,1fr)]">
      <section className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Dernières ventes</h2>
          <button onClick={() => onNavigate('caisse')} className="text-sm text-primary hover:underline">Toutes les ventes</button>
        </div>
        {s.last.length === 0 ? (
          <p className="mt-6 text-muted-foreground">Aucune vente pour l’instant aujourd’hui.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <tbody className="divide-y">
              {s.last.map((v) => (
                <tr key={v.id} className={cn(v.cancelled && 'text-muted-foreground line-through')}>
                  <td className="tnum w-16 py-2.5 text-muted-foreground">{v.time}</td>
                  <td className="py-2.5 font-medium">{v.clientName ?? 'Client de passage'}</td>
                  <td className="py-2.5 text-muted-foreground">{PAY_LABELS[v.method]}</td>
                  <td className="tnum py-2.5 text-right font-semibold">{v.cancelled ? 'Annulée' : formatMoney(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="rounded-lg border bg-card p-6">
        <h2 className="font-semibold">Encaissé par mode de paiement</h2>
        {s.byMethod.length === 0 ? (
          <p className="mt-6 text-muted-foreground">Rien d’encaissé pour l’instant.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {s.byMethod.map((m) => (
              <li key={m.method}>
                <div className="flex justify-between text-sm"><span>{PAY_LABELS[m.method]}</span><span className="tnum font-semibold">{formatMoney(m.total)}</span></div>
                <div className="mt-1.5 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full" style={{ width: `${(m.total / max) * 100}%`, background: m.method === 'credit' ? SLATE : ORANGE }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
