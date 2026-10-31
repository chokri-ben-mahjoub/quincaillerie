import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Banknote, Check, FileText, Loader2, Paperclip, Plus, Trash2, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import DataGrid, { datePreset, type GridColumn } from '@/components/DataGrid'
import { useAppConfig } from '@/lib/useAppConfig'
import { cn, fmtDate, formatMoney } from '@/lib/utils'
import { EXPENSE_METHOD_LABELS, RECURRENCE_LABELS, type Expense, type ExpenseCategory, type ExpenseInput, type ExpenseMethod } from '@shared/expenses'

const today = () => new Date().toLocaleDateString('sv-SE')
const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv-SE') }
const daysUntil = (d: string) => Math.round((new Date(d + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86_400_000)

/** « en retard de 3 jours », « aujourd'hui », « dans 5 jours ». */
function dueText(d: string): { text: string; tone: 'danger' | 'warning' | 'neutral' } {
  const n = daysUntil(d)
  if (n < 0) return { text: `en retard de ${-n} jour${n < -1 ? 's' : ''}`, tone: 'danger' }
  if (n === 0) return { text: 'à payer aujourd’hui', tone: 'warning' }
  return { text: `dans ${n} jour${n > 1 ? 's' : ''}`, tone: n <= 7 ? 'warning' : 'neutral' }
}

/** Photo réduite (1600 px max) ou PDF tel quel, en data URL. */
async function fileToAttachment(file: File): Promise<{ data: string; name: string }> {
  if (file.type === 'application/pdf') {
    if (file.size > 3 * 1024 * 1024) throw new Error('PDF trop lourd (3 Mo maximum).')
    const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Lecture impossible.')); r.readAsDataURL(file) })
    return { data, name: file.name }
  }
  if (!file.type.startsWith('image/')) throw new Error('Choisissez une photo (JPG, PNG) ou un PDF.')
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return { data: canvas.toDataURL('image/jpeg', 0.82), name: file.name.replace(/\.\w+$/, '') + '.jpg' }
}

export default function DepensesPage() {
  const cfg = useAppConfig()
  const [rows, setRows] = useState<Expense[]>([])
  const [cats, setCats] = useState<ExpenseCategory[]>([])
  const [tab, setTab] = useState<'due' | 'all'>('due')
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [paying, setPaying] = useState<Expense | null>(null)

  const load = useCallback(async () => {
    const [e, c] = await Promise.all([window.api.expenses.list(), window.api.expenses.categories()])
    if (e.ok) setRows(e.data)
    if (c.ok) setCats(c.data)
  }, [])
  useEffect(() => { load() }, [load])

  const due = useMemo(() => rows.filter((r) => r.status === 'a_payer')
    .sort((a, b) => (a.dueDate ?? a.expenseDate).localeCompare(b.dueDate ?? b.expenseDate)), [rows])
  const month = today().slice(0, 7)
  const stats = {
    dueTotal: due.reduce((s, r) => s + r.amount, 0),
    late: due.filter((r) => (r.dueDate ?? r.expenseDate) < today()),
    paidMonth: rows.filter((r) => r.status === 'payee' && r.paidDate?.startsWith(month)).reduce((s, r) => s + r.amount, 0),
    cashToday: rows.filter((r) => r.status === 'payee' && r.fromCash && r.paidDate === today()).reduce((s, r) => s + r.amount, 0)
  }

  const cols = useMemo<GridColumn<Expense>[]>(() => [
    { id: 'expenseDate', header: 'Date facture', type: 'date', value: (e) => e.expenseDate, width: '8rem', cell: (e) => <span className="tnum text-muted-foreground">{fmtDate(e.expenseDate)}</span> },
    { id: 'category', header: 'Catégorie', type: 'enum', value: (e) => e.categoryName,
      cell: (e) => <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.categoryColor }} />{e.categoryName}</span> },
    { id: 'label', header: 'Libellé', value: (e) => `${e.label} ${e.payee ?? ''} ${e.reference ?? ''}`,
      cell: (e) => <><div className="font-medium">{e.label}</div>{(e.payee || e.reference) && <div className="text-xs text-muted-foreground">{[e.payee, e.reference && `n° ${e.reference}`].filter(Boolean).join(', ')}</div>}</> },
    { id: 'amount', header: 'Montant', type: 'money', value: (e) => e.amount, align: 'right', cell: (e) => <span className="tnum font-semibold">{formatMoney(e.amount)}</span> },
    { id: 'status', header: 'Statut', type: 'enum', value: (e) => e.status, options: [{ value: 'a_payer', label: 'À payer' }, { value: 'payee', label: 'Payée' }],
      cell: (e) => e.status === 'payee' ? <Badge tone="success">Payée le {fmtDate(e.paidDate)}</Badge> : <Badge tone={dueText(e.dueDate ?? e.expenseDate).tone}>À payer, {dueText(e.dueDate ?? e.expenseDate).text}</Badge> },
    { id: 'method', header: 'Mode', type: 'enum', value: (e) => (e.method ? EXPENSE_METHOD_LABELS[e.method] + (e.fromCash ? ' (caisse)' : '') : '—') },
    { id: 'dueDate', header: 'Échéance', type: 'date', value: (e) => e.dueDate ?? '', hidden: true, cell: (e) => e.dueDate ? fmtDate(e.dueDate) : '—' },
    { id: 'paidDate', header: 'Payée le', type: 'date', value: (e) => e.paidDate ?? '', hidden: true, cell: (e) => e.paidDate ? fmtDate(e.paidDate) : '—' },
    { id: 'att', header: 'Facture', value: (e) => (e.hasAttachment ? 'oui' : 'non'), align: 'center', width: '5rem', filterable: false,
      cell: (e) => e.hasAttachment ? <Paperclip className="mx-auto h-4 w-4 text-muted-foreground" /> : null },
    { id: 'user', header: 'Saisie par', type: 'enum', value: (e) => e.userName ?? '—', hidden: true }
  ], [])

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dépenses</h1>
          <p className="text-muted-foreground">Charges du magasin : STEG, SONEDE, loyer, salaires et dépenses diverses.</p>
        </div>
        <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Nouvelle dépense</Button>
      </header>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border xl:grid-cols-4">
        <Stat label="À payer" value={formatMoney(stats.dueTotal)} hint={`${due.length} facture${due.length > 1 ? 's' : ''}`} />
        <Stat label="En retard" value={formatMoney(stats.late.reduce((s, r) => s + r.amount, 0))} hint={`${stats.late.length} facture${stats.late.length > 1 ? 's' : ''}`} danger={stats.late.length > 0} />
        <Stat label="Payé ce mois" value={formatMoney(stats.paidMonth)} />
        <Stat label="Sorti de la caisse aujourd’hui" value={formatMoney(stats.cashToday)} />
      </section>

      <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
        {([['due', `À payer (${due.length})`], ['all', 'Toutes les dépenses']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={cn('rounded-md px-4 py-2 text-sm font-medium', tab === id ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
        ))}
      </div>

      {tab === 'due' && (due.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">Aucune facture à payer.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {due.map((e) => {
            const d = dueText(e.dueDate ?? e.expenseDate)
            return (
              <li key={e.id} className="flex items-center gap-4 px-5 py-3.5">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: e.categoryColor }} />
                <button onClick={() => setEditing(e)} className="min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{e.label}</span>
                    {e.generated && <Badge title="Créée automatiquement d’après la dernière facture : vérifiez le montant à réception.">Estimation</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {e.categoryName}{e.payee ? `, ${e.payee}` : ''}, avant le {fmtDate(e.dueDate ?? e.expenseDate)}{' '}
                    <span className={cn('font-medium', d.tone === 'danger' && 'text-destructive', d.tone === 'warning' && 'text-warning')}>({d.text})</span>
                  </div>
                </button>
                <span className="tnum text-lg font-semibold">{formatMoney(e.amount)}</span>
                <Button size="sm" onClick={() => setPaying(e)}><Banknote className="h-4 w-4" />Payer</Button>
              </li>
            )
          })}
        </ul>
      ))}

      {tab === 'all' && (
        <DataGrid id="depenses" data={rows} columns={cols} exportName="depenses" onRowClick={setEditing}
          searchPlaceholder="Rechercher un libellé, un bénéficiaire, un n° de facture…"
          presets={[
            { label: 'Ce mois', filters: { expenseDate: datePreset('month') } },
            { label: 'Mois dernier', filters: { expenseDate: datePreset('lastmonth') } },
            { label: 'À payer', filters: { status: 'a_payer' } },
            { label: 'Cette année', filters: { expenseDate: datePreset('year') } }
          ]}
          emptyText="Aucune dépense enregistrée." />
      )}

      <ExpenseDialog target={editing} cats={cats} cfg={cfg} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      <PayDialog expense={paying} cfg={cfg} onClose={() => setPaying(null)} onPaid={() => { setPaying(null); load() }} />
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

type Cfg = ReturnType<typeof useAppConfig>

function MethodFields({ cfg, method, setMethod, fromCash, setFromCash }: {
  cfg: Cfg; method: ExpenseMethod; setMethod: (m: ExpenseMethod) => void; fromCash: boolean; setFromCash: (b: boolean) => void
}) {
  return (
    <>
      <div>
        <Label>Mode de paiement</Label>
        <Select value={method} onChange={(e) => { setMethod(e.target.value as ExpenseMethod); if (e.target.value !== 'especes') setFromCash(false) }}>
          {cfg.expenseMethods.map((m) => <option key={m} value={m}>{EXPENSE_METHOD_LABELS[m as ExpenseMethod] ?? m}</option>)}
        </Select>
      </div>
      {cfg.expenseCashEnabled && method === 'especes' && (
        <label className="col-span-2 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 accent-[hsl(var(--primary))]" checked={fromCash} onChange={(e) => setFromCash(e.target.checked)} />
          <span>Payée avec l’argent de la caisse<span className="block text-xs text-muted-foreground">Le montant est retiré des espèces attendues dans le tiroir (accueil).</span></span>
        </label>
      )}
    </>
  )
}

// ---------- Saisie / modification ----------
function ExpenseDialog({ target, cats, cfg, onClose, onSaved }: {
  target: Expense | 'new' | null; cats: ExpenseCategory[]; cfg: Cfg; onClose: () => void; onSaved: () => void
}) {
  const existing = target && target !== 'new' ? target : null
  const [f, setF] = useState<ExpenseInput>({ categoryId: 0, label: '', amount: 0, expenseDate: today(), paid: false })
  const [method, setMethod] = useState<ExpenseMethod>('especes')
  const [fromCash, setFromCash] = useState(false)
  const [att, setAtt] = useState<{ data: string | null; name: string | null } | undefined>(undefined) // undefined = inchangée
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const autoLabel = useRef('') // libellé proposé automatiquement (remplacé si on change de catégorie)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!target) return
    setError(''); setSaving(false); setAtt(undefined); setConfirmDelete(false)
    if (existing) {
      setF({ categoryId: existing.categoryId, label: existing.label, payee: existing.payee, reference: existing.reference, amount: existing.amount,
        expenseDate: existing.expenseDate, dueDate: existing.dueDate, paid: existing.status === 'payee', paidDate: existing.paidDate ?? today(), note: existing.note })
      setMethod(existing.method ?? (cfg.expenseDefaultMethod as ExpenseMethod)); setFromCash(existing.fromCash)
      autoLabel.current = ''
    } else {
      const first = cats.find((c) => c.active)
      setF({ categoryId: first?.id ?? 0, label: first?.name ?? '', amount: 0, expenseDate: today(), dueDate: first?.dueDays ? addDays(today(), first.dueDays) : null, paid: false, paidDate: today() })
      setMethod(cfg.expenseDefaultMethod as ExpenseMethod); setFromCash(false)
      autoLabel.current = first?.name ?? ''
    }
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!target) return null
  const set = (patch: Partial<ExpenseInput>) => setF((x) => ({ ...x, ...patch }))
  const choices = cats.filter((c) => c.active || c.id === f.categoryId)
  const cat = cats.find((c) => c.id === f.categoryId)

  function pickCategory(id: number) {
    const c = cats.find((x) => x.id === id)
    const patch: Partial<ExpenseInput> = { categoryId: id }
    if (!f.label || f.label === autoLabel.current) { patch.label = c?.name ?? ''; autoLabel.current = c?.name ?? '' }
    if (c?.dueDays && !existing) patch.dueDate = addDays(f.expenseDate, c.dueDays)
    set(patch)
  }

  async function pickFile(file?: File) {
    if (!file) return
    try { const r = await fileToAttachment(file); setAtt({ data: r.data, name: r.name }); setError('') } catch (e: any) { setError(e.message) }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const input: ExpenseInput = { ...f, method: f.paid ? method : null, fromCash: f.paid && fromCash,
      ...(att !== undefined ? { attachment: att.data, attachmentName: att.name } : {}) }
    const r = existing ? await window.api.expenses.update(existing.id, input) : await window.api.expenses.create(input)
    setSaving(false)
    if (!r.ok) return setError(r.error)
    onSaved()
  }

  async function remove() {
    if (!existing) return
    const r = await window.api.expenses.delete(existing.id)
    if (!r.ok) return setError(r.error)
    onSaved()
  }

  const hasAtt = att !== undefined ? !!att.data : !!existing?.hasAttachment
  const attName = att?.name ?? existing?.attachmentName ?? 'Facture'

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>{existing ? 'Modifier la dépense' : 'Nouvelle dépense'}</DialogTitle>
        <DialogDescription>{cat ? `${cat.name}, ${RECURRENCE_LABELS[cat.recurrence].toLowerCase()}` : 'Choisissez une catégorie.'}</DialogDescription>
        {existing?.generated && (
          <p className="mt-4 flex items-start gap-2 rounded-md bg-warning/15 px-3 py-2 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Échéance préparée automatiquement : corrigez le montant et le n° à réception de la vraie facture.
          </p>
        )}
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ex-cat">Catégorie</Label>
              <Select id="ex-cat" value={f.categoryId} onChange={(e) => pickCategory(Number(e.target.value))}>
                {choices.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (désactivée)'}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="ex-amount">Montant (DT)</Label>
              <Input id="ex-amount" type="number" step="0.001" min="0.001" className="tnum" value={f.amount || ''} onChange={(e) => set({ amount: parseFloat(e.target.value) || 0 })} autoFocus={!existing} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="ex-label">Libellé</Label>
              <Input id="ex-label" value={f.label} onChange={(e) => set({ label: e.target.value })} placeholder="Ex. Facture STEG septembre–octobre" />
            </div>
            <div><Label htmlFor="ex-payee">Bénéficiaire</Label><Input id="ex-payee" value={f.payee ?? ''} onChange={(e) => set({ payee: e.target.value })} placeholder="STEG, propriétaire, employé…" /></div>
            <div><Label htmlFor="ex-ref">N° de facture</Label><Input id="ex-ref" value={f.reference ?? ''} onChange={(e) => set({ reference: e.target.value })} /></div>
            <div><Label htmlFor="ex-date">Date de la facture</Label><Input id="ex-date" type="date" value={f.expenseDate} onChange={(e) => e.target.value && set({ expenseDate: e.target.value })} /></div>
            <div><Label htmlFor="ex-due">À payer avant</Label><Input id="ex-due" type="date" value={f.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || null })} /></div>
          </div>

          <div className="rounded-lg border p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="accent-[hsl(var(--primary))]" checked={f.paid} onChange={(e) => set({ paid: e.target.checked })} />Déjà payée
            </label>
            {f.paid && (
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div><Label htmlFor="ex-paid">Payée le</Label><Input id="ex-paid" type="date" value={f.paidDate ?? today()} onChange={(e) => e.target.value && set({ paidDate: e.target.value })} /></div>
                <MethodFields cfg={cfg} method={method} setMethod={setMethod} fromCash={fromCash} setFromCash={setFromCash} />
              </div>
            )}
          </div>

          <div>
            <Label>Facture (photo ou PDF){cfg.expenseRequireAttachment && ' *'}</Label>
            <div className="flex flex-wrap items-center gap-2">
              {hasAtt ? (
                <>
                  <span className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-sm"><FileText className="h-4 w-4" />{attName}</span>
                  {att === undefined && existing && <Button type="button" size="sm" variant="ghost" onClick={() => window.api.expenses.openAttachment(existing.id)}>Ouvrir</Button>}
                  <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>Remplacer</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAtt({ data: null, name: null })}><Trash2 className="h-4 w-4 text-destructive" />Retirer</Button>
                </>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4" />Joindre la facture</Button>
              )}
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
            </div>
          </div>

          <div><Label htmlFor="ex-note">Note</Label><Textarea id="ex-note" rows={2} value={f.note ?? ''} onChange={(e) => set({ note: e.target.value })} /></div>

          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between gap-2">
            {existing ? (confirmDelete
              ? <span className="flex items-center gap-2 text-sm">Supprimer définitivement ?<Button type="button" size="sm" variant="destructive" onClick={remove}>Oui, supprimer</Button><Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Non</Button></span>
              : <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4 text-destructive" />Supprimer</Button>)
              : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
              <Button type="submit" disabled={saving || !f.categoryId}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Enregistrer</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Paiement rapide ----------
function PayDialog({ expense, cfg, onClose, onPaid }: { expense: Expense | null; cfg: Cfg; onClose: () => void; onPaid: () => void }) {
  const [amount, setAmount] = useState(0)
  const [date, setDate] = useState(today())
  const [method, setMethod] = useState<ExpenseMethod>('especes')
  const [fromCash, setFromCash] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!expense) return
    setAmount(expense.amount); setDate(today()); setMethod(cfg.expenseDefaultMethod as ExpenseMethod); setFromCash(false); setError(''); setSaving(false)
  }, [expense]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!expense) return null
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const r = await window.api.expenses.pay(expense!.id, { paidDate: date, method, amount, fromCash })
    setSaving(false)
    if (!r.ok) return setError(r.error)
    onPaid()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Payer la dépense</DialogTitle>
        <DialogDescription>{expense.label}, {expense.categoryName}</DialogDescription>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pay-amount">Montant payé (DT)</Label>
              <Input id="pay-amount" type="number" step="0.001" min="0.001" className="tnum" value={amount || ''} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} autoFocus />
            </div>
            <div><Label htmlFor="pay-date">Payée le</Label><Input id="pay-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
            <MethodFields cfg={cfg} method={method} setMethod={setMethod} fromCash={fromCash} setFromCash={setFromCash} />
          </div>
          {expense.recurrence !== 'aucune' && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground"><Wallet className="mt-0.5 h-4 w-4 shrink-0" />
              Charge {RECURRENCE_LABELS[expense.recurrence].toLowerCase()} : l’échéance suivante sera préparée si l’option est activée dans les Paramètres.</p>
          )}
          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}Marquer comme payée</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
