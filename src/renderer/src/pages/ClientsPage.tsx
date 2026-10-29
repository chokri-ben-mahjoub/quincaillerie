import { useCallback, useEffect, useMemo, useState } from 'react'
import { HandCoins, Pencil, Plus, Search, Trash2, Users, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { formatMoney } from '@/lib/utils'
import { useAppConfig } from '@/lib/useAppConfig'
import type { Client, ClientInput } from '@shared/types'

const EMPTY: ClientInput = { name: '', phone: '', address: '', creditLimit: 0 }

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [debtOnly, setDebtOnly] = useState(false)
  const [edit, setEdit] = useState<Client | 'new' | null>(null)
  const [payFor, setPayFor] = useState<Client | null>(null)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const r = await window.api.clients.list()
    if (r.ok) setClients(r.data)
  }, [])
  useEffect(() => { load() }, [load])

  const q = search.toLowerCase().trim()
  const shown = useMemo(() => clients.filter((c) =>
    (!debtOnly || c.balance > 0) && (!q || c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))), [clients, q, debtOnly])
  const totalDebt = clients.reduce((s, c) => s + c.balance, 0)

  async function remove(c: Client) {
    if (!confirm(`Supprimer « ${c.name} » ?`)) return
    const r = await window.api.clients.remove(c.id)
    if (!r.ok) setMessage(r.error)
    load()
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-muted-foreground">Fichier clients, crédit autorisé et règlement des dettes.</p>
        </div>
        <Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Nouveau client</Button>
      </header>

      <section className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-4 rounded-lg border bg-card p-5 shadow-soft">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="h-6 w-6" /></div>
          <div><div className="text-sm text-muted-foreground">Clients</div><div className="tnum text-2xl font-semibold">{clients.length}</div></div>
        </div>
        <div className="flex items-center gap-4 rounded-lg border bg-card p-5 shadow-soft">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/12 text-destructive"><Wallet className="h-6 w-6" /></div>
          <div><div className="text-sm text-muted-foreground">Créances clients</div><div className="tnum text-2xl font-semibold">{formatMoney(totalDebt)}</div></div>
        </div>
      </section>

      {message && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</p>}

      <section className="rounded-lg border bg-card shadow-soft">
        <div className="flex items-center gap-3 border-b p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Rechercher par nom ou téléphone…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant={debtOnly ? 'default' : 'outline'} onClick={() => setDebtOnly((v) => !v)}>Avec dette</Button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              {['Nom', 'Téléphone', 'Plafond crédit', 'Dette', ''].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3"><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{c.address}</div></td>
                <td className="px-4 py-3 text-muted-foreground">{c.phone || '—'}</td>
                <td className="tnum px-4 py-3">{c.creditLimit > 0 ? formatMoney(c.creditLimit) : <span className="text-muted-foreground">Pas de crédit</span>}</td>
                <td className="px-4 py-3">{c.balance > 0 ? <Badge tone="danger" className="tnum">{formatMoney(c.balance)}</Badge> : <Badge tone="success">À jour</Badge>}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {c.balance > 0 && <Button size="sm" variant="outline" onClick={() => setPayFor(c)}><HandCoins className="h-4 w-4" />Encaisser</Button>}
                    <Button variant="ghost" size="icon" onClick={() => setEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={5} className="py-16 text-center text-muted-foreground">Aucun client.</td></tr>}
          </tbody>
        </table>
      </section>

      <ClientDialog target={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />
      <PayDialog client={payFor} onClose={() => setPayFor(null)} onSaved={() => { setPayFor(null); load() }} />
    </div>
  )
}

function ClientDialog({ target, onClose, onSaved }: { target: Client | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const cfg = useAppConfig()
  const [f, setF] = useState<ClientInput>(EMPTY)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!target) return
    setError('')
    setF(target === 'new' ? { ...EMPTY, creditLimit: cfg.creditDefaultLimit } : { name: target.name, phone: target.phone ?? '', address: target.address ?? '', creditLimit: target.creditLimit })
  }, [target, cfg])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const r = target === 'new' ? await window.api.clients.create(f) : await window.api.clients.update((target as Client).id, f)
    if (!r.ok) return setError(r.error)
    onSaved()
  }
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>{target === 'new' ? 'Nouveau client' : 'Modifier le client'}</DialogTitle>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div><Label>Nom *</Label><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><Label>Téléphone</Label><Input value={f.phone ?? ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div><Label>Adresse</Label><Input value={f.address ?? ''} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
          <div><Label>Plafond de crédit (DT)</Label>
            <Input type="number" step="0.001" min="0" value={f.creditLimit} onChange={(e) => setF({ ...f, creditLimit: parseFloat(e.target.value) || 0 })} />
            <p className="mt-1 text-xs text-muted-foreground">0 = ce client ne peut pas acheter à crédit.</p></div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit">Enregistrer</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PayDialog({ client, onClose, onSaved }: { client: Client | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => { if (client) { setAmount(client.balance); setError('') } }, [client])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const r = await window.api.clients.pay(client!.id, amount, '')
    if (!r.ok) return setError(r.error)
    onSaved()
  }
  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Encaisser {client?.name}</DialogTitle>
        <DialogDescription>Dette actuelle : {client && formatMoney(client.balance)}</DialogDescription>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div><Label>Montant reçu (DT)</Label><Input autoFocus type="number" step="0.001" min="0" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} /></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit">Enregistrer</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
