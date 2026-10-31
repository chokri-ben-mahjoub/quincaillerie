import { useEffect, useMemo, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { CornerDownLeft, FileText, Package, Search, User as UserIcon } from 'lucide-react'
import { NAV, type PageId } from '@/components/Sidebar'
import { setSearchIntent } from '@/lib/searchIntent'
import { cn, formatMoney, formatQty, norm } from '@/lib/utils'
import type { Article, Client } from '@shared/types'
import type { InvoiceSummary } from '@shared/invoice'

/** Une ligne de résultat : où elle mène et, pour les données, la recherche à appliquer à l'arrivée. */
interface Hit {
  key: string
  section: 'Pages' | 'Articles' | 'Clients' | 'Factures'
  icon: React.ComponentType<{ className?: string }>
  title: string
  detail?: string
  page: PageId
  gridId?: string
  query?: string
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  pages: readonly (typeof NAV)[number][] // pages autorisées
  onGo: (p: PageId) => void
}

const PER_SECTION = 5

export function CommandPalette({ open, onOpenChange, pages, onGo }: Props) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [articles, setArticles] = useState<Article[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const can = (id: PageId) => pages.some((p) => p.id === id)

  // Données rechargées à chaque ouverture (seulement celles auxquelles l'utilisateur a droit).
  useEffect(() => {
    if (!open) return
    setQ(''); setActive(0)
    if (can('articles')) window.api.articles.list().then((r) => r.ok && setArticles(r.data))
    if (can('clients')) window.api.clients.list().then((r) => r.ok && setClients(r.data))
    if (can('factures')) window.api.invoices.list().then((r) => r.ok && setInvoices(r.data))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const hits = useMemo<Hit[]>(() => {
    const tokens = norm(q).split(/\s+/).filter(Boolean)
    const match = (text: string) => { const t = norm(text); return tokens.every((k) => t.includes(k)) }
    // Une page correspond seulement par le début de ses mots (« vis » ne doit pas trouver « Devis »).
    const words = (t: string) => norm(t).split(/[\s’']+/)
    const pageHits: Hit[] = pages.filter((p) => tokens.every((k) => words(`${p.label} ${p.group}`).some((w) => w.startsWith(k))))
      .map((p) => ({ key: `p-${p.id}`, section: 'Pages', icon: p.icon, title: p.label, detail: p.group || undefined, page: p.id }))
    if (!tokens.length) return pageHits
    const raw = q.trim().toLowerCase()
    const articleHits: Hit[] = articles
      .filter((a) => a.barcode.toLowerCase() === raw || match(`${a.designation} ${a.barcode} ${a.categoryName ?? ''}`))
      .sort((x, y) => Number(y.barcode.toLowerCase() === raw) - Number(x.barcode.toLowerCase() === raw))
      .slice(0, PER_SECTION)
      .map((a) => ({ key: `a-${a.id}`, section: 'Articles', icon: Package, title: a.designation,
        detail: `${a.barcode}   Stock ${formatQty(a.stock)} ${a.unit}   ${formatMoney(a.salePrice)}`, page: 'articles', gridId: 'articles', query: a.barcode }))
    const clientHits: Hit[] = clients.filter((c) => match(`${c.name} ${c.phone ?? ''} ${c.address ?? ''}`)).slice(0, PER_SECTION)
      .map((c) => ({ key: `c-${c.id}`, section: 'Clients', icon: UserIcon, title: c.name,
        detail: [c.phone, c.balance > 0 ? `doit ${formatMoney(c.balance)}` : null].filter(Boolean).join('   ') || undefined,
        page: 'clients', gridId: 'clients', query: c.name }))
    const invoiceHits: Hit[] = invoices.filter((i) => match(`${i.number ?? 'brouillon'} ${i.clientName}`)).slice(0, PER_SECTION)
      .map((i) => ({ key: `f-${i.id}`, section: 'Factures', icon: FileText, title: i.number ?? 'Facture en brouillon',
        detail: `${i.clientName}   ${formatMoney(i.totalTtc)}`, page: 'factures', gridId: 'documents-facture', query: i.number ?? i.clientName }))
    return [...pageHits.slice(0, PER_SECTION), ...articleHits, ...clientHits, ...invoiceHits]
  }, [q, pages, articles, clients, invoices])

  useEffect(() => setActive(0), [q])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function go(h: Hit) {
    if (h.gridId && h.query) setSearchIntent(h.gridId, h.query)
    onOpenChange(false)
    onGo(h.page)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!hits.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % hits.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + hits.length) % hits.length) }
    else if (e.key === 'Enter') { e.preventDefault(); go(hits[active]) }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <DialogPrimitive.Content aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border bg-card shadow-soft">
          <DialogPrimitive.Title className="sr-only">Recherche rapide</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
              placeholder="Article, code-barres, client, n° de facture, page…" spellCheck={false}
              role="combobox" aria-expanded aria-controls="palette-results" aria-activedescendant={hits[active] ? `palette-${hits[active].key}` : undefined}
              className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" />
          </div>
          <div ref={listRef} id="palette-results" role="listbox" className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
            {hits.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">Aucun résultat pour « {q.trim()} ».</p>
            )}
            {hits.map((h, i) => (
              <div key={h.key}>
                {(i === 0 || hits[i - 1].section !== h.section) && (
                  <div className={cn('px-3 pb-1 text-xs font-medium text-muted-foreground', i > 0 && 'mt-2 pt-2')}>{h.section}</div>
                )}
                <button id={`palette-${h.key}`} data-index={i} role="option" aria-selected={i === active}
                  onMouseMove={() => setActive(i)} onClick={() => go(h)}
                  className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-left', i === active && 'bg-muted')}>
                  <h.icon className={cn('h-4 w-4 shrink-0', i === active ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{h.title}</span>
                    {h.detail && <span className="tnum block truncate whitespace-pre text-xs text-muted-foreground">{h.detail}</span>}
                  </span>
                  {i === active && <CornerDownLeft className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
            <span><kbd className="rounded bg-muted px-1">↑</kbd> <kbd className="rounded bg-muted px-1">↓</kbd> pour choisir</span>
            <span><kbd className="rounded bg-muted px-1">Entrée</kbd> pour ouvrir</span>
            <span><kbd className="rounded bg-muted px-1">Échap</kbd> pour fermer</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
