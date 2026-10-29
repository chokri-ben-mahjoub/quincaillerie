import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HandCoins, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label, Select } from '@/components/ui/input'
import { cn, formatMoney, formatQty } from '@/lib/utils'
import DataGrid, { datePreset, type GridColumn } from '@/components/DataGrid'
import { ArticleSearchBox } from '@/components/ArticleSearchBox'
import type { Article, Purchase, Supplier, SupplierInput } from '@shared/types'

type Tab = 'achats' | 'fournisseurs'

export default function AchatsPage() {
  const [tab, setTab] = useState<Tab>('achats')
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [supplierDialog, setSupplierDialog] = useState<Supplier | 'new' | null>(null)
  const [payFor, setPayFor] = useState<Supplier | null>(null)

  const load = useCallback(async () => {
    const [p, s, a] = await Promise.all([window.api.purchases.list(), window.api.suppliers.list(), window.api.articles.list()])
    if (p.ok) setPurchases(p.data)
    if (s.ok) setSuppliers(s.data)
    if (a.ok) setArticles(a.data)
  }, [])
  useEffect(() => { load() }, [load])

  const purchaseCols = useMemo<GridColumn<Purchase>[]>(() => [
    { id: 'createdAt', header: 'Date', type: 'date', value: (p) => p.createdAt, width: '12rem' },
    { id: 'supplier', header: 'Fournisseur', type: 'enum', value: (p) => p.supplierName ?? '(Sans fournisseur)', cell: (p) => <span className="font-medium">{p.supplierName ?? '—'}</span> },
    { id: 'reference', header: 'Référence', value: (p) => p.reference ?? '', cell: (p) => <span className="text-muted-foreground">{p.reference ?? '—'}</span> },
    { id: 'itemCount', header: 'Articles', type: 'number', value: (p) => p.itemCount, align: 'right' },
    { id: 'total', header: 'Total', type: 'money', value: (p) => p.total, align: 'right', summary: 'sum', cell: (p) => <span className="tnum font-semibold">{formatMoney(p.total)}</span> },
    { id: 'remaining', header: 'Reste à payer', type: 'money', value: (p) => Math.round((p.total - p.paid) * 1000) / 1000, align: 'right', summary: 'sum',
      cell: (p) => (p.total - p.paid > 0.0005 ? <Badge tone="warning" className="tnum">{formatMoney(p.total - p.paid)}</Badge> : <Badge tone="success">Réglé</Badge>) }
  ], [])
  const supplierCols = useMemo<GridColumn<Supplier>[]>(() => [
    { id: 'name', header: 'Nom', value: (s) => s.name, cell: (s) => <span className="font-medium">{s.name}</span> },
    { id: 'phone', header: 'Téléphone', value: (s) => s.phone ?? '', cell: (s) => <span className="text-muted-foreground">{s.phone ?? '—'}</span> },
    { id: 'address', header: 'Adresse', value: (s) => s.address ?? '', cell: (s) => <span className="text-muted-foreground">{s.address ?? '—'}</span> },
    { id: 'balance', header: 'Solde dû', type: 'money', value: (s) => s.balance, align: 'right', summary: 'sum',
      cell: (s) => (s.balance > 0.0005 ? <Badge tone="danger" className="tnum">{formatMoney(s.balance)}</Badge> : <Badge tone="success">À jour</Badge>) },
    { id: 'actions', header: '', value: () => '', filterable: false, sortable: false, align: 'right', width: '12rem',
      cell: (s) => (
        <div className="flex justify-end gap-1">
          {s.balance > 0.0005 && <Button size="sm" variant="outline" onClick={() => setPayFor(s)}><HandCoins className="h-4 w-4" />Régler</Button>}
          <Button variant="ghost" size="icon" onClick={() => setSupplierDialog(s)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={async () => { if (confirm(`Supprimer « ${s.name} » ?`)) { await window.api.suppliers.remove(s.id); load() } }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      ) }
  ], [load])

  const totalDue = suppliers.reduce((s, x) => s + Math.max(x.balance, 0), 0)

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Achats & Fournisseurs</h1>
          <p className="text-muted-foreground">Réceptions de marchandise et dettes fournisseurs. Total dû : <b className="tnum text-foreground">{formatMoney(totalDue)}</b></p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSupplierDialog('new')}><Plus className="h-4 w-4" />Fournisseur</Button>
          <Button onClick={() => setPurchaseOpen(true)}><Plus className="h-4 w-4" />Nouvel achat</Button>
        </div>
      </header>

      <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
        {([['achats', 'Achats'], ['fournisseurs', 'Fournisseurs']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn('rounded-md px-4 py-2 text-sm font-medium', tab === id ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'achats' ? (
        <DataGrid id="achats" data={purchases} columns={purchaseCols} exportName="achats" searchPlaceholder="Rechercher par fournisseur, référence, montant…"
          presets={[{ label: 'Non réglés', filters: { remaining: { min: '0.001' } } }, { label: 'Ce mois', filters: { createdAt: datePreset('month') } }]} />
      ) : (
        <DataGrid id="fournisseurs" data={suppliers} columns={supplierCols} exportName="fournisseurs" searchPlaceholder="Rechercher par nom, téléphone, adresse…"
          presets={[{ label: 'Avec dette', filters: { balance: { min: '0.001' } } }]} />
      )}

      <PurchaseDialog open={purchaseOpen} articles={articles} suppliers={suppliers}
        onClose={() => setPurchaseOpen(false)} onSaved={() => { setPurchaseOpen(false); load() }} />
      <SupplierDialog target={supplierDialog} onClose={() => setSupplierDialog(null)} onSaved={() => { setSupplierDialog(null); load() }} />
      <PayDialog supplier={payFor} onClose={() => setPayFor(null)} onSaved={() => { setPayFor(null); load() }} />
    </div>
  )
}

// ---------- Nouvel achat ----------
interface Line { article: Article; quantity: number; unitCost: number }

function PurchaseDialog({ open, articles, suppliers, onClose, onSaved }: {
  open: boolean; articles: Article[]; suppliers: Supplier[]; onClose: () => void; onSaved: () => void
}) {
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [reference, setReference] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [paid, setPaid] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => { if (open) { setSupplierId(null); setReference(''); setLines([]); setPaid(0); setError('') } }, [open])

  const total = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0)
  const searchRef = useRef<HTMLInputElement>(null)
  const focusQty = useRef<number | null>(null)

  // Article choisi : ajouté (ou +1 s'il est déjà dans la liste) et le curseur va sur sa quantité ; Entrée = article suivant.
  function add(a: Article) {
    setLines((ls) => ls.some((l) => l.article.id === a.id)
      ? ls.map((l) => (l.article.id === a.id ? { ...l, quantity: l.quantity + 1 } : l))
      : [...ls, { article: a, quantity: 1, unitCost: a.purchasePrice }])
    focusQty.current = a.id
  }
  useEffect(() => {
    if (focusQty.current === null) return
    const el = document.querySelector<HTMLInputElement>(`[data-purchase-qty="${focusQty.current}"]`)
    focusQty.current = null
    el?.focus(); el?.select()
  }, [lines])
  const nextArticle = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); searchRef.current?.focus() } }
  const patch = (id: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.article.id === id ? { ...l, ...p } : l)))

  async function submit() {
    const res = await window.api.purchases.create({
      supplierId, reference, paid, items: lines.map((l) => ({ articleId: l.article.id, quantity: l.quantity, unitCost: l.unitCost }))
    })
    if (!res.ok) return setError(res.error)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogTitle>Nouvel achat</DialogTitle>
        <DialogDescription>La réception ajoute le stock et met à jour le prix d’achat des articles.</DialogDescription>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div><Label>Fournisseur</Label>
            <Select value={supplierId ?? ''} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Aucun —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select></div>
          <div><Label>Référence (n° facture / BL)</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        </div>

        <ArticleSearchBox ref={searchRef} articles={articles} onPick={add} priceOf={(a) => a.purchasePrice} className="mt-4"
          placeholder="Ajouter un article : nom, plusieurs mots ou code-barres… puis Entrée, la quantité, Entrée" />

        <div className="mt-3 max-h-[46vh] overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <tbody>
              {lines.map((l) => (
                <tr key={l.article.id} className="border-b last:border-0">
                  <td className="px-3 py-2"><div className="font-medium">{l.article.designation}</div>
                    <div className="text-xs text-muted-foreground">Stock : {formatQty(l.article.stock)} {l.article.unit}</div></td>
                  <td className="w-28 px-2"><Input data-purchase-qty={l.article.id} type="number" step="any" min="0" className="no-spin h-9 text-right font-medium" value={l.quantity} onFocus={(e) => e.target.select()} onKeyDown={nextArticle} onChange={(e) => patch(l.article.id, { quantity: parseFloat(e.target.value) || 0 })} /></td>
                  <td className="w-32 px-2"><Input type="number" step="any" min="0" className="no-spin h-9 text-right" value={l.unitCost} onFocus={(e) => e.target.select()} onKeyDown={nextArticle} onChange={(e) => patch(l.article.id, { unitCost: parseFloat(e.target.value) || 0 })} /></td>
                  <td className="tnum w-32 px-2 text-right font-semibold">{formatMoney(l.quantity * l.unitCost)}</td>
                  <td className="px-2"><Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((x) => x.article.id !== l.article.id))}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                </tr>
              ))}
              {!lines.length && <tr><td className="py-8 text-center text-muted-foreground">Aucun article ajouté (quantité puis prix d’achat unitaire).</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div className="w-48"><Label>Montant payé (DT)</Label>
            <Input type="number" step="0.001" min="0" value={paid} onChange={(e) => setPaid(parseFloat(e.target.value) || 0)} /></div>
          <div className="text-right"><div className="text-sm text-muted-foreground">Total</div><div className="tnum text-2xl font-semibold">{formatMoney(total)}</div></div>
        </div>
        {error && <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button disabled={!lines.length} onClick={submit}>Enregistrer l’achat</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Fournisseur (création / modification) ----------
function SupplierDialog({ target, onClose, onSaved }: { target: Supplier | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<SupplierInput>({ name: '', phone: '', address: '', note: '' })
  const [error, setError] = useState('')
  useEffect(() => {
    if (!target) return
    setError('')
    setF(target === 'new' ? { name: '', phone: '', address: '', note: '' } : { name: target.name, phone: target.phone ?? '', address: target.address ?? '', note: target.note ?? '' })
  }, [target])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const res = target === 'new' ? await window.api.suppliers.create(f) : await window.api.suppliers.update((target as Supplier).id, f)
    if (!res.ok) return setError(res.error)
    onSaved()
  }
  const field = (k: keyof SupplierInput, label: string) => (
    <div><Label>{label}</Label><Input value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  )
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>{target === 'new' ? 'Nouveau fournisseur' : 'Modifier le fournisseur'}</DialogTitle>
        <form onSubmit={submit} className="mt-4 space-y-3">
          {field('name', 'Nom *')}{field('phone', 'Téléphone')}{field('address', 'Adresse')}{field('note', 'Note')}
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit">Enregistrer</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Règlement d'une dette fournisseur ----------
function PayDialog({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => { if (supplier) { setAmount(supplier.balance); setError('') } }, [supplier])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const res = await window.api.suppliers.pay(supplier!.id, amount, '')
    if (!res.ok) return setError(res.error)
    onSaved()
  }
  return (
    <Dialog open={!!supplier} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Régler {supplier?.name}</DialogTitle>
        <DialogDescription>Solde dû : {supplier && formatMoney(supplier.balance)}</DialogDescription>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div><Label>Montant (DT)</Label><Input autoFocus type="number" step="0.001" min="0" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} /></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit">Enregistrer</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
