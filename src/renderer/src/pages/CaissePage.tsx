import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Banknote, Check, CreditCard, Minus, Plus, Printer, Eye, Download, ScanBarcode, Trash2, FileText, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input, Label, Select } from '@/components/ui/input'
import { cn, formatMoney, formatQty } from '@/lib/utils'
import { PAY_LABELS, type Article, type Client, type PayMethod, type Receipt } from '@shared/types'

interface CartLine { article: Article; quantity: number }

const METHOD_ICONS = { especes: Banknote, carte: CreditCard, cheque: FileText, credit: Users }

// Petit rappel visuel d'un raccourci clavier
const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{children}</kbd>
)

export default function CaissePage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [scan, setScan] = useState('')
  const [discount, setDiscount] = useState(0)
  const [method, setMethod] = useState<PayMethod>('especes')
  const [received, setReceived] = useState(0)
  const [error, setError] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState<number | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)

  const scanRef = useRef<HTMLInputElement>(null)
  const discountRef = useRef<HTMLInputElement>(null)
  const receivedRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const r = await window.api.articles.list()
    if (r.ok) setArticles(r.data)
    const c = await window.api.clients.list()
    if (c.ok) setClients(c.data)
  }, [])
  useEffect(() => { load(); scanRef.current?.focus() }, [load])

  const byBarcode = useMemo(() => new Map(articles.map((a) => [a.barcode, a])), [articles])
  const suggestions = scan.trim().length >= 2 && !byBarcode.has(scan.trim())
    ? articles.filter((a) => a.designation.toLowerCase().includes(scan.toLowerCase())).slice(0, 6)
    : []

  const subtotal = cart.reduce((s, l) => s + l.quantity * l.article.salePrice, 0)
  const total = Math.max(subtotal - discount, 0)
  const change = method === 'especes' ? received - total : 0
  const client = clients.find((c) => c.id === clientId)
  const creditDue = Math.max(total - received, 0) // reste porté au crédit (received = avance)
  const canPay = cart.length > 0 && (
    method === 'especes' ? received >= total - 0.0005
    : method === 'credit' ? !!client && received <= total + 0.0005 && client.balance + creditDue <= client.creditLimit + 0.0005
    : true)

  function addArticle(a: Article) {
    setError('')
    setCart((c) => {
      const i = c.findIndex((l) => l.article.id === a.id)
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l))
      return [...c, { article: a, quantity: 1 }]
    })
    setScan('')
    scanRef.current?.focus()
  }

  // Un scanner "tape" le code puis Entrée : on cherche le code exact, sinon le 1er résultat par nom.
  function onScanEnter() {
    const code = scan.trim()
    if (!code) return
    const found = byBarcode.get(code) ?? suggestions[0]
    if (found) addArticle(found)
    else { setError(`Aucun article pour « ${code} ».`); setScan('') }
  }

  const setQty = (id: number, q: number) =>
    setCart((c) => c.map((l) => (l.article.id === id ? { ...l, quantity: Math.max(q, 0.001) } : l)))
  const remove = (id: number) => setCart((c) => c.filter((l) => l.article.id !== id))
  const reset = useCallback(() => {
    setCart([]); setDiscount(0); setReceived(0); setMethod('especes'); setClientId(null); setError(''); setScan('')
    scanRef.current?.focus()
  }, [])

  async function pay() {
    if (!canPay) return
    const res = await window.api.sales.create({
      clientId: method === 'credit' ? clientId : null,
      items: cart.map((l) => ({ articleId: l.article.id, quantity: l.quantity })),
      discount, method, received: method === 'especes' || method === 'credit' ? received : total
    })
    if (!res.ok) return setError(res.error)
    setReceipt(res.data)
    reset()
    load() // rafraîchit les stocks
  }

  // Raccourcis clavier de la caisse
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (receipt) return
      const map: Record<string, () => void> = {
        F2: () => scanRef.current?.focus(),
        F6: () => discountRef.current?.select(),
        F7: () => receivedRef.current?.select(),
        F9: pay,
        F10: reset
      }
      if (map[e.key]) { e.preventDefault(); map[e.key]() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="grid h-full grid-cols-[1fr_400px] gap-6 p-8">
      {/* Colonne gauche : scan + panier */}
      <section className="flex min-h-0 flex-col gap-4">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Caisse</h1>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span><Key>F2</Key> Scan</span><span><Key>F6</Key> Remise</span><span><Key>F7</Key> Montant reçu</span>
            <span><Key>F9</Key> Encaisser</span><span><Key>F10</Key> Vider</span>
          </p>
        </header>

        <div className="relative">
          <ScanBarcode className="absolute left-4 top-4 h-5 w-5 text-primary" />
          <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} className="h-14 pl-12 text-lg"
            placeholder="Scanner un code-barres ou taper une désignation…"
            onKeyDown={(e) => e.key === 'Enter' && onScanEnter()} />
          {suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-card shadow-soft">
              {suggestions.map((a) => (
                <li key={a.id}>
                  <button className="flex w-full justify-between px-4 py-2.5 text-left hover:bg-muted" onClick={() => addArticle(a)}>
                    <span>{a.designation}</span><span className="tnum font-semibold">{formatMoney(a.salePrice)}</span>
                  </button>
                </li>
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
              {cart.map(({ article: a, quantity }) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.designation}</div>
                    <div className={cn('text-xs', quantity > a.stock ? 'text-destructive' : 'text-muted-foreground')}>
                      Stock : {formatQty(a.stock)} {a.unit}{quantity > a.stock && ' — insuffisant'}
                    </div>
                  </td>
                  <td className="tnum px-4 py-3">{formatMoney(a.salePrice)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" onClick={() => setQty(a.id, quantity - 1)}><Minus className="h-4 w-4" /></Button>
                      <Input type="number" step="0.001" className="h-9 w-24 text-center" value={quantity}
                        onChange={(e) => setQty(a.id, parseFloat(e.target.value) || 0)} />
                      <Button variant="outline" size="icon" onClick={() => setQty(a.id, quantity + 1)}><Plus className="h-4 w-4" /></Button>
                    </div>
                  </td>
                  <td className="tnum px-4 py-3 text-right text-base font-semibold">{formatMoney(quantity * a.salePrice)}</td>
                  <td className="px-2"><Button variant="ghost" size="icon" onClick={() => remove(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                </tr>
              ))}
              {!cart.length && (
                <tr><td colSpan={5} className="py-24 text-center text-muted-foreground">Le panier est vide. Scannez un article pour commencer.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Colonne droite : paiement */}
      <aside className="flex flex-col gap-5 rounded-lg border bg-card p-6 shadow-soft">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground"><span>Sous-total</span><span className="tnum">{formatMoney(subtotal)}</span></div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Remise (DT)</span>
            <Input ref={discountRef} type="number" step="0.001" min="0" className="h-9 w-32 text-right" value={discount}
              onChange={(e) => setDiscount(Math.min(parseFloat(e.target.value) || 0, subtotal))} />
          </div>
        </div>

        <div className="rounded-lg bg-sidebar p-5 text-white">
          <div className="text-sm text-slate-400">Total à payer</div>
          <div className="tnum text-4xl font-semibold">{formatMoney(total)}</div>
        </div>

        <div>
          <Label>Mode de paiement</Label>
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(PAY_LABELS) as PayMethod[]).map((m) => {
              const Icon = METHOD_ICONS[m]
              return (
                <button key={m} onClick={() => setMethod(m)}
                  className={cn('flex flex-col items-center gap-1 rounded-md border py-3 text-sm font-medium',
                    method === m ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>
                  <Icon className="h-5 w-5" />{PAY_LABELS[m]}
                </button>
              )
            })}
          </div>
        </div>

        {method === 'credit' && (
          <div className="space-y-3">
            <div>
              <Label>Client</Label>
              <Select value={clientId ?? ''} onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Choisir un client —</option>
                {clients.filter((c) => c.creditLimit > 0).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              {client && <p className="mt-1 text-xs text-muted-foreground">Dette : {formatMoney(client.balance)} / plafond {formatMoney(client.creditLimit)}</p>}
            </div>
            <div>
              <Label>Avance versée (DT)</Label>
              <Input ref={receivedRef} type="number" step="0.001" min="0" value={received} onChange={(e) => setReceived(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="flex justify-between rounded-md bg-muted px-4 py-3">
              <span className="text-muted-foreground">Reste à crédit</span>
              <span className="tnum text-lg font-semibold text-warning">{formatMoney(creditDue)}</span>
            </div>
            {client && client.balance + creditDue > client.creditLimit && <p className="text-sm text-destructive">Plafond de crédit dépassé.</p>}
          </div>
        )}

        {method === 'especes' && (
          <div className="space-y-3">
            <div>
              <Label>Montant reçu (DT)</Label>
              <Input ref={receivedRef} type="number" step="0.001" min="0" className="h-12 text-lg" value={received}
                onChange={(e) => setReceived(parseFloat(e.target.value) || 0)} onKeyDown={(e) => e.key === 'Enter' && pay()} />
            </div>
            <div className="flex justify-between rounded-md bg-muted px-4 py-3">
              <span className="text-muted-foreground">Monnaie à rendre</span>
              <span className={cn('tnum text-lg font-semibold', change < 0 ? 'text-destructive' : 'text-success')}>
                {formatMoney(Math.max(change, 0))}
              </span>
            </div>
          </div>
        )}

        <div className="mt-auto space-y-2">
          <Button className="h-14 w-full text-base" disabled={!canPay} onClick={pay}><Check className="h-5 w-5" />Encaisser (F9)</Button>
          <Button variant="outline" className="w-full" onClick={reset}>Vider le panier (F10)</Button>
        </div>
      </aside>

      <TicketDialog receipt={receipt} onClose={() => { setReceipt(null); scanRef.current?.focus() }} />
    </div>
  )
}

function TicketDialog({ receipt, onClose }: { receipt: Receipt | null; onClose: () => void }) {
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
                <div key={i} className="py-1">
                  <div>{l.designation}</div>
                  <div className="flex justify-between">
                    <span>{formatQty(l.quantity)} x {l.unitPrice.toFixed(3)}</span><span>{l.total.toFixed(3)}</span>
                  </div>
                </div>
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
              <Button className="flex-1" autoFocus onClick={onClose}>Nouvelle vente</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
