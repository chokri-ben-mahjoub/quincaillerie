import { useCallback, useEffect, useState } from 'react'
import { HandCoins } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { CreditMeter } from '@/components/CreditMeter'
import { cn, formatMoney } from '@/lib/utils'
import type { ClientStatement } from '@shared/types'

const fmtDate = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`

/** Relevé de crédit d'un client : dette, plafond, ventes à crédit et règlements avec le solde cumulé. Règlement possible sur place. */
export default function ClientStatementDialog({ clientId, onClose, onChanged }: { clientId: number | null; onClose: () => void; onChanged?: () => void }) {
  const [st, setSt] = useState<ClientStatement | null>(null)
  const [amount, setAmount] = useState(0)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (clientId === null) return
    const r = await window.api.clients.statement(clientId)
    if (r.ok) { setSt(r.data); setAmount(Math.max(r.data.client.balance, 0)) } else setError(r.error)
  }, [clientId])
  useEffect(() => { setSt(null); setError(''); setNotice(''); setNote(''); load() }, [load])

  async function pay() {
    if (!st) return
    setError(''); setNotice('')
    const r = await window.api.clients.pay(st.client.id, amount, note)
    if (!r.ok) return setError(r.error)
    setNotice(`Règlement de ${formatMoney(amount)} enregistré.`)
    setNote('')
    await load()
    onChanged?.()
  }

  const c = st?.client
  return (
    <Dialog open={clientId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-auto">
        <DialogTitle>Crédit de {c?.name ?? '…'}</DialogTitle>
        <DialogDescription>{c?.phone ? `Tél : ${c.phone}` : 'Relevé des ventes à crédit et des règlements.'}</DialogDescription>

        {st && c && (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{c.balance < 0 ? 'Avoir (le client a trop payé)' : 'Dette actuelle'}</div>
                <div className={cn('tnum text-xl font-semibold', c.balance > 0 && 'text-destructive', c.balance < 0 && 'text-success')}>{formatMoney(Math.abs(c.balance))}</div>
              </div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Plafond autorisé</div><div className="tnum text-xl font-semibold">{c.creditLimit > 0 ? formatMoney(c.creditLimit) : '—'}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Crédit disponible</div><div className="tnum text-xl font-semibold text-success">{c.creditLimit > 0 ? formatMoney(Math.max(c.creditLimit - c.balance, 0)) : '—'}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Achats (toutes ventes)</div><div className="tnum text-xl font-semibold">{formatMoney(st.salesTotal)}</div><div className="text-xs text-muted-foreground">{st.salesCount} vente(s)</div></div>
            </div>
            <CreditMeter balance={c.balance} limit={c.creditLimit} />

            <div className="max-h-72 overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Opération</th>
                    <th className="px-3 py-2 text-right font-medium">Dette +</th><th className="px-3 py-2 text-right font-medium">Payé −</th><th className="px-3 py-2 text-right font-medium">Solde</th>
                  </tr>
                </thead>
                <tbody>
                  {[...st.entries].reverse().map((e, i) => (
                    <tr key={i} className={cn('border-b last:border-0', e.cancelled && 'text-muted-foreground line-through')}>
                      <td className="tnum px-3 py-2 text-muted-foreground">{fmtDate(e.date)}</td>
                      <td className="px-3 py-2"><span className="font-medium">{e.ref}</span> <span className="text-xs text-muted-foreground">{e.label}</span></td>
                      <td className="tnum px-3 py-2 text-right">{e.debit > 0 ? formatMoney(e.debit) : ''}</td>
                      <td className="tnum px-3 py-2 text-right text-success">{e.credit > 0 ? formatMoney(e.credit) : ''}</td>
                      <td className="tnum px-3 py-2 text-right font-semibold">{formatMoney(e.balance)}</td>
                    </tr>
                  ))}
                  {!st.entries.length && <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">Aucune vente à crédit ni règlement.</td></tr>}
                </tbody>
              </table>
            </div>

            {c.balance > 0 && (
              <div className="flex items-end gap-3 rounded-lg border bg-muted/40 p-4">
                <div className="w-44"><Label>Montant encaissé (DT)</Label><Input type="number" step="0.001" min="0" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} /></div>
                <div className="flex-1"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. chèque n° 123456" /></div>
                <Button onClick={pay}><HandCoins className="h-4 w-4" />Enregistrer le règlement</Button>
              </div>
            )}
            {c.balance <= 0 && <Badge tone="success">Aucune dette en cours</Badge>}
          </div>
        )}

        {error && <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {notice && <p className="mt-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">{notice}</p>}
        <div className="mt-5 flex justify-end"><Button variant="outline" onClick={onClose}>Fermer</Button></div>
      </DialogContent>
    </Dialog>
  )
}
