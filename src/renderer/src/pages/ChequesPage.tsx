import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Landmark, Loader2, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import DataGrid, { type GridColumn } from '@/components/DataGrid'
import { useAppConfig } from '@/lib/useAppConfig'
import { cn, fmtDate, formatMoney } from '@/lib/utils'
import { CHEQUE_STATUS_LABELS, STATUSES_BY_DIRECTION, type Cheque, type ChequeDirection, type ChequeInput, type ChequeStatus } from '@shared/cheques'

const today = () => new Date().toLocaleDateString('sv-SE')
const daysUntil = (d: string) => Math.round((new Date(d + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86_400_000)
const STATUS_TONE: Record<ChequeStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'primary'> = {
  portefeuille: 'primary', remis: 'warning', encaisse: 'success', impaye: 'danger', annule: 'neutral', emis: 'primary', debite: 'success'
}
const ACTIVE: ChequeStatus[] = ['portefeuille', 'emis'] // chèques dont l'échéance compte encore

function DueBadge({ q }: { q: Cheque }) {
  if (!ACTIVE.includes(q.status)) return <span className="tnum text-muted-foreground">{fmtDate(q.dueDate)}</span>
  const n = daysUntil(q.dueDate)
  const text = n < 0 ? `depuis ${-n} j` : n === 0 ? 'aujourd’hui' : `dans ${n} j`
  return <span className="tnum">{fmtDate(q.dueDate)} <span className={cn('text-xs', n <= 0 ? 'font-medium text-warning' : 'text-muted-foreground')}>({text})</span></span>
}

export default function ChequesPage() {
  const [rows, setRows] = useState<Cheque[]>([])
  const [tab, setTab] = useState<'recu' | 'emis' | 'incomplete'>('recu')
  const [editing, setEditing] = useState<Cheque | ChequeDirection | null>(null)
  const [depositing, setDepositing] = useState(false)

  const load = useCallback(async () => { const r = await window.api.cheques.list(); if (r.ok) setRows(r.data) }, [])
  useEffect(() => { load() }, [load])

  const incomplete = rows.filter((q) => q.incomplete && q.status !== 'annule')
  const wallet = rows.filter((q) => q.direction === 'recu' && q.status === 'portefeuille')
  const issued = rows.filter((q) => q.direction === 'emis' && q.status === 'emis')
  const unpaid = rows.filter((q) => q.status === 'impaye')
  const total = (xs: Cheque[]) => xs.reduce((s, q) => s + q.amount, 0)
  const data = tab === 'incomplete' ? incomplete : rows.filter((q) => q.direction === tab)

  const cols = useMemo<GridColumn<Cheque>[]>(() => [
    { id: 'dueDate', header: tab === 'emis' ? 'Débit prévu' : 'Encaissable le', type: 'date', value: (q) => q.dueDate, width: '12rem', cell: (q) => <DueBadge q={q} /> },
    { id: 'kind', header: 'Type', type: 'enum', value: (q) => (q.kind === 'traite' ? 'Traite' : 'Chèque'), width: '6rem' },
    { id: 'number', header: 'N° / banque', value: (q) => `${q.number} ${q.bank}`,
      cell: (q) => q.incomplete ? <Badge tone="warning">À compléter</Badge> : <><div className="font-mono">{q.number}</div><div className="text-xs text-muted-foreground">{q.bank}</div></> },
    { id: 'holder', header: tab === 'emis' ? 'Bénéficiaire' : 'Tireur', value: (q) => q.holder,
      cell: (q) => <><div className="font-medium">{q.holder || '—'}</div>{q.refLabel && <div className="text-xs text-muted-foreground">{q.refLabel}</div>}</> },
    { id: 'amount', header: 'Montant', type: 'money', value: (q) => q.amount, align: 'right', cell: (q) => <span className="tnum font-semibold">{formatMoney(q.amount)}</span> },
    { id: 'status', header: 'État', type: 'enum', value: (q) => q.status,
      options: Object.entries(CHEQUE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
      cell: (q) => <Badge tone={STATUS_TONE[q.status]}>{CHEQUE_STATUS_LABELS[q.status]}{q.statusDate && !ACTIVE.includes(q.status) ? ` le ${fmtDate(q.statusDate)}` : ''}</Badge> },
    { id: 'issueDate', header: tab === 'emis' ? 'Émis le' : 'Reçu le', type: 'date', value: (q) => q.issueDate, hidden: true, cell: (q) => fmtDate(q.issueDate) },
    { id: 'direction', header: 'Sens', type: 'enum', value: (q) => (q.direction === 'recu' ? 'Reçu' : 'Émis'), hidden: tab !== 'incomplete' }
  ], [tab])

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chèques et traites</h1>
          <p className="text-muted-foreground">Chèques reçus des clients, émis aux fournisseurs et pour les charges, avec leurs échéances.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing('emis')}><Plus className="h-4 w-4" />Chèque émis</Button>
          <Button onClick={() => setEditing('recu')}><Plus className="h-4 w-4" />Chèque reçu</Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border xl:grid-cols-4">
        <Stat label="En portefeuille" value={formatMoney(total(wallet))} hint={`${wallet.length} chèque(s) ou traite(s)`} />
        <Stat label="Encaissables aujourd’hui" value={formatMoney(total(wallet.filter((q) => q.dueDate <= today())))} hint={`${wallet.filter((q) => q.dueDate <= today()).length} à remettre en banque`} />
        <Stat label="Émis, pas encore débités" value={formatMoney(total(issued))} hint="Prévoir la provision" />
        <Stat label="Impayés" value={formatMoney(total(unpaid))} hint={`${unpaid.length} chèque(s)`} danger={unpaid.length > 0} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
          {([['recu', 'Reçus'], ['emis', 'Émis'], ['incomplete', `À compléter (${incomplete.length})`]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={cn('rounded-md px-4 py-2 text-sm font-medium', tab === id ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
          ))}
        </div>
        {tab === 'recu' && <Button variant="outline" onClick={() => setDepositing(true)} disabled={!wallet.length}><Landmark className="h-4 w-4" />Remise en banque</Button>}
      </div>

      {tab === 'incomplete' && incomplete.length > 0 && (
        <p className="rounded-md bg-warning/15 px-3 py-2 text-sm text-warning">Ces chèques ont été créés automatiquement lors d’un paiement : ajoutez leur n°, leur banque et leur date d’encaissement.</p>
      )}

      <DataGrid key={tab} id={`cheques-${tab}`} data={data} columns={cols} exportName={`cheques-${tab}`} onRowClick={setEditing}
        searchPlaceholder="Rechercher un n°, une banque, un tireur, un montant…"
        presets={tab === 'incomplete' ? [] : [
          { label: tab === 'recu' ? 'En portefeuille' : 'À débiter', filters: { status: tab === 'recu' ? 'portefeuille' : 'emis' } },
          { label: 'Impayés', filters: { status: 'impaye' } }
        ]}
        emptyText={tab === 'incomplete' ? 'Tous les chèques sont complets.' : 'Aucun chèque.'} />

      <ChequeDialog target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      <DepositDialog open={depositing} wallet={wallet} onClose={() => setDepositing(false)} onDone={() => { setDepositing(false); load() }} />
    </div>
  )
}

function Stat({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn('tnum mt-1 text-xl font-semibold', danger && 'text-destructive')}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

// ---------- Saisie, modification et changement d'état ----------
function ChequeDialog({ target, onClose, onSaved }: { target: Cheque | ChequeDirection | null; onClose: () => void; onSaved: () => void }) {
  const cfg = useAppConfig()
  const existing = target && typeof target === 'object' ? target : null
  const direction: ChequeDirection = existing?.direction ?? (target === 'emis' ? 'emis' : 'recu')
  const [f, setF] = useState<ChequeInput>({ direction: 'recu', kind: 'cheque', number: '', bank: '', holder: '', amount: 0, issueDate: today(), dueDate: today() })
  const [names, setNames] = useState<string[]>([])
  const [statusDate, setStatusDate] = useState(today())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!target) return
    setError(''); setSaving(false); setStatusDate(today())
    setF(existing ? { direction, kind: existing.kind, number: existing.number, bank: existing.bank, holder: existing.holder, clientId: existing.clientId,
      supplierId: existing.supplierId, amount: existing.amount, issueDate: existing.issueDate, dueDate: existing.dueDate, note: existing.note }
      : { direction, kind: 'cheque', number: '', bank: '', holder: '', amount: 0, issueDate: today(), dueDate: today() })
    // Noms proposés : clients pour un chèque reçu, fournisseurs pour un chèque émis.
    const src = direction === 'recu' ? window.api.clients.list() : window.api.suppliers.list()
    src.then((r: any) => r.ok && setNames(r.data.map((x: { name: string }) => x.name)))
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!target) return null
  const set = (p: Partial<ChequeInput>) => setF((x) => ({ ...x, ...p }))
  const linked = !!existing?.refType

  async function save(e?: React.FormEvent) {
    e?.preventDefault()
    setSaving(true)
    const r = existing ? await window.api.cheques.update(existing.id, f) : await window.api.cheques.create(f)
    setSaving(false)
    if (!r.ok) return setError(r.error)
    onSaved()
  }
  async function changeStatus(status: ChequeStatus) {
    if (!existing) return
    // Enregistre d'abord les corrections (n°, banque…) puis l'état.
    const u = await window.api.cheques.update(existing.id, f)
    if (!u.ok) return setError(u.error)
    const r = await window.api.cheques.setStatus([existing.id], status, statusDate)
    if (!r.ok) return setError(r.error)
    onSaved()
  }
  async function remove() {
    if (!existing) return
    const r = await window.api.cheques.delete(existing.id)
    if (!r.ok) return setError(r.error)
    onSaved()
  }

  const recu = direction === 'recu'
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>{existing ? `${f.kind === 'traite' ? 'Traite' : 'Chèque'} ${recu ? 'reçu' : 'émis'}` : recu ? 'Nouveau chèque reçu' : 'Nouveau chèque émis'}</DialogTitle>
        <DialogDescription>{existing?.refLabel ?? (recu ? 'Remis par un client.' : 'Donné à un fournisseur ou pour une charge.')}</DialogDescription>
        <form onSubmit={save} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Type</Label>
              <Select value={f.kind} onChange={(e) => set({ kind: e.target.value as 'cheque' | 'traite' })}><option value="cheque">Chèque</option><option value="traite">Traite (lettre de change)</option></Select></div>
            <div><Label htmlFor="cq-amount">Montant (DT)</Label>
              <Input id="cq-amount" type="number" step="0.001" min="0.001" className="tnum" disabled={linked} value={f.amount || ''} onChange={(e) => set({ amount: parseFloat(e.target.value) || 0 })} autoFocus={!existing} /></div>
            <div><Label htmlFor="cq-num">N° du {f.kind === 'traite' ? 'effet' : 'chèque'}</Label>
              <Input id="cq-num" className="font-mono" value={f.number} onChange={(e) => set({ number: e.target.value })} autoFocus={!!existing && !f.number} /></div>
            <div><Label htmlFor="cq-bank">Banque</Label>
              <Input id="cq-bank" list="cq-banks" value={f.bank} onChange={(e) => set({ bank: e.target.value })} placeholder="BIAT, STB, BNA…" />
              <datalist id="cq-banks">{cfg.chequeBanks.map((b) => <option key={b} value={b} />)}</datalist></div>
            <div className="col-span-2"><Label htmlFor="cq-holder">{recu ? 'Tireur (qui a signé)' : 'Bénéficiaire'}</Label>
              <Input id="cq-holder" list="cq-names" value={f.holder} onChange={(e) => set({ holder: e.target.value })} />
              <datalist id="cq-names">{names.map((n) => <option key={n} value={n} />)}</datalist></div>
            <div><Label htmlFor="cq-issue">{recu ? 'Reçu le' : 'Émis le'}</Label>
              <Input id="cq-issue" type="date" value={f.issueDate} onChange={(e) => e.target.value && set({ issueDate: e.target.value, dueDate: f.dueDate < e.target.value ? e.target.value : f.dueDate })} /></div>
            <div><Label htmlFor="cq-due">{f.kind === 'traite' ? 'Échéance' : recu ? 'Encaissable à partir du' : 'Débit prévu le'}</Label>
              <Input id="cq-due" type="date" min={f.issueDate} value={f.dueDate} onChange={(e) => e.target.value && set({ dueDate: e.target.value })} /></div>
            <div className="col-span-2"><Label htmlFor="cq-note">Note</Label><Textarea id="cq-note" rows={2} value={f.note ?? ''} onChange={(e) => set({ note: e.target.value })} /></div>
          </div>

          {existing && (
            <div className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm">État : <Badge tone={STATUS_TONE[existing.status]}>{CHEQUE_STATUS_LABELS[existing.status]}</Badge></span>
                <span className="flex-1" />
                <Label htmlFor="cq-sdate" className="mb-0">Date</Label>
                <Input id="cq-sdate" type="date" className="h-9 w-40" value={statusDate} onChange={(e) => e.target.value && setStatusDate(e.target.value)} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {STATUSES_BY_DIRECTION[direction].filter((s) => s !== existing.status).map((s) => (
                  <Button key={s} type="button" size="sm" variant={s === 'impaye' || s === 'annule' ? 'ghost' : 'outline'} onClick={() => changeStatus(s)}
                    className={cn(s === 'impaye' && 'text-destructive')}>{({ portefeuille: 'Remettre en portefeuille', remis: 'Remis en banque', encaisse: 'Encaissé', impaye: 'Impayé', annule: 'Annuler', emis: 'Remettre « émis »', debite: 'Débité' } as Record<ChequeStatus, string>)[s]}</Button>
                ))}
              </div>
            </div>
          )}

          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div className="flex items-center justify-between">
            {existing && !linked ? <Button type="button" variant="ghost" onClick={remove}><Trash2 className="h-4 w-4 text-destructive" />Supprimer</Button> : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Enregistrer</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Remise en banque : plusieurs chèques d'un coup ----------
function DepositDialog({ open, wallet, onClose, onDone }: { open: boolean; wallet: Cheque[]; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(today())
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const eligible = wallet.filter((q) => q.dueDate <= date).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  useEffect(() => {
    if (!open) return
    setDate(today()); setError('')
    setSel(new Set(wallet.filter((q) => q.dueDate <= today() && !q.incomplete).map((q) => q.id)))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = eligible.filter((q) => sel.has(q.id))
  async function submit() {
    const r = await window.api.cheques.setStatus(chosen.map((q) => q.id), 'remis', date)
    if (!r.ok) return setError(r.error)
    onDone()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Remise en banque</DialogTitle>
        <DialogDescription>Chèques et traites encaissables à la date de remise.</DialogDescription>
        <div className="mt-4 flex items-center gap-3"><Label htmlFor="dp-date" className="mb-0">Date de remise</Label>
          <Input id="dp-date" type="date" className="h-9 w-44" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
        <ul className="mt-4 max-h-[50vh] divide-y overflow-auto rounded-md border">
          {eligible.map((q) => (
            <li key={q.id}>
              <label className={cn('flex items-center gap-3 px-4 py-2.5 text-sm', q.incomplete ? 'opacity-60' : 'cursor-pointer hover:bg-muted/60')}>
                <input type="checkbox" className="accent-[hsl(var(--primary))]" disabled={q.incomplete} checked={sel.has(q.id)}
                  onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(q.id) : n.delete(q.id); return n })} />
                <span className="min-w-0 flex-1"><span className="font-medium">{q.holder}</span>
                  <span className="block text-xs text-muted-foreground">{q.incomplete ? 'À compléter avant la remise (n°, banque)' : `${q.kind === 'traite' ? 'Traite' : 'Chèque'} n° ${q.number}, ${q.bank}, encaissable le ${fmtDate(q.dueDate)}`}</span></span>
                <span className="tnum font-semibold">{formatMoney(q.amount)}</span>
              </label>
            </li>
          ))}
          {eligible.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun chèque encaissable à cette date.</li>}
        </ul>
        {error && <p role="alert" className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="mt-5 flex items-center justify-between">
          <span className="text-sm">{chosen.length} chèque(s), <span className="tnum font-semibold">{formatMoney(chosen.reduce((s, q) => s + q.amount, 0))}</span></span>
          <div className="flex gap-2"><Button variant="outline" onClick={onClose}>Annuler</Button><Button disabled={!chosen.length} onClick={submit}><Landmark className="h-4 w-4" />Marquer remis en banque</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
