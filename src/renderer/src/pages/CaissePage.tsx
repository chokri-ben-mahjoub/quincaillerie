import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CashSessionBar } from '@/components/CashSession'
import {
  Banknote, Check, CreditCard, Download, Eye, FileText, History, Minus, Pencil, Plus, Printer, ScanBarcode, Search, Trash2, UserRound, Users, X
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { CreditMeter } from '@/components/CreditMeter'
import ClientStatementDialog from '@/components/ClientStatementDialog'
import { cn, formatMoney, formatQty } from '@/lib/utils'
import { useAppConfig } from '@/lib/useAppConfig'
import { PAY_LABELS, type Article, type Client, type PayMethod, type Receipt, type SaleSummary } from '@shared/types'

// ---------- Ventes en parallèle ----------
// Chaque vente en cours est un « brouillon » : on peut en laisser plusieurs ouvertes, passer de l'une à l'autre,
// et revenir à une vente déjà encaissée pour la corriger. Les brouillons sont conservés si on quitte l'écran.
interface Draft {
  id: string
  num: number // numéro d'onglet : « Vente 3 »
  lines: { articleId: number; quantity: number }[]
  clientId: number | null
  discount: number
  method: PayMethod
  received: number
  /** Renseigné quand on corrige une vente déjà encaissée : l'ancienne est remplacée à l'encaissement. */
  editing: { saleId: number; number: string; clientId: number | null; due: number; origQty: Record<number, number>; priceChanged: boolean } | null
}

const STORE_KEY = 'caisse_drafts_v1'
const uid = () => Math.random().toString(36).slice(2, 9)
const newDraft = (num: number, method: PayMethod): Draft => ({ id: uid(), num, lines: [], clientId: null, discount: 0, method, received: 0, editing: null })

function readStore(): { drafts: Draft[]; activeId: string } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null')
    if (raw && Array.isArray(raw.drafts) && raw.drafts.length) return raw
  } catch { /* stockage indisponible : on repart d'une vente vide */ }
  return null
}

const METHOD_ICONS = { especes: Banknote, carte: CreditCard, cheque: FileText, credit: Users }

const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{children}</kbd>
)

export default function CaissePage() {
  const cfg = useAppConfig()
  const [articles, setArticles] = useState<Article[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [drafts, setDrafts] = useState<Draft[]>(() => readStore()?.drafts ?? [newDraft(1, 'especes')])
  const [activeId, setActiveId] = useState<string>(() => readStore()?.activeId ?? '')
  const [scan, setScan] = useState('')
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [recentOpen, setRecentOpen] = useState(false)
  const [statementFor, setStatementFor] = useState<number | null>(null)
  const [clientQuery, setClientQuery] = useState('')

  const scanRef = useRef<HTMLInputElement>(null)
  const discountRef = useRef<HTMLInputElement>(null)
  const receivedRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const [a, c] = await Promise.all([window.api.articles.list(), window.api.clients.list()])
    if (a.ok) setArticles(a.data)
    if (c.ok) setClients(c.data)
  }, [])
  useEffect(() => { load(); scanRef.current?.focus() }, [load])

  const draft = drafts.find((d) => d.id === activeId) ?? drafts[0]
  useEffect(() => { if (draft && draft.id !== activeId) setActiveId(draft.id) }, [draft, activeId])
  // Les brouillons survivent à un changement d'écran ou à un redémarrage.
  useEffect(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ drafts, activeId: draft?.id })) } catch { /* ignoré */ } }, [drafts, draft?.id])
  // Une vente vierge adopte le mode de paiement par défaut des paramètres (chargés après l'affichage).
  useEffect(() => {
    setDrafts((ds) => ds.map((d) => (!d.lines.length && !d.editing && d.method !== cfg.defaultMethod ? { ...d, method: cfg.defaultMethod as PayMethod } : d)))
  }, [cfg.defaultMethod])

  const patch = (p: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.id === draft.id ? { ...d, ...p } : d)))
  const articleById = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles])
  const byBarcode = useMemo(() => new Map(articles.map((a) => [a.barcode, a])), [articles])
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])

  // Panier de la vente active : les articles supprimés du catalogue entre-temps sont ignorés.
  const cart = draft.lines.flatMap((l) => { const a = articleById.get(l.articleId); return a ? [{ article: a, quantity: l.quantity }] : [] })
  // En modification, le stock disponible compte les quantités de l'ancienne vente (rendues à l'enregistrement).
  const available = (a: Article) => a.stock + (draft.editing?.origQty[a.id] ?? 0)

  const suggestions = scan.trim().length >= 2 && !byBarcode.has(scan.trim())
    ? articles.filter((a) => a.designation.toLowerCase().includes(scan.toLowerCase())).slice(0, 6) : []
  const subtotal = cart.reduce((s, l) => s + l.quantity * l.article.salePrice, 0)
  const total = Math.max(subtotal - draft.discount, 0)
  const method = draft.method
  const received = draft.received
  const change = method === 'especes' ? received - total : 0
  const client = draft.clientId ? clientById.get(draft.clientId) : undefined
  const creditDue = Math.max(total - received, 0)
  // Dette de référence : celle du client, sans la part de la vente qu'on est en train de remplacer.
  const baseBalance = client ? client.balance - (draft.editing && draft.editing.clientId === client.id ? draft.editing.due : 0) : 0
  const creditOk = !!client && received <= total + 0.0005 && baseBalance + creditDue <= client.creditLimit + 0.0005
  const canPay = cart.length > 0 && (method === 'especes' ? received >= total - 0.0005 : method === 'credit' ? creditOk : true)

  // ----- Panier -----
  function addArticle(a: Article) {
    setError('')
    setDrafts((ds) => ds.map((d) => {
      if (d.id !== draft.id) return d
      const i = d.lines.findIndex((l) => l.articleId === a.id)
      return { ...d, lines: i >= 0 ? d.lines.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l)) : [...d.lines, { articleId: a.id, quantity: 1 }] }
    }))
    setScan('')
    scanRef.current?.focus()
  }
  function onScanEnter() { // un scanner « tape » le code puis Entrée
    const code = scan.trim()
    if (!code) return
    const found = byBarcode.get(code) ?? suggestions[0]
    if (found) addArticle(found)
    else { setError(`Aucun article pour « ${code} ».`); setScan('') }
  }
  const setQty = (id: number, q: number) => patch({ lines: draft.lines.map((l) => (l.articleId === id ? { ...l, quantity: Math.max(q, 0.001) } : l)) })
  const removeLine = (id: number) => patch({ lines: draft.lines.filter((l) => l.articleId !== id) })

  // ----- Onglets (ventes en parallèle) -----
  function newSale() {
    const d = newDraft(Math.max(0, ...drafts.map((x) => x.num)) + 1, cfg.defaultMethod as PayMethod)
    setDrafts((ds) => [...ds, d]); setActiveId(d.id); setError(''); setScan('')
    setTimeout(() => scanRef.current?.focus(), 0)
  }
  function closeSale(id: string) {
    const d = drafts.find((x) => x.id === id)!
    if ((d.lines.length || d.editing) && !confirm(d.editing ? 'Abandonner la modification de cette vente ?' : 'Fermer cette vente en cours ? Son panier sera perdu.')) return
    const rest = drafts.filter((x) => x.id !== id)
    const next = rest.length ? rest : [newDraft(Math.max(0, ...drafts.map((x) => x.num)) + 1, cfg.defaultMethod as PayMethod)]
    setDrafts(next)
    if (id === draft.id) setActiveId(next[next.length - 1].id)
  }
  const resetSale = () => { patch({ lines: [], discount: 0, received: 0, clientId: null, method: cfg.defaultMethod as PayMethod, editing: null }); setError(''); setScan(''); scanRef.current?.focus() }

  // ----- Encaissement -----
  async function pay() {
    if (!canPay) return
    const res = await window.api.sales.create({
      clientId: draft.clientId, replaces: draft.editing?.saleId,
      items: cart.map((l) => ({ articleId: l.article.id, quantity: l.quantity })),
      discount: draft.discount, method, received: method === 'especes' || method === 'credit' ? received : total
    })
    if (!res.ok) return setError(res.error)
    setReceipt(res.data)
    if (cfg.autoPrintTicket) window.api.tickets.print(res.data.id, res.data.received) // Paramètres > Impression
    // La vente encaissée disparaît des onglets ; les autres ventes en cours restent ouvertes.
    const rest = drafts.filter((d) => d.id !== draft.id)
    const next = rest.length ? rest : [newDraft(Math.max(0, ...drafts.map((x) => x.num)) + 1, cfg.defaultMethod as PayMethod)]
    setDrafts(next); setActiveId(next[next.length - 1].id); setError(''); setClientQuery('')
    load() // rafraîchit stocks et dettes
  }

  // ----- Retour sur une vente déjà encaissée : on la recharge dans un onglet pour la corriger -----
  async function editSale(saleId: number) {
    const existing = drafts.find((d) => d.editing?.saleId === saleId)
    if (existing) { setActiveId(existing.id); setReceipt(null); setRecentOpen(false); return }
    const r = await window.api.sales.get(saleId)
    if (!r.ok) return setError(r.error)
    const s = r.data
    if (!s.editable) return setError(s.status === 'annulee' ? 'Cette vente est annulée.' : 'Vous ne pouvez plus modifier cette vente (délai dépassé ou droit désactivé).')
    const origQty: Record<number, number> = {}
    s.lines.forEach((l) => { origQty[l.articleId] = (origQty[l.articleId] ?? 0) + l.quantity })
    const priceChanged = s.lines.some((l) => { const a = articleById.get(l.articleId); return !!a && Math.abs(a.salePrice - l.unitPrice) > 0.0005 })
    const d: Draft = {
      id: uid(), num: Math.max(0, ...drafts.map((x) => x.num)) + 1,
      lines: s.lines.map((l) => ({ articleId: l.articleId, quantity: l.quantity })), clientId: s.clientId, discount: s.discount, method: s.method,
      received: s.method === 'credit' ? s.paid : s.total,
      editing: { saleId, number: s.number, clientId: s.clientId, due: s.due, origQty, priceChanged }
    }
    setDrafts((ds) => [...ds.filter((x) => x.lines.length > 0 || x.editing), d]) // les ventes vides inutilisées laissent la place
    setActiveId(d.id); setReceipt(null); setRecentOpen(false); setError('')
    setTimeout(() => scanRef.current?.focus(), 0)
  }

  // ----- Raccourcis clavier -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (receipt || recentOpen || statementFor !== null) return
      if (e.altKey && /^[1-9]$/.test(e.key)) { const d = drafts[Number(e.key) - 1]; if (d) { e.preventDefault(); setActiveId(d.id) } return }
      const map: Record<string, () => void> = {
        F2: () => scanRef.current?.focus(), F3: newSale, F4: () => setRecentOpen(true),
        F6: () => discountRef.current?.select(), F7: () => receivedRef.current?.select(), F9: pay, F10: resetSale
      }
      if (map[e.key]) { e.preventDefault(); map[e.key]() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const clientMatches = clientQuery.trim().length >= 1
    ? clients.filter((c) => (c.name + ' ' + (c.phone ?? '')).toLowerCase().includes(clientQuery.toLowerCase())).slice(0, 6) : []
  const draftTotal = (d: Draft) => Math.max(d.lines.reduce((s, l) => s + l.quantity * (articleById.get(l.articleId)?.salePrice ?? 0), 0) - d.discount, 0)

  return (
    <div className="grid h-full grid-cols-[1fr_410px] gap-6 p-8">
      {/* Colonne gauche : onglets + scan + panier */}
      <section className="flex min-h-0 min-w-0 flex-col gap-4">
        <CashSessionBar />
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Caisse</h1>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span><Key>F2</Key> Scan</span><span><Key>F3</Key> Nouvelle vente</span><span><Key>F4</Key> Ventes récentes</span><span><Key>Alt+1…9</Key> Changer de vente</span>
            <span><Key>F6</Key> Remise</span><span><Key>F7</Key> Reçu</span><span><Key>F9</Key> Encaisser</span><span><Key>F10</Key> Vider</span>
          </p>
        </header>

        {/* Ventes en cours : on passe de l'une à l'autre sans rien perdre */}
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
            {drafts.map((d, i) => {
              const active = d.id === draft.id
              return (
                <div key={d.id} className={cn('flex shrink-0 items-center rounded-lg border transition-colors', active ? 'border-primary bg-primary/10' : 'bg-card hover:bg-muted')}>
                  <button onClick={() => { setActiveId(d.id); setTimeout(() => scanRef.current?.focus(), 0) }} className="px-3.5 py-2 text-left">
                    <div className={cn('flex items-center gap-1.5 text-sm font-semibold', active && 'text-primary')}>
                      {d.editing ? <><Pencil className="h-3.5 w-3.5" />Modif. {d.editing.number}</> : `Vente ${d.num}`}
                      {i < 9 && <span className="text-[10px] font-normal text-muted-foreground">Alt+{i + 1}</span>}
                    </div>
                    <div className="tnum text-xs text-muted-foreground">{d.lines.length ? `${d.lines.length} art. · ${formatMoney(draftTotal(d))}` : 'vide'}{d.clientId && clientById.get(d.clientId) ? ` · ${clientById.get(d.clientId)!.name.split(' ')[0]}` : ''}</div>
                  </button>
                  {(drafts.length > 1 || d.lines.length > 0 || d.editing) && (
                    <button title="Fermer cette vente" onClick={() => closeSale(d.id)} className="mr-1.5 rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                  )}
                </div>
              )
            })}
          </div>
          <Button variant="outline" onClick={newSale}><Plus className="h-4 w-4" />Nouvelle vente</Button>
          <Button variant="outline" onClick={() => setRecentOpen(true)}><History className="h-4 w-4" />Ventes récentes</Button>
        </div>

        {draft.editing && (
          <div className="flex items-center justify-between rounded-lg border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm">
            <span><b>Modification de la vente n° {draft.editing.number}.</b> L’ancienne vente sera annulée et remplacée à l’encaissement
              {draft.editing.priceChanged && <span className="text-warning"> — attention : des prix ont changé depuis, les prix actuels s’appliquent</span>}.</span>
            <button className="font-medium text-primary" onClick={() => closeSale(draft.id)}>Abandonner</button>
          </div>
        )}

        <div className="relative">
          <ScanBarcode className="absolute left-4 top-4 h-5 w-5 text-primary" />
          <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} className="h-14 pl-12 text-lg"
            placeholder="Scanner un code-barres ou taper une désignation…" onKeyDown={(e) => e.key === 'Enter' && onScanEnter()} />
          {suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-card shadow-soft">
              {suggestions.map((a) => (
                <li key={a.id}><button className="flex w-full justify-between px-4 py-2.5 text-left hover:bg-muted" onClick={() => addArticle(a)}>
                  <span>{a.designation}</span><span className="tnum font-semibold">{formatMoney(a.salePrice)}</span></button></li>
              ))}
            </ul>
          )}
        </div>
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card shadow-soft">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Article</th><th className="px-4 py-3 font-medium">Prix</th>
                <th className="px-4 py-3 font-medium">Quantité</th><th className="px-4 py-3 text-right font-medium">Total</th><th />
              </tr>
            </thead>
            <tbody>
              {cart.map(({ article: a, quantity }) => {
                const stock = available(a)
                return (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{a.designation}</div>
                      <div className={cn('text-xs', quantity > stock ? (cfg.allowBelowStock ? 'text-warning' : 'text-destructive') : 'text-muted-foreground')}>
                        Stock : {formatQty(stock)} {a.unit}{quantity > stock && (cfg.allowBelowStock ? ' — sous stock' : ' — insuffisant')}
                      </div>
                    </td>
                    <td className="tnum px-4 py-3">{formatMoney(a.salePrice)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" onClick={() => setQty(a.id, quantity - 1)}><Minus className="h-4 w-4" /></Button>
                        <Input type="number" step="0.001" className="h-9 w-24 text-center" value={quantity} onChange={(e) => setQty(a.id, parseFloat(e.target.value) || 0)} />
                        <Button variant="outline" size="icon" onClick={() => setQty(a.id, quantity + 1)}><Plus className="h-4 w-4" /></Button>
                      </div>
                    </td>
                    <td className="tnum px-4 py-3 text-right text-base font-semibold">{formatMoney(quantity * a.salePrice)}</td>
                    <td className="px-2"><Button variant="ghost" size="icon" onClick={() => removeLine(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                  </tr>
                )
              })}
              {!cart.length && <tr><td colSpan={5} className="py-24 text-center text-muted-foreground">Le panier est vide. Scannez un article pour commencer.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Colonne droite : client + paiement */}
      <aside className="flex min-h-0 flex-col gap-4 overflow-auto rounded-lg border bg-card p-6 shadow-soft">
        {/* Client : facultatif pour une vente comptant, obligatoire pour un crédit */}
        <div>
          <Label>Client {method === 'credit' ? '(obligatoire pour un crédit)' : '(facultatif)'}</Label>
          {client ? (
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-semibold"><UserRound className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{client.name}</span></div>
                  {client.phone && <div className="text-xs text-muted-foreground">{client.phone}</div>}
                </div>
                <button className="shrink-0 text-xs text-muted-foreground hover:text-destructive" onClick={() => patch({ clientId: null })}>Retirer</button>
              </div>
              <div className="mt-2.5 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{client.balance < 0 ? 'Avoir' : 'Dette actuelle'}</span>
                <span className={cn('tnum font-semibold', client.balance > 0 && 'text-destructive', client.balance < 0 && 'text-success')}>{formatMoney(Math.abs(client.balance))}</span>
              </div>
              <div className="mt-2"><CreditMeter balance={client.balance} limit={client.creditLimit} compact /></div>
              <Button variant="outline" size="sm" className="mt-2.5 w-full" onClick={() => setStatementFor(client.id)}><FileText className="h-4 w-4" />Voir le crédit / encaisser un règlement</Button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Nom ou téléphone du client…" value={clientQuery} onChange={(e) => setClientQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && clientMatches.length) { patch({ clientId: clientMatches[0].id }); setClientQuery('') } }} />
              {clientMatches.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-card shadow-soft">
                  {clientMatches.map((c) => (
                    <li key={c.id}><button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { patch({ clientId: c.id }); setClientQuery('') }}>
                      <span>{c.name}</span>
                      <span className={cn('tnum text-xs', c.balance > 0 ? 'text-destructive' : 'text-muted-foreground')}>{c.balance > 0 ? `dette ${formatMoney(c.balance)}` : c.phone ?? ''}</span></button></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground"><span>Sous-total</span><span className="tnum">{formatMoney(subtotal)}</span></div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Remise (DT)</span>
            <Input ref={discountRef} type="number" step="0.001" min="0" className="h-9 w-32 text-right" value={draft.discount}
              onChange={(e) => patch({ discount: Math.min(parseFloat(e.target.value) || 0, (subtotal * cfg.maxDiscountPct) / 100) })} />
          </div>
        </div>

        <div className="rounded-lg bg-sidebar p-5 text-white">
          <div className="text-sm text-slate-400">Total à payer</div>
          <div className="tnum text-4xl font-semibold">{formatMoney(total)}</div>
        </div>

        <div>
          <Label>Mode de paiement</Label>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            {(Object.keys(PAY_LABELS) as PayMethod[]).filter((m) => cfg.paymentMethods.includes(m)).map((m) => {
              const Icon = METHOD_ICONS[m]
              return (
                <button key={m} onClick={() => patch({ method: m })}
                  className={cn('flex flex-col items-center gap-1 rounded-md border py-3 text-sm font-medium', method === m ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>
                  <Icon className="h-5 w-5" />{PAY_LABELS[m]}
                </button>
              )
            })}
          </div>
        </div>

        {method === 'credit' && (
          <div className="space-y-3">
            {!client && <p className="rounded-md bg-warning/15 px-3 py-2 text-sm text-warning">Choisissez le client ci-dessus pour vendre à crédit.</p>}
            {client && client.creditLimit <= 0 && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">Ce client n’a pas de crédit autorisé.</p>}
            <div><Label>Avance versée (DT)</Label>
              <Input ref={receivedRef} type="number" step="0.001" min="0" value={received} onChange={(e) => patch({ received: parseFloat(e.target.value) || 0 })} /></div>
            <div className="flex justify-between rounded-md bg-muted px-4 py-3">
              <span className="text-muted-foreground">Reste à crédit</span><span className="tnum text-lg font-semibold text-warning">{formatMoney(creditDue)}</span>
            </div>
            {client && client.creditLimit > 0 && baseBalance + creditDue > client.creditLimit && <p className="text-sm text-destructive">Plafond de crédit dépassé ({formatMoney(client.creditLimit)}).</p>}
          </div>
        )}
        {method === 'especes' && (
          <div className="space-y-3">
            <div><Label>Montant reçu (DT)</Label>
              <Input ref={receivedRef} type="number" step="0.001" min="0" className="h-12 text-lg" value={received}
                onChange={(e) => patch({ received: parseFloat(e.target.value) || 0 })} onKeyDown={(e) => e.key === 'Enter' && pay()} /></div>
            <div className="flex justify-between rounded-md bg-muted px-4 py-3">
              <span className="text-muted-foreground">Monnaie à rendre</span>
              <span className={cn('tnum text-lg font-semibold', change < 0 ? 'text-destructive' : 'text-success')}>{formatMoney(Math.max(change, 0))}</span>
            </div>
          </div>
        )}

        <div className="mt-auto space-y-2">
          <Button className="h-14 w-full text-base" disabled={!canPay} onClick={pay}>
            <Check className="h-5 w-5" />{draft.editing ? 'Enregistrer la modification (F9)' : 'Encaisser (F9)'}
          </Button>
          <Button variant="outline" className="w-full" onClick={resetSale}>Vider cette vente (F10)</Button>
        </div>
      </aside>

      <TicketDialog receipt={receipt} canEdit={cfg.allowSaleEdit} onEdit={(id) => editSale(id)} onClose={() => { setReceipt(null); scanRef.current?.focus() }} />
      <RecentSales open={recentOpen} canEdit={cfg.allowSaleEdit} onClose={() => { setRecentOpen(false); scanRef.current?.focus() }} onEdit={editSale} onChanged={load} />
      <ClientStatementDialog clientId={statementFor} onClose={() => setStatementFor(null)} onChanged={load} />
    </div>
  )
}

// ---------- Ventes récentes : retrouver une vente encaissée pour la corriger, l'annuler ou réimprimer le ticket ----------
function RecentSales({ open, canEdit, onClose, onEdit, onChanged }: { open: boolean; canEdit: boolean; onClose: () => void; onEdit: (id: number) => void; onChanged: () => void }) {
  const [scope, setScope] = useState<'today' | 'week' | 'all'>('today')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<SaleSummary[]>([])
  const [toCancel, setToCancel] = useState<SaleSummary | null>(null)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => { const r = await window.api.sales.list(scope, search); if (r.ok) setRows(r.data); else setMessage(r.error) }, [scope, search])
  useEffect(() => { if (open) { setMessage(''); refresh() } }, [open, refresh])

  async function cancel() {
    if (!toCancel) return
    const r = await window.api.sales.cancel(toCancel.id, reason)
    setToCancel(null); setReason('')
    setMessage(r.ok ? `Vente ${toCancel.number} annulée : le stock est rendu${toCancel.due > 0 ? ' et la dette du client est reprise' : ''}.` : r.error)
    refresh(); onChanged()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-auto">
          <DialogTitle>Ventes récentes</DialogTitle>
          <DialogDescription>Retrouvez une vente déjà encaissée pour la modifier, l’annuler ou réimprimer son ticket.</DialogDescription>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {([['today', 'Aujourd’hui'], ['week', '7 jours'], ['all', 'Toutes']] as const).map(([id, label]) => (
                <button key={id} onClick={() => setScope(id)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium', scope === id ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{label}</button>
              ))}
            </div>
            <div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="N° de ticket ou client…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          </div>
          {message && <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">{message}</p>}
          <div className="mt-4 overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                {['Ticket', 'Heure', 'Client', 'Articles', 'Total', 'Paiement', 'Statut', ''].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-2.5 font-mono text-[13px] font-medium">{s.number}</td>
                    <td className="tnum px-3 py-2.5 text-muted-foreground">{scope === 'today' ? s.createdAt.slice(11, 16) : `${s.createdAt.slice(8, 10)}/${s.createdAt.slice(5, 7)} ${s.createdAt.slice(11, 16)}`}</td>
                    <td className="px-3 py-2.5">{s.clientName ?? <span className="text-muted-foreground">Comptoir</span>}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{s.itemCount}</td>
                    <td className={cn('tnum px-3 py-2.5 font-semibold', s.status === 'annulee' && 'text-muted-foreground line-through')}>{formatMoney(s.total)}</td>
                    <td className="px-3 py-2.5">{PAY_LABELS[s.method]}{s.due > 0 && s.status === 'validee' && <div className="text-xs text-warning">reste {formatMoney(s.due)}</div>}</td>
                    <td className="px-3 py-2.5">{s.status === 'annulee'
                      ? <Badge tone="danger" title={s.cancelReason ?? ''}>{s.replacedBy ? 'Modifiée' : 'Annulée'}</Badge> : <Badge tone="success">Validée</Badge>}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Imprimer le ticket" onClick={() => window.api.tickets.print(s.id).then((r) => !r.ok && setMessage(r.error))}><Printer className="h-4 w-4" /></Button>
                        {s.status === 'validee' && canEdit && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => onEdit(s.id)}><Pencil className="h-4 w-4" />Modifier</Button>
                            <Button variant="ghost" size="icon" title="Annuler la vente" onClick={() => { setToCancel(s); setReason('') }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={8} className="py-14 text-center text-muted-foreground">Aucune vente.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end"><Button variant="outline" onClick={onClose}>Fermer</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toCancel} onOpenChange={(o) => !o && setToCancel(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Annuler la vente {toCancel?.number} ?</DialogTitle>
          <DialogDescription>
            Les articles retournent en stock{toCancel && toCancel.due > 0 ? ' et la dette du client est reprise' : ''}. La vente reste visible dans l’historique, marquée « annulée ».
          </DialogDescription>
          <div className="mt-4"><Label>Motif</Label><Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. erreur de saisie, client revenu" onKeyDown={(e) => e.key === 'Enter' && cancel()} /></div>
          <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setToCancel(null)}>Retour</Button><Button variant="destructive" onClick={cancel}>Annuler la vente</Button></div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function TicketDialog({ receipt, canEdit, onEdit, onClose }: { receipt: Receipt | null; canEdit: boolean; onEdit: (id: number) => void; onClose: () => void }) {
  const [printError, setPrintError] = useState('')
  return (
    <Dialog open={!!receipt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="flex items-center gap-2 text-success"><Check className="h-5 w-5" />Vente enregistrée</DialogTitle>
        {receipt && (
          <>
            {/* #ticket : seule zone imprimée (voir styles.css) */}
            <div id="ticket" className="mt-4 rounded-md border bg-white p-4 font-mono text-xs text-black">
              <div className="text-center text-sm font-bold">{receipt.shopName}</div>
              <div className="text-center">Ticket n° {receipt.number}</div>
              <div className="mb-2 text-center">{receipt.createdAt}</div>
              <hr className="border-dashed border-black" />
              {receipt.lines.map((l, i) => (
                <div key={i} className="py-1"><div>{l.designation}</div>
                  <div className="flex justify-between"><span>{formatQty(l.quantity)} x {l.unitPrice.toFixed(3)}</span><span>{l.total.toFixed(3)}</span></div></div>
              ))}
              <hr className="border-dashed border-black" />
              {receipt.discount > 0 && <div className="flex justify-between"><span>Remise</span><span>-{receipt.discount.toFixed(3)}</span></div>}
              <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>{receipt.total.toFixed(3)} DT</span></div>
              <div className="flex justify-between"><span>{PAY_LABELS[receipt.method]}</span><span>{receipt.received.toFixed(3)}</span></div>
              {receipt.clientName && <div className="flex justify-between"><span>Client</span><span>{receipt.clientName}</span></div>}
              {receipt.due > 0 && <div className="flex justify-between font-bold"><span>Reste à crédit</span><span>{receipt.due.toFixed(3)}</span></div>}
              {receipt.change > 0 && <div className="flex justify-between"><span>Rendu</span><span>{receipt.change.toFixed(3)}</span></div>}
              <div className="mt-2 text-center">Merci de votre visite !</div>
            </div>
            {printError && <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{printError}</p>}
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={async () => { const r = await window.api.tickets.print(receipt.id, receipt.received); if (!r.ok) setPrintError(r.error) }}><Printer className="h-4 w-4" />Imprimer</Button>
              <Button variant="outline" size="icon" title="Aperçu 80 mm" onClick={() => window.api.tickets.preview(receipt.id, receipt.received)}><Eye className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" title="Exporter en PDF" onClick={() => window.api.tickets.exportPdf(receipt.id, receipt.received)}><Download className="h-4 w-4" /></Button>
            </div>
            <div className="mt-2 flex gap-2">
              {canEdit && <Button variant="outline" className="flex-1" onClick={() => onEdit(receipt.id)}><Pencil className="h-4 w-4" />Modifier cette vente</Button>}
              <Button className="flex-1" autoFocus onClick={onClose}>Nouvelle vente</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
