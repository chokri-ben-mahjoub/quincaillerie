import { useCallback, useEffect, useState } from 'react'
import { HandCoins, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label, Select } from '@/components/ui/input'
import { formatMoney } from '@/lib/utils'
import type { InvoicePayment } from '@shared/invoice'

const METHODS = ['Espèces', 'Chèque', 'Virement', 'Carte bancaire', 'Traite']
const today = () => new Date().toLocaleDateString('sv-SE')
const fmtDate = (s: string) => s.split('-').reverse().join('/')
const mm = (n: number) => Math.round(n * 1000) // calculs en millimes : pas d'écart d'arrondi

export interface PaymentTarget { id: number; number: string | null; clientName: string; totalTtc: number }

/** Règlements d'une facture validée : historique, total réglé, reste à payer et saisie d'un nouvel encaissement. */
export default function InvoicePaymentsDialog({ invoice, onClose, onChanged }: { invoice: PaymentTarget | null; onClose: () => void; onChanged?: () => void }) {
  const [list, setList] = useState<InvoicePayment[]>([])
  const [form, setForm] = useState({ payDate: today(), amount: 0, method: 'Espèces', reference: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const paid = list.reduce((s, p) => s + mm(p.amount), 0) / 1000
  const rest = invoice ? Math.max(0, mm(invoice.totalTtc) - mm(paid)) / 1000 : 0

  const load = useCallback(async () => {
    if (!invoice) return
    const r = await window.api.invoices.payments(invoice.id)
    if (!r.ok) return setError(r.error)
    setList(r.data)
    const done = r.data.reduce((s, p) => s + mm(p.amount), 0)
    setForm((f) => ({ ...f, amount: Math.max(0, mm(invoice.totalTtc) - done) / 1000 }))
  }, [invoice])
  useEffect(() => { setList([]); setError(''); setNotice(''); setForm({ payDate: today(), amount: 0, method: 'Espèces', reference: '' }); load() }, [load])

  async function pay() {
    if (!invoice) return
    setError(''); setNotice('')
    if (form.amount <= 0) return setError('Saisissez un montant.')
    if (mm(form.amount) > mm(rest)) return setError(`Le montant dépasse le reste à payer (${formatMoney(rest)}).`)
    const r = await window.api.invoices.pay(invoice.id, form)
    if (!r.ok) return setError(r.error)
    setNotice(`Règlement de ${formatMoney(form.amount)} enregistré.`)
    setForm((f) => ({ ...f, reference: '' }))
    await load(); onChanged?.()
  }

  async function remove(p: InvoicePayment) {
    if (!confirm(`Supprimer le règlement de ${formatMoney(p.amount)} du ${fmtDate(p.payDate)} ?`)) return
    setError(''); setNotice('')
    const r = await window.api.invoices.unpay(p.id)
    if (!r.ok) return setError(r.error)
    await load(); onChanged?.()
  }

  return (
    <Dialog open={invoice !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogTitle>Règlements — facture {invoice?.number}</DialogTitle>
        <DialogDescription>{invoice?.clientName}</DialogDescription>

        {invoice && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Net à payer</div><div className="tnum text-lg font-semibold">{formatMoney(invoice.totalTtc)}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Total des règlements</div><div className="tnum text-lg font-semibold text-success">{formatMoney(paid)}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Reste à payer</div>
                <div className="tnum text-lg font-semibold">{rest > 0 ? formatMoney(rest) : <Badge tone="success">Soldée</Badge>}</div></div>
            </div>

            <div className="max-h-64 overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Mode</th><th className="px-3 py-2 font-medium">Référence</th>
                    <th className="px-3 py-2 font-medium">Saisi par</th><th className="px-3 py-2 text-right font-medium">Montant</th><th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="tnum px-3 py-2">{fmtDate(p.payDate)}</td>
                      <td className="px-3 py-2">{p.method}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.reference}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.userName}</td>
                      <td className="tnum px-3 py-2 text-right font-semibold">{formatMoney(p.amount)}</td>
                      <td className="px-1"><Button variant="ghost" size="icon" title="Supprimer ce règlement" onClick={() => remove(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                    </tr>
                  ))}
                  {!list.length && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Aucun règlement pour cette facture.</td></tr>}
                </tbody>
              </table>
            </div>

            {rest > 0 && (
              <div className="grid grid-cols-[9rem_9rem_10rem_1fr_auto] items-end gap-3 rounded-lg border bg-muted/40 p-4">
                <div><Label>Date</Label><Input type="date" value={form.payDate} onChange={(e) => setForm({ ...form, payDate: e.target.value })} /></div>
                <div><Label>Montant (DT)</Label><Input type="number" step="0.001" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} /></div>
                <div><Label>Mode</Label><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{METHODS.map((m) => <option key={m}>{m}</option>)}</Select></div>
                <div><Label>Référence</Label><Input value={form.reference} maxLength={80} placeholder="N° de chèque, de virement…" onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
                <Button onClick={pay}><HandCoins className="h-4 w-4" />Encaisser</Button>
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {notice && <p className="mt-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">{notice}</p>}
        <div className="mt-5 flex justify-end"><Button variant="outline" onClick={onClose}>Fermer</Button></div>
      </DialogContent>
    </Dialog>
  )
}
