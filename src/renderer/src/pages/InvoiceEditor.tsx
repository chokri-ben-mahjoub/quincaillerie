import { useEffect, useMemo, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Check, Plus, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/input'
import { ArticleSearchBox } from '@/components/ArticleSearchBox'
import { cn, formatMoney, norm } from '@/lib/utils'
import { useAppConfig } from '@/lib/useAppConfig'
import { type Article, type Client } from '@shared/types'
import { amountInWords, computeTotals, type CompanyInfo, type DocKind, type InvoiceInput, type InvoiceLine } from '@shared/invoice'

const today = () => new Date().toLocaleDateString('sv-SE')
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE') }
const PAYMENTS = ['Espèces', 'Chèque', 'Virement', 'Carte bancaire', 'Traite', 'À crédit']

// Colonnes de la grille de saisie (ordre de navigation au clavier)
const COL = { designation: 0, unit: 1, qty: 2, price: 3, discount: 4, tva: 5 }
const LAST_COL = COL.tva

const field = 'h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const cell = 'h-9 w-full rounded border border-transparent bg-transparent px-2 text-sm hover:border-input focus:border-ring focus:bg-card focus:outline-none focus:ring-1 focus:ring-ring'
const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{children}</kbd>

interface Props {
  kind?: DocKind
  target: number | 'new' | null // id d'un brouillon, ou 'new'
  onClose: () => void
  onSaved: () => void
}

/**
 * Éditeur plein écran des devis, factures, bons de commande et de livraison.
 * Saisie au clavier : recherche d'article → Entrée → quantité → Entrée → article suivant ; Tab/Entrée pour passer de cellule en cellule,
 * ↑ ↓ pour changer de ligne, Inser pour une ligne libre, Ctrl+S pour enregistrer, Ctrl+Entrée pour valider, Échap pour fermer.
 */
export default function InvoiceEditor({ kind = 'facture', target, onClose, onSaved }: Props) {
  const cfg = useAppConfig()
  const isInvoice = kind === 'facture'
  const isOrder = kind === 'bon_commande'
  const isDelivery = kind === 'bon_livraison'
  const api = isOrder ? window.api.orders : isDelivery ? window.api.deliveries : kind === 'devis' ? window.api.quotes : window.api.invoices
  const docName = isInvoice ? 'facture' : isOrder ? 'bon de commande' : isDelivery ? 'bon de livraison' : 'devis'
  const partyLabel = isOrder ? 'Fournisseur' : 'Client'

  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [parties, setParties] = useState<Client[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [form, setForm] = useState<InvoiceInput | null>(null)
  const [initial, setInitial] = useState('')
  const [savedId, setSavedId] = useState<number | null>(null)
  const [hasSaved, setHasSaved] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmValidate, setConfirmValidate] = useState(false)
  const [partyOpen, setPartyOpen] = useState(false)
  const [partyHi, setPartyHi] = useState(0)

  const searchRef = useRef<HTMLInputElement>(null)
  const partyRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLTableSectionElement>(null)
  const pending = useRef<{ row: number; col: number } | null>(null)

  // Chargement à l'ouverture : société, clients/fournisseurs, articles, puis le document (ou un formulaire vierge).
  useEffect(() => {
    if (target === null) return
    setError(''); setNotice(''); setConfirmValidate(false); setHasSaved(false)
    setSavedId(typeof target === 'number' ? target : null)
    ;(async () => {
      const [co, cl, ar] = await Promise.all([window.api.company.get(), isOrder ? window.api.suppliers.list() : window.api.clients.list(), window.api.articles.list()])
      if (!co.ok) return setError(co.error)
      setCompany(co.data)
      if (cl.ok) setParties((cl.data as any[]).map((c) => ({ id: c.id, name: c.name, phone: c.phone, address: c.address, creditLimit: 0, balance: 0 })))
      if (ar.ok) setArticles(ar.data)
      let f: InvoiceInput | null = null
      if (target === 'new') {
        const days = kind === 'devis' ? co.data.quoteValidityDays : isInvoice ? co.data.invoiceDueDays : 0
        f = { clientId: null, clientName: '', clientAddress: '', clientTaxId: '', clientPhone: '', issueDate: today(), dueDate: days > 0 ? inDays(days) : null,
          paymentMethod: 'Espèces', notes: '', timbre: isInvoice && co.data.timbreDefault && co.data.timbreAmount > 0, lines: [], representative: '' }
      } else {
        const r = await api.get(target)
        if (r.ok) f = r.data; else setError(r.error)
      }
      if (f) { setForm(f); setInitial(JSON.stringify(f)) }
      // Nouveau document : on commence par le client ; brouillon existant : directement la recherche d'article.
      setTimeout(() => (target === 'new' ? partyRef.current : searchRef.current)?.focus(), 150)
    })()
  }, [target])

  const totals = useMemo(() => (form && company ? computeTotals(form.lines, form.timbre, company.timbreAmount) : null), [form, company])
  const dirty = !!form && JSON.stringify(form) !== initial

  // Après l'ajout d'une ligne, le curseur va sur sa quantité.
  useEffect(() => {
    if (pending.current) { const { row, col } = pending.current; pending.current = null; focusCell(row, col) }
  }, [form?.lines.length])

  if (target === null) return null

  const set = <K extends keyof InvoiceInput>(k: K, v: InvoiceInput[K]) => { setNotice(''); setForm((f) => (f ? { ...f, [k]: v } : f)) }
  const patchLine = (i: number, p: Partial<InvoiceLine>) => { setNotice(''); setForm((f) => (f ? { ...f, lines: f.lines.map((l, n) => (n === i ? { ...l, ...p } : l)) } : f)) }

  // Prix du catalogue -> prix HT de la ligne, selon le réglage « prix HT ou TTC » (Paramètres > Taxes).
  const htPrice = (a: Article) => {
    const rate = company?.defaultTva ?? 19
    return company?.pricesMode === 'TTC' ? Math.round((a.salePrice / (1 + rate / 100)) * 1000) / 1000 : a.salePrice
  }
  const newLine = (p: Partial<InvoiceLine> = {}): InvoiceLine => ({ designation: '', unit: cfg.stockDefaultUnit, quantity: 1, unitPrice: 0, discountPct: 0, tvaRate: company?.defaultTva ?? 19, ...p })

  function addLine(p: Partial<InvoiceLine> | undefined, focusCol: number) {
    if (!form) return
    pending.current = { row: form.lines.length, col: focusCol }
    setNotice('')
    setForm({ ...form, lines: [...form.lines, newLine(p)] })
  }
  const addArticle = (a: Article) => addLine({ designation: a.designation, unit: a.unit, unitPrice: htPrice(a) }, COL.qty)

  function focusCell(row: number, col: number) {
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${row}-${col}"]`)
    if (!el) return false
    el.focus()
    if (el instanceof HTMLInputElement) el.select()
    return true
  }
  const focusSearch = () => { searchRef.current?.focus(); searchRef.current?.select() }

  // Navigation au clavier dans la grille (délégation d'événements)
  function onGridKey(e: React.KeyboardEvent) {
    const t = e.target as HTMLElement
    const m = /^(\d+)-(\d+)$/.exec(t.getAttribute('data-cell') ?? '')
    if (!m) return
    const row = Number(m[1]), col = Number(m[2])
    if (e.key === 'Enter') {
      e.preventDefault()
      // Quantité validée -> retour direct à la recherche d'article (flux le plus rapide) ; sinon cellule suivante.
      if (col === COL.qty || col === LAST_COL) focusSearch()
      else focusCell(row, col + 1)
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && t.tagName === 'INPUT') {
      e.preventDefault()
      const nextRow = row + (e.key === 'ArrowDown' ? 1 : -1)
      if (!focusCell(nextRow, col) && e.key === 'ArrowDown') focusSearch()
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && e.ctrlKey) {
      e.preventDefault()
      removeLine(row)
    }
  }
  function removeLine(i: number) {
    if (!form) return
    setForm({ ...form, lines: form.lines.filter((_, n) => n !== i) })
    setTimeout(() => (focusCell(Math.min(i, (form?.lines.length ?? 1) - 2), COL.qty) || focusSearch()), 0)
  }

  // Raccourcis généraux de l'éditeur
  function onRootKey(e: React.KeyboardEvent) {
    if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); save('stay') }
    else if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); askValidate() }
    else if (e.key === 'F2') { e.preventDefault(); focusSearch() }
    else if (e.key === 'Insert') { e.preventDefault(); addLine(undefined, COL.designation) }
  }

  const partyMatches = form && form.clientName.trim() && partyOpen
    ? parties.filter((c) => norm(`${c.name} ${c.phone ?? ''}`).includes(norm(form.clientName))).slice(0, 7) : []
  function pickParty(c: Client) {
    setNotice('')
    setForm((f) => f && { ...f, clientId: c.id, clientName: c.name, clientAddress: c.address ?? '', clientPhone: c.phone ?? '' })
    setPartyOpen(false)
    setTimeout(focusSearch, 0)
  }

  async function save(mode: 'stay' | 'close' | 'validate') {
    if (!form) return
    setError(''); setNotice('')
    const r = await api.save(savedId, form)
    if (!r.ok) return setError(r.error)
    setSavedId(r.data); setInitial(JSON.stringify(form)); setHasSaved(true)
    if (mode === 'validate') {
      const v = await api.validate(r.data)
      if (!v.ok) { setConfirmValidate(false); return setError(v.error) }
      return onSaved()
    }
    if (mode === 'close') return onSaved()
    setNotice('Brouillon enregistré.')
  }
  function askValidate() {
    if (!form?.lines.length) return setError('Ajoutez au moins une ligne avant de valider.')
    setError(''); setConfirmValidate(true)
  }
  function requestClose() {
    if (dirty && !confirm('Fermer sans enregistrer les modifications ?')) return
    hasSaved ? onSaved() : onClose() // des enregistrements ont eu lieu : on rafraîchit la liste
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && requestClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <DialogPrimitive.Content aria-describedby={undefined} onKeyDown={onRootKey}
          onEscapeKeyDown={(e) => { e.preventDefault(); if (!confirmValidate) requestClose() }} onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-50 flex flex-col bg-background outline-none">
          {/* En-tête */}
          <div className="flex items-center justify-between gap-4 border-b bg-card px-6 py-3">
            <div className="flex items-center gap-3">
              <DialogPrimitive.Title className="text-lg font-semibold">{savedId === null ? `${isInvoice ? 'Nouvelle' : 'Nouveau'} ${docName}` : `Brouillon de ${docName}`}</DialogPrimitive.Title>
              {dirty ? <Badge tone="warning">Modifications non enregistrées</Badge> : savedId !== null ? <Badge tone="success"><Check className="mr-1 h-3 w-3" />Enregistré</Badge> : null}
              {notice && <span className="text-sm text-success">{notice}</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => save('stay')} disabled={!form}>Enregistrer <Kbd>Ctrl+S</Kbd></Button>
              <Button variant="outline" onClick={() => save('close')} disabled={!form}>Enregistrer et fermer</Button>
              <Button onClick={askValidate} disabled={!form}>Valider <Kbd>Ctrl+↵</Kbd></Button>
              <Button variant="ghost" size="icon" title="Fermer (Échap)" onClick={requestClose}><X className="h-5 w-5" /></Button>
            </div>
          </div>

          {form && company && totals ? (
            <div className="grid min-h-0 flex-1 grid-cols-[1fr_21rem] gap-4 p-4">
              <div className="flex min-h-0 min-w-0 flex-col gap-3">
                {/* Client / fournisseur et informations : 2 lignes compactes */}
                <section className="grid grid-cols-12 gap-x-3 gap-y-2 rounded-lg border bg-card p-3">
                  <div className="relative col-span-4">
                    <Label>{partyLabel} *</Label>
                    <input ref={partyRef} className={field} value={form.clientName} placeholder={`Nom ou téléphone — ${isOrder ? 'fournisseur' : 'client'} enregistré ou saisie libre`}
                      onChange={(e) => { set('clientName', e.target.value); set('clientId', null); setPartyOpen(true); setPartyHi(0) }}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown' && partyMatches.length) { e.preventDefault(); setPartyHi((h) => Math.min(h + 1, partyMatches.length - 1)) }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); setPartyHi((h) => Math.max(h - 1, 0)) }
                        else if (e.key === 'Enter') { e.preventDefault(); partyMatches.length ? pickParty(partyMatches[partyHi] ?? partyMatches[0]) : focusSearch() }
                        else if (e.key === 'Escape' && partyOpen) { e.stopPropagation(); setPartyOpen(false) }
                      }} />
                    {partyMatches.length > 0 && (
                      <ul className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border bg-card shadow-soft">
                        {partyMatches.map((c, i) => (
                          <li key={c.id}><button type="button" onMouseEnter={() => setPartyHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pickParty(c)}
                            className={cn('flex w-full items-center justify-between px-3 py-2 text-left text-sm', i === partyHi ? 'bg-primary/10' : 'hover:bg-muted')}>
                            <span className="font-medium">{c.name}</span><span className="text-xs text-muted-foreground">{c.phone}</span></button></li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="col-span-2"><Label>Téléphone</Label><input className={field} value={form.clientPhone} onChange={(e) => set('clientPhone', e.target.value)} /></div>
                  <div className="col-span-2"><Label>Matricule fiscal</Label><input className={field} value={form.clientTaxId} onChange={(e) => set('clientTaxId', e.target.value)} /></div>
                  <div className="col-span-2"><Label>Date *</Label><input type="date" className={field} value={form.issueDate} onChange={(e) => set('issueDate', e.target.value)} /></div>
                  <div className="col-span-2"><Label>{kind === 'devis' ? 'Valable jusqu’au' : isOrder ? 'Livraison souhaitée' : isDelivery ? 'Livraison prévue' : 'Échéance'}</Label>
                    <input type="date" className={field} value={form.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || null)} /></div>
                  <div className={cn(isInvoice ? 'col-span-5' : 'col-span-9')}><Label>Adresse</Label><input className={field} value={form.clientAddress} onChange={(e) => set('clientAddress', e.target.value)} /></div>
                  <div className="col-span-3"><Label>Représentant</Label>
                    <input className={field} value={form.representative ?? ''} maxLength={60} placeholder="Utilisateur connecté" onChange={(e) => set('representative', e.target.value)} /></div>
                  {isInvoice && (
                    <div className="col-span-4"><Label>Mode de règlement</Label>
                      <select className={field} value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>{PAYMENTS.map((p) => <option key={p}>{p}</option>)}</select></div>
                  )}
                </section>

                {/* Recherche d'article : le point de départ de chaque ligne */}
                <div className="flex items-start gap-3">
                  <ArticleSearchBox ref={searchRef} articles={articles} onPick={addArticle} priceOf={htPrice} className="flex-1" />
                  <Button variant="outline" className="h-12" onClick={() => addLine(undefined, COL.designation)}><Plus className="h-4 w-4" />Ligne libre <Kbd>Inser</Kbd></Button>
                </div>

                {/* Grille de saisie */}
                <section className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-card">
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="w-10 px-2 py-2.5 text-center font-medium">N°</th><th className="px-2 py-2.5 font-medium">Désignation</th>
                        <th className="w-28 px-2 py-2.5 font-medium">Unité</th><th className="w-24 px-2 py-2.5 font-medium">Qté</th>
                        <th className="w-32 px-2 py-2.5 font-medium">P.U. HT</th><th className="w-24 px-2 py-2.5 font-medium">Remise %</th>
                        <th className="w-24 px-2 py-2.5 font-medium">TVA</th><th className="w-36 px-2 py-2.5 text-right font-medium">Total HT</th><th className="w-10" />
                      </tr>
                    </thead>
                    <tbody ref={gridRef} onKeyDown={onGridKey}>
                      {form.lines.map((l, i) => (
                        <tr key={i} className="group border-b last:border-0 focus-within:bg-primary/5">
                          <td className="px-2 text-center text-xs text-muted-foreground">{i + 1}</td>
                          <td className="px-1 py-1"><input data-cell={`${i}-${COL.designation}`} className={cell} value={l.designation} onFocus={(e) => e.target.select()} onChange={(e) => patchLine(i, { designation: e.target.value })} /></td>
                          <td className="px-1"><select data-cell={`${i}-${COL.unit}`} className={cell} value={l.unit} onChange={(e) => patchLine(i, { unit: e.target.value })}>
                            {[...new Set([...cfg.units, l.unit])].map((u) => <option key={u}>{u}</option>)}</select></td>
                          <td className="px-1"><input data-cell={`${i}-${COL.qty}`} type="number" step="any" min="0" className={cn(cell, 'no-spin text-right font-medium')} value={l.quantity}
                            onFocus={(e) => e.target.select()} onChange={(e) => patchLine(i, { quantity: parseFloat(e.target.value) || 0 })} /></td>
                          <td className="px-1"><input data-cell={`${i}-${COL.price}`} type="number" step="any" min="0" className={cn(cell, 'no-spin text-right')} value={l.unitPrice}
                            onFocus={(e) => e.target.select()} onChange={(e) => patchLine(i, { unitPrice: parseFloat(e.target.value) || 0 })} /></td>
                          <td className="px-1"><input data-cell={`${i}-${COL.discount}`} type="number" step="any" min="0" max="100" className={cn(cell, 'no-spin text-right')} value={l.discountPct}
                            onFocus={(e) => e.target.select()} onChange={(e) => patchLine(i, { discountPct: parseFloat(e.target.value) || 0 })} /></td>
                          <td className="px-1"><select data-cell={`${i}-${COL.tva}`} className={cell} value={l.tvaRate} onChange={(e) => patchLine(i, { tvaRate: Number(e.target.value) })}>
                            {[...new Set([...company.rates, l.tvaRate])].sort((x, y) => x - y).map((r) => <option key={r} value={r}>{r} %</option>)}</select></td>
                          <td className="tnum px-2 text-right font-semibold">{formatMoney(totals.lineTotals[i])}</td>
                          <td className="px-1"><button tabIndex={-1} title="Supprimer la ligne (Ctrl+Suppr)" className="rounded p-1.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-destructive focus:opacity-100 group-hover:opacity-100" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4" /></button></td>
                        </tr>
                      ))}
                      {!form.lines.length && (
                        <tr><td colSpan={9} className="py-16 text-center text-muted-foreground">
                          Tapez un article dans la recherche ci-dessus puis <Kbd>Entrée</Kbd>, saisissez la quantité et <Kbd>Entrée</Kbd> : l’article suivant.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </section>
              </div>

              {/* Totaux et notes */}
              <aside className="flex min-h-0 flex-col gap-3 overflow-auto">
                <dl className="space-y-2 rounded-lg border bg-card p-4 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Lignes</dt><dd className="tnum">{form.lines.length}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Total HT</dt><dd className="tnum">{formatMoney(totals.subtotalHt)}</dd></div>
                  {totals.tvaByRate.map((g) => (
                    <div key={g.rate} className="flex justify-between"><dt className="text-muted-foreground">TVA {g.rate} %</dt><dd className="tnum">{formatMoney(g.tva)}</dd></div>
                  ))}
                  {form.timbre && <div className="flex justify-between"><dt className="text-muted-foreground">Timbre fiscal</dt><dd className="tnum">{formatMoney(totals.timbre)}</dd></div>}
                  <div className="mt-3 rounded-lg bg-sidebar px-4 py-3 text-white">
                    <dt className="text-xs text-slate-400">{isInvoice ? 'Net à payer' : 'Total TTC'}</dt>
                    <dd className="tnum text-3xl font-semibold">{formatMoney(totals.totalTtc)}</dd>
                  </div>
                  {form.lines.length > 0 && <p className="rounded-md bg-muted px-3 py-2 text-xs"><span className="text-muted-foreground">En lettres : </span>{amountInWords(totals.totalTtc)}</p>}
                </dl>
                {isInvoice && (
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-card p-3 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={form.timbre} onChange={(e) => set('timbre', e.target.checked)} />
                    Droit de timbre fiscal ({formatMoney(company.timbreAmount)})
                  </label>
                )}
                <div className="rounded-lg border bg-card p-3">
                  <Label>Notes (imprimées sur le document)</Label>
                  <textarea className="min-h-[90px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">Le numéro définitif est attribué à la validation ; {docName} validé n’est plus modifiable{kind === 'devis' ? ' (il peut être converti en facture)' : ''}.</p>
              </aside>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">{error || 'Chargement…'}</div>
          )}

          {/* Pied : erreur et raccourcis */}
          <div className="border-t bg-card px-6 py-2.5">
            {error && form && <p className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span><Kbd>F2</Kbd> Rechercher un article</span><span><Kbd>Entrée</Kbd> Valider la cellule / champ suivant</span><span><Kbd>Tab</Kbd> Cellule suivante</span>
              <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> Changer de ligne</span><span><Kbd>Inser</Kbd> Ligne libre</span><span><Kbd>Ctrl+Suppr</Kbd> Supprimer la ligne</span>
              <span><Kbd>Ctrl+S</Kbd> Enregistrer</span><span><Kbd>Ctrl+↵</Kbd> Valider</span><span><Kbd>Échap</Kbd> Fermer</span>
            </div>
          </div>

          {confirmValidate && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-soft" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setConfirmValidate(false) } }}>
                <h2 className="text-lg font-semibold">Valider {isInvoice ? 'la facture' : isOrder ? 'le bon de commande' : isDelivery ? 'le bon de livraison' : 'le devis'} ?</h2>
                <p className="mt-2 text-sm text-muted-foreground">Le numéro définitif sera attribué et le document sera <b>verrouillé</b>. Total : <b>{formatMoney(totals?.totalTtc ?? 0)}</b>.</p>
                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setConfirmValidate(false)}>Retour</Button>
                  <Button autoFocus onClick={() => save('validate')}>Valider définitivement</Button>
                </div>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
