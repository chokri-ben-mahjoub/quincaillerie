import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, FileText, HandCoins, Pencil, Plus, Search, Trash2, Users, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import DataGrid, { type GridColumn } from '@/components/DataGrid'
import { CreditMeter } from '@/components/CreditMeter'
import ClientStatementDialog from '@/components/ClientStatementDialog'
import { formatMoney } from '@/lib/utils'
import { useAppConfig } from '@/lib/useAppConfig'
import type { Client, ClientInput } from '@shared/types'

const EMPTY: ClientInput = { name: '', phone: '', address: '', creditLimit: 0 }

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [edit, setEdit] = useState<Client | 'new' | null>(null)
  const [payFor, setPayFor] = useState<Client | null>(null)
  const [message, setMessage] = useState('')
  const [statementFor, setStatementFor] = useState<number | null>(null)

  const load = useCallback(async () => {
    const r = await window.api.clients.list()
    if (r.ok) setClients(r.data)
  }, [])
  useEffect(() => { load() }, [load])

  const totalDebt = clients.reduce((s, c) => s + Math.max(c.balance, 0), 0)
  const indebted = clients.filter((c) => c.balance > 0).length
  const nearLimit = clients.filter((c) => c.creditLimit > 0 && c.balance / c.creditLimit >= 0.8).length
  const available = clients.reduce((s, c) => s + (c.creditLimit > 0 ? Math.max(c.creditLimit - c.balance, 0) : 0), 0)

  const usage = (c: Client) => (c.creditLimit > 0 ? Math.round((c.balance / c.creditLimit) * 100) : null)
  const columns = useMemo<GridColumn<Client>[]>(() => [
    { id: 'name', header: 'Nom', value: (c) => c.name + ' ' + (c.address ?? ''),
      cell: (c) => <button className="text-left" onClick={(e) => { e.stopPropagation(); setStatementFor(c.id) }}><div className="font-medium hover:text-primary hover:underline">{c.name}</div><div className="text-xs text-muted-foreground">{c.address}</div></button> },
    { id: 'phone', header: 'Téléphone', value: (c) => c.phone ?? '', cell: (c) => <span className="text-muted-foreground">{c.phone || '—'}</span> },
    { id: 'creditLimit', header: 'Plafond crédit', type: 'money', value: (c) => c.creditLimit, align: 'right',
      cell: (c) => (c.creditLimit > 0 ? <span className="tnum">{formatMoney(c.creditLimit)}</span> : <span className="text-muted-foreground">Pas de crédit</span>) },
    { id: 'usage', header: 'Utilisation du crédit (%)', type: 'number', value: usage, width: '13rem', cell: (c) => <CreditMeter balance={c.balance} limit={c.creditLimit} compact /> },
    { id: 'balance', header: 'Dette', type: 'money', value: (c) => c.balance, align: 'right', summary: 'sum',
      cell: (c) => (c.balance > 0 ? <Badge tone="danger" className="tnum">{formatMoney(c.balance)}</Badge> : c.balance < 0 ? <Badge tone="success" className="tnum">Avoir {formatMoney(-c.balance)}</Badge> : <Badge tone="success">À jour</Badge>) },
    { id: 'available', header: 'Crédit disponible', type: 'money', value: (c) => (c.creditLimit > 0 ? Math.max(c.creditLimit - c.balance, 0) : 0), align: 'right', hidden: true },
    { id: 'actions', header: '', value: () => '', filterable: false, sortable: false, align: 'right', width: '19rem',
      cell: (c) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => setStatementFor(c.id)}><FileText className="h-4 w-4" />Relevé</Button>
          {c.balance > 0 && <Button size="sm" variant="outline" onClick={() => setPayFor(c)}><HandCoins className="h-4 w-4" />Encaisser</Button>}
          <Button variant="ghost" size="icon" onClick={() => setEdit(c)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      ) }
  ], []) // eslint-disable-line react-hooks/exhaustive-deps

  async function remove(c: Client) {
    if (!confirm(`Supprimer « ${c.name} » ?`)) return
    const r = await window.api.clients.remove(c.id)
    if (!r.ok) setMessage(r.error)
    load()
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-muted-foreground">Fichier clients, crédit autorisé et règlement des dettes.</p>
        </div>
        <Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />Nouveau client</Button>
      </header>

      <section className="grid grid-cols-4 gap-4">
        {[
          { icon: Wallet, label: 'Créances clients', value: formatMoney(totalDebt), tone: 'bg-destructive/12 text-destructive' },
          { icon: Users, label: `Clients endettés (sur ${clients.length})`, value: String(indebted), tone: 'bg-warning/15 text-warning' },
          { icon: AlertTriangle, label: 'Plafond atteint à 80 % ou plus', value: String(nearLimit), tone: 'bg-primary/10 text-primary' },
          { icon: HandCoins, label: 'Crédit encore disponible', value: formatMoney(available), tone: 'bg-success/12 text-success' }
        ].map(({ icon: Icon, label, value, tone }) => (
          <div key={label} className="flex items-center gap-4 rounded-lg border bg-card p-5 shadow-soft">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon className="h-6 w-6" /></div>
            <div className="min-w-0"><div className="text-sm text-muted-foreground">{label}</div><div className="tnum whitespace-nowrap text-xl font-semibold">{value}</div></div>
          </div>
        ))}
      </section>

      {message && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</p>}

      <DataGrid id="clients" data={clients} columns={columns} exportName="clients" searchPlaceholder="Rechercher par nom, adresse ou téléphone…"
        presets={[
          { label: 'Avec dette', filters: { balance: { min: '0.001' } } },
          { label: 'Plafond ≥ 80 %', filters: { usage: { min: '80' } } },
          { label: 'Sans crédit', filters: { creditLimit: { max: '0' } } }
        ]}
        onRowClick={(c) => setStatementFor(c.id)} />

      <ClientStatementDialog clientId={statementFor} onClose={() => setStatementFor(null)} onChanged={load} />
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
