import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label, Select } from '@/components/ui/input'
import { formatMoney } from '@/lib/utils'
import { UNITS, type Article, type Client } from '@shared/types'
import { TVA_RATES, amountInWords, computeTotals, type CompanyInfo, type DocKind, type InvoiceInput, type InvoiceLine } from '@shared/invoice'

const today = () => new Date().toLocaleDateString('sv-SE')
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE') }
const PAYMENTS = ['Espèces', 'Chèque', 'Virement', 'Carte bancaire', 'Traite', 'À crédit']

interface Props {
  kind?: DocKind // facture (défaut) ou devis
  target: number | 'new' | null // id d'un brouillon, ou 'new'
  onClose: () => void
  onSaved: () => void
}

export default function InvoiceEditor({ kind = 'facture', target, onClose, onSaved }: Props) {
  const isInvoice = kind === 'facture'
  const isOrder = kind === 'bon_commande'
  const isDelivery = kind === 'bon_livraison'
  const api = isOrder ? window.api.orders : isDelivery ? window.api.deliveries : kind === 'devis' ? window.api.quotes : window.api.invoices
  const docName = isInvoice ? 'facture' : isOrder ? 'bon de commande' : isDelivery ? 'bon de livraison' : 'devis'
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [form, setForm] = useState<InvoiceInput | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [confirmValidate, setConfirmValidate] = useState(false)

  // Chargement à l'ouverture : société, clients, articles, puis la facture (ou un formulaire vierge).
  useEffect(() => {
    if (target === null) return
    setError(''); setQuery(''); setConfirmValidate(false)
    ;(async () => {
      const [co, cl, ar] = await Promise.all([window.api.company.get(), (isOrder ? window.api.suppliers.list() : window.api.clients.list()), window.api.articles.list()])
      if (!co.ok) return setError(co.error)
      setCompany(co.data)
      if (cl.ok) setClients((cl.data as any[]).map((c) => ({ id: c.id, name: c.name, phone: c.phone, address: c.address, creditLimit: 0, balance: 0 })))
      if (ar.ok) setArticles(ar.data)
      if (target === 'new') {
        setForm({ clientId: null, clientName: '', clientAddress: '', clientTaxId: '', clientPhone: '', issueDate: today(),
          dueDate: (kind === 'devis' ? co.data.quoteValidityDays : isInvoice ? co.data.invoiceDueDays : 0) > 0
            ? inDays(kind === 'devis' ? co.data.quoteValidityDays : co.data.invoiceDueDays) : null,
          paymentMethod: 'Espèces', notes: '', timbre: isInvoice && co.data.timbreDefault && co.data.timbreAmount > 0, lines: [] })
      } else {
        const r = await api.get(target)
        if (r.ok) setForm(r.data); else setError(r.error)
      }
    })()
  }, [target])

  const totals = useMemo(
    () => (form && company ? computeTotals(form.lines, form.timbre, company.timbreAmount) : null), [form, company])

  if (target === null) return null
  const set = <K extends keyof InvoiceInput>(k: K, v: InvoiceInput[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))
  const patchLine = (i: number, p: Partial<InvoiceLine>) =>
    setForm((f) => (f ? { ...f, lines: f.lines.map((l, n) => (n === i ? { ...l, ...p } : l)) } : f))

  // Prix du catalogue -> prix HT de la ligne, selon le réglage « prix HT ou TTC » (Paramètres > Taxes).
  const fromArticle = (a: Article): Partial<InvoiceLine> => {
    const rate = company?.defaultTva ?? 19
    const ht = company?.pricesMode === 'TTC' ? Math.round((a.salePrice / (1 + rate / 100)) * 1000) / 1000 : a.salePrice
    return { designation: a.designation, unit: a.unit, unitPrice: ht }
  }
  const newLine = (p: Partial<InvoiceLine> = {}): InvoiceLine => ({
    designation: '', unit: 'pièce', quantity: 1, unitPrice: 0, discountPct: 0, tvaRate: company?.defaultTva ?? 19, ...p
  })
  const addLine = (p?: Partial<InvoiceLine>) => setForm((f) => (f ? { ...f, lines: [...f.lines, newLine(p)] } : f))

  const matches = query.trim()
    ? articles.filter((a) => (a.designation + ' ' + a.barcode).toLowerCase().includes(query.toLowerCase())).slice(0, 6) : []

  function pickClient(id: string) {
    const c = clients.find((x) => x.id === Number(id))
    setForm((f) => f && (c
      ? { ...f, clientId: c.id, clientName: c.name, clientAddress: c.address ?? '', clientPhone: c.phone ?? '' }
      : { ...f, clientId: null }))
  }

  async function save(thenValidate: boolean) {
    if (!form) return
    const r = await api.save(typeof target === 'number' ? target : null, form)
    if (!r.ok) return setError(r.error)
    if (thenValidate) {
      const v = await api.validate(r.data)
      if (!v.ok) return setError(v.error)
    }
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94vh] max-w-6xl overflow-auto">
        <DialogTitle>{target === 'new' ? `Nouveau ${docName}` : 'Modifier le brouillon'}</DialogTitle>
        <DialogDescription>Le numéro est attribué à la validation. {kind === 'devis' ? 'Un devis validé n’est plus modifiable ; il peut être converti en facture.' : `Un ${docName} validé n’est plus modifiable.`}</DialogDescription>

        {form && company && totals && (
          <div className="mt-5 space-y-5">
            {/* Client + informations */}
            <div className="grid grid-cols-[1.4fr_1fr] gap-5">
              <section className="space-y-3 rounded-lg border p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{isOrder ? 'Fournisseur' : 'Client'}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>{isOrder ? 'Fournisseur enregistré' : 'Client enregistré'}</Label>
                    <Select value={form.clientId ?? ''} onChange={(e) => pickClient(e.target.value)}>
                      <option value="">— Saisie libre —</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </div>
                  <div className="col-span-2"><Label>Nom / Raison sociale *</Label><Input value={form.clientName} onChange={(e) => set('clientName', e.target.value)} /></div>
                  <div className="col-span-2"><Label>Adresse</Label><Input value={form.clientAddress} onChange={(e) => set('clientAddress', e.target.value)} /></div>
                  <div><Label>Matricule fiscal</Label><Input value={form.clientTaxId} onChange={(e) => set('clientTaxId', e.target.value)} /></div>
                  <div><Label>Téléphone</Label><Input value={form.clientPhone} onChange={(e) => set('clientPhone', e.target.value)} /></div>
                </div>
              </section>
              <section className="space-y-3 rounded-lg border p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{docName.charAt(0).toUpperCase() + docName.slice(1)}</h3>
                <div><Label>Date *</Label><Input type="date" value={form.issueDate} onChange={(e) => set('issueDate', e.target.value)} /></div>
                <div><Label>{kind === 'devis' ? 'Valable jusqu’au' : isOrder ? 'Livraison souhaitée le' : isDelivery ? 'Livraison prévue le' : 'Échéance'}</Label><Input type="date" value={form.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || null)} /></div>
                {isInvoice && <div><Label>Mode de règlement</Label>
                  <Select value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
                    {PAYMENTS.map((p) => <option key={p}>{p}</option>)}
                  </Select></div>}
              </section>
            </div>

            {/* Lignes */}
            <section className="rounded-lg border">
              <div className="relative flex items-center gap-3 border-b p-3">
                <Input className="max-w-md" placeholder="Ajouter un article du catalogue (nom ou code-barres)…" value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && matches.length) { e.preventDefault(); addLine(fromArticle(matches[0])); setQuery('') } }} />
                <Button variant="outline" onClick={() => addLine()}><Plus className="h-4 w-4" />Ligne libre</Button>
                {matches.length > 0 && (
                  <ul className="absolute left-3 top-14 z-10 w-[28rem] overflow-hidden rounded-md border bg-card shadow-soft">
                    {matches.map((a) => (
                      <li key={a.id}>
                        <button className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => { addLine(fromArticle(a)); setQuery('') }}>
                          <span>{a.designation}</span><span className="tnum text-muted-foreground">{formatMoney(a.salePrice)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    {['Désignation', 'Unité', 'Qté', 'P.U. HT', 'Remise %', 'TVA', 'Total HT', ''].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-2 py-1.5"><Input className="h-9" value={l.designation} onChange={(e) => patchLine(i, { designation: e.target.value })} /></td>
                      <td className="w-28 px-2"><Select className="h-9" value={l.unit} onChange={(e) => patchLine(i, { unit: e.target.value })}>
                        {UNITS.map((u) => <option key={u}>{u}</option>)}</Select></td>
                      <td className="w-24 px-2"><Input className="h-9" type="number" step="0.001" min="0" value={l.quantity} onChange={(e) => patchLine(i, { quantity: parseFloat(e.target.value) || 0 })} /></td>
                      <td className="w-32 px-2"><Input className="h-9" type="number" step="0.001" min="0" value={l.unitPrice} onChange={(e) => patchLine(i, { unitPrice: parseFloat(e.target.value) || 0 })} /></td>
                      <td className="w-24 px-2"><Input className="h-9" type="number" step="0.1" min="0" max="100" value={l.discountPct} onChange={(e) => patchLine(i, { discountPct: parseFloat(e.target.value) || 0 })} /></td>
                      <td className="w-24 px-2"><Select className="h-9" value={l.tvaRate} onChange={(e) => patchLine(i, { tvaRate: Number(e.target.value) })}>
                        {[...new Set([...company.rates, l.tvaRate])].sort((x, y) => x - y).map((r) => <option key={r} value={r}>{r} %</option>)}</Select></td>
                      <td className="tnum w-32 px-2 text-right font-semibold">{formatMoney(totals.lineTotals[i])}</td>
                      <td className="px-2"><Button variant="ghost" size="icon" onClick={() => set('lines', form.lines.filter((_, n) => n !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                    </tr>
                  ))}
                  {!form.lines.length && <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">Aucune ligne. Recherchez un article ou ajoutez une ligne libre.</td></tr>}
                </tbody>
              </table>
            </section>

            {/* Totaux */}
            <div className="grid grid-cols-[1fr_22rem] gap-5">
              <div className="space-y-3">
                <div><Label>Notes (affichées sur la facture)</Label>
                  <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
                {isInvoice && <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={form.timbre} onChange={(e) => set('timbre', e.target.checked)} />
                  Appliquer le droit de timbre fiscal ({formatMoney(company.timbreAmount)})
                </label>}
                {form.lines.length > 0 && <p className="rounded-md bg-muted px-3 py-2 text-sm"><span className="text-muted-foreground">En lettres : </span>{amountInWords(totals.totalTtc)}</p>}
              </div>
              <dl className="space-y-1.5 rounded-lg border p-4 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Total HT</dt><dd className="tnum">{formatMoney(totals.subtotalHt)}</dd></div>
                {totals.tvaByRate.map((g) => (
                  <div key={g.rate} className="flex justify-between"><dt className="text-muted-foreground">TVA {g.rate} %</dt><dd className="tnum">{formatMoney(g.tva)}</dd></div>
                ))}
                {form.timbre && <div className="flex justify-between"><dt className="text-muted-foreground">Timbre fiscal</dt><dd className="tnum">{formatMoney(totals.timbre)}</dd></div>}
                <div className="mt-2 flex justify-between rounded-md bg-sidebar px-3 py-2.5 text-base font-semibold text-white"><dt>Net à payer</dt><dd className="tnum">{formatMoney(totals.totalTtc)}</dd></div>
              </dl>
            </div>
          </div>
        )}

        {error && <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        {confirmValidate ? (
          <div className="mt-5 flex items-center justify-between rounded-lg border border-warning/40 bg-warning/10 p-4">
            <p className="text-sm">Valider attribue le numéro définitif et <b>verrouille</b> {isInvoice ? 'la facture' : isOrder ? 'le bon de commande' : isDelivery ? 'le bon de livraison' : 'le devis'}. Continuer ?</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmValidate(false)}>Non</Button>
              <Button onClick={() => save(true)}>Oui, valider</Button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button variant="outline" onClick={() => save(false)}>Enregistrer le brouillon</Button>
            <Button onClick={() => setConfirmValidate(true)} disabled={!form?.lines.length}>Valider</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
