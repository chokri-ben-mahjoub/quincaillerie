import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Eye, History, Loader2, Lock, LockOpen, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label, Textarea } from '@/components/ui/input'
import { useAppConfig } from '@/lib/useAppConfig'
import { cn, fmtDate, formatMoney } from '@/lib/utils'
import type { CashBreakdown, CashSession, CashSessionDetail } from '@shared/cash'

const time = (t: string | null) => (t ? t.slice(11, 16) : '')
const when = (t: string | null) => (t ? `${fmtDate(t)} ${time(t)}` : '—')
const denomLabel = (v: number) => (v >= 1 ? `${v} DT` : `${Math.round(v * 1000)} millimes`)
const round3 = (n: number) => Math.round(n * 1000) / 1000

/** Barre d'état de la caisse, en haut de l'écran Caisse : ouverture, apports / retraits, clôture, historique. */
export function CashSessionBar() {
  const [s, setS] = useState<CashSessionDetail | null | undefined>(undefined)
  const [dialog, setDialog] = useState<'open' | 'move' | 'close' | 'history' | null>(null)
  const load = useCallback(async () => { const r = await window.api.cash.current(); if (r.ok) setS(r.data) }, [])
  useEffect(() => { load() }, [load])
  const done = () => { setDialog(null); load() }
  if (s === undefined) return null
  const stale = !!s && s.openedAt.slice(0, 10) < new Date().toLocaleDateString('sv-SE')

  return (
    <>
      <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-2.5 text-sm', !s && 'border-dashed', stale && 'border-warning/50 bg-warning/10')}>
        {s ? (
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
            <span><span className="font-medium">Caisse ouverte</span> {stale ? `depuis le ${when(s.openedAt)}` : `depuis ${time(s.openedAt)}`}
              {s.openedBy ? ` par ${s.openedBy}` : ''}, fond {formatMoney(s.openingFloat)}</span>
            {stale && <span className="font-medium text-warning">: pensez à la clôturer</span>}
          </span>
        ) : (
          <span className="flex items-center gap-2 text-muted-foreground"><Lock className="h-4 w-4" />Caisse fermée</span>
        )}
        <span className="flex-1" />
        {s ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setDialog('move')}><ArrowDownToLine className="h-4 w-4" />Apport / retrait</Button>
            <Button size="sm" variant="outline" onClick={() => setDialog('close')}><Lock className="h-4 w-4" />Clôturer la caisse</Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setDialog('open')}><LockOpen className="h-4 w-4" />Ouvrir la caisse</Button>
        )}
        <Button size="sm" variant="ghost" title="Historique des clôtures" onClick={() => setDialog('history')}><History className="h-4 w-4" /></Button>
      </div>
      <OpenDialog open={dialog === 'open'} onClose={() => setDialog(null)} onDone={done} />
      {s && <MoveDialog open={dialog === 'move'} expected={s.breakdown.expected} onClose={() => setDialog(null)} onDone={done} />}
      {s && <CloseDialog open={dialog === 'close'} session={s} onClose={() => setDialog(null)} onDone={done} />}
      <HistoryDialog open={dialog === 'history'} onClose={() => setDialog(null)} />
    </>
  )
}

function OpenDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const cfg = useAppConfig()
  const [amount, setAmount] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setAmount(cfg.cashDefaultFloat); setError('') } }, [open, cfg.cashDefaultFloat])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const r = await window.api.cash.open(amount)
    if (!r.ok) return setError(r.error)
    onDone()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Ouvrir la caisse</DialogTitle>
        <DialogDescription>Comptez la monnaie laissée dans le tiroir pour démarrer la journée.</DialogDescription>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div><Label htmlFor="cs-float">Fond de caisse (DT)</Label>
            <Input id="cs-float" type="number" step="0.001" min="0" className="tnum h-12 text-lg" autoFocus value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} /></div>
          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit"><LockOpen className="h-4 w-4" />Ouvrir</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function MoveDialog({ open, expected, onClose, onDone }: { open: boolean; expected: number; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<'apport' | 'retrait'>('retrait')
  const [amount, setAmount] = useState(0)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setType('retrait'); setAmount(0); setReason(''); setError('') } }, [open])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const r = await window.api.cash.move(type, amount, reason)
    if (!r.ok) return setError(r.error)
    onDone()
  }
  const reasons = type === 'retrait' ? ['Versement banque', 'Mise au coffre', 'Paiement fournisseur'] : ['Monnaie', 'Complément de fond']
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Apport ou retrait d’espèces</DialogTitle>
        <DialogDescription>Environ {formatMoney(expected)} attendus dans le tiroir.</DialogDescription>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {([['retrait', 'Retrait', ArrowUpFromLine], ['apport', 'Apport', ArrowDownToLine]] as const).map(([v, l, Icon]) => (
              <button key={v} type="button" onClick={() => setType(v)} aria-pressed={type === v}
                className={cn('flex items-center justify-center gap-2 rounded-md border py-2.5 text-sm font-medium', type === v ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>
                <Icon className="h-4 w-4" />{l}
              </button>
            ))}
          </div>
          <div><Label htmlFor="mv-amount">Montant (DT)</Label>
            <Input id="mv-amount" type="number" step="0.001" min="0.001" className="tnum" autoFocus value={amount || ''} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} /></div>
          <div><Label htmlFor="mv-reason">Motif</Label>
            <Input id="mv-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. Versement banque" />
            <div className="mt-2 flex flex-wrap gap-1.5">{reasons.map((r) => <button key={r} type="button" onClick={() => setReason(r)} className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted">{r}</button>)}</div>
          </div>
          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit">Enregistrer</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Lignes du calcul des espèces attendues (seules les lignes non nulles sont montrées). */
function BreakdownRows({ b }: { b: CashBreakdown }) {
  const rows: [string, number, string][] = [
    ['Fond de caisse', b.openingFloat, ''], ['Ventes en espèces', b.cashSales, '+'], ['Acomptes (ventes à crédit)', b.creditAdvances, '+'],
    ['Règlements de crédit', b.creditRepayments, '+'], ['Factures réglées en espèces', b.invoicePayments, '+'], ['Apports', b.deposits, '+'],
    ['Retraits', b.withdrawals, '−'], ['Dépenses payées avec la caisse', b.expenses, '−'], ['Remboursements de ventes annulées', b.refunds, '−']
  ]
  return (
    <dl className="space-y-1 text-sm">
      {rows.filter(([, v], i) => i === 0 || v !== 0).map(([l, v, sign]) => (
        <div key={l} className="flex justify-between gap-4"><dt className="text-muted-foreground">{l}</dt>
          <dd className={cn('tnum', sign === '−' && 'text-destructive')}>{sign}{formatMoney(v)}</dd></div>
      ))}
    </dl>
  )
}

function CloseDialog({ open, session, onClose, onDone }: { open: boolean; session: CashSessionDetail; onClose: () => void; onDone: () => void }) {
  const cfg = useAppConfig()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const [revealed, setRevealed] = useState(false) // comptage à l'aveugle : attendu caché jusqu'à validation
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [fresh, setFresh] = useState<CashSessionDetail>(session)

  useEffect(() => {
    if (!open) return
    setCounts({}); setNote(''); setError(''); setSaving(false); setRevealed(!cfg.cashBlindCount)
    window.api.cash.current().then((r) => r.ok && r.data && setFresh(r.data)) // chiffres à jour au moment de compter
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const counted = useMemo(() => round3(cfg.cashDenominations.reduce((s, v) => s + v * (counts[String(v)] || 0), 0)), [counts, cfg.cashDenominations])
  const expected = fresh.breakdown.expected
  const gap = round3(counted - expected)
  const needNote = Math.abs(gap) > cfg.cashGapTolerance + 1e-9

  async function submit() {
    setSaving(true)
    const r = await window.api.cash.close({ counts, note })
    setSaving(false)
    if (!r.ok) return setError(r.error)
    if (r.data.printError) alert(`Caisse clôturée, mais le ticket n’a pas pu être imprimé : ${r.data.printError}`)
    onDone()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogTitle>Clôturer la caisse</DialogTitle>
        <DialogDescription>Comptez les billets et les pièces du tiroir, puis comparez avec ce que la caisse attend.</DialogDescription>
        <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="pb-2 font-medium">Billet / pièce</th><th className="pb-2 font-medium">Nombre</th><th className="pb-2 text-right font-medium">Total</th></tr></thead>
              <tbody>
                {cfg.cashDenominations.map((v, i) => (
                  <tr key={v}>
                    <td className="py-1 pr-3">{denomLabel(v)}</td>
                    <td className="py-1 pr-3">
                      <Input type="number" min={0} step={1} aria-label={`Nombre de ${denomLabel(v)}`} autoFocus={i === 0} className="tnum h-9 w-24"
                        value={counts[String(v)] || ''} onChange={(e) => setCounts((c) => ({ ...c, [String(v)]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))} />
                    </td>
                    <td className="tnum py-1 text-right text-muted-foreground">{counts[String(v)] ? formatMoney(round3(v * counts[String(v)])) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t"><td className="pt-2 font-semibold" colSpan={2}>Espèces comptées</td><td className="tnum pt-2 text-right text-lg font-semibold">{formatMoney(counted)}</td></tr></tfoot>
            </table>
          </div>

          <div className="space-y-4">
            {revealed ? (
              <>
                <div className="rounded-lg border p-4"><BreakdownRows b={fresh.breakdown} /></div>
                <dl className="space-y-1.5 rounded-lg bg-muted p-4">
                  <div className="flex justify-between"><dt>Espèces attendues</dt><dd className="tnum font-semibold">{formatMoney(expected)}</dd></div>
                  <div className="flex justify-between"><dt>Espèces comptées</dt><dd className="tnum font-semibold">{formatMoney(counted)}</dd></div>
                  <div className="flex justify-between border-t pt-1.5 text-lg"><dt className="font-semibold">Écart</dt>
                    <dd className={cn('tnum font-semibold', gap === 0 ? 'text-success' : needNote ? 'text-destructive' : 'text-warning')}>{gap > 0 ? '+' : ''}{formatMoney(gap)}</dd></div>
                </dl>
                <p className="text-xs text-muted-foreground">
                  Hors tiroir : {formatMoney(fresh.breakdown.cardSales)} par carte, {fresh.breakdown.chequesReceived.count} chèque(s) pour {formatMoney(fresh.breakdown.chequesReceived.total)}.
                </p>
                <div><Label htmlFor="cl-note">Explication de l’écart{needNote ? ' (obligatoire)' : ''}</Label>
                  <Textarea id="cl-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. monnaie rendue en trop" /></div>
              </>
            ) : (
              <div className="flex h-full flex-col items-start justify-center gap-3 rounded-lg border border-dashed p-6">
                <p className="text-sm text-muted-foreground">Comptage à l’aveugle : le montant attendu s’affiche une fois le comptage terminé.</p>
                <Button variant="outline" onClick={() => setRevealed(true)}><Eye className="h-4 w-4" />Valider le comptage</Button>
              </div>
            )}
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button disabled={!revealed || saving || (needNote && !note.trim())} onClick={submit}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}Clôturer la caisse</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function HistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<CashSession[]>([])
  const [sel, setSel] = useState<CashSessionDetail | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { if (open) { setSel(null); setMsg(''); window.api.cash.history().then((r) => r.ok && setRows(r.data)) } }, [open])
  async function reprint(id: number) {
    const r = await window.api.cash.printZ(id)
    setMsg(r.ok ? (r.data ? 'Ticket envoyé à l’imprimante.' : 'Impression annulée.') : r.error)
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogTitle>{sel ? `Clôture n° ${sel.id}` : 'Historique des clôtures'}</DialogTitle>
        <DialogDescription>{sel ? `Du ${when(sel.openedAt)} au ${when(sel.closedAt)}` : 'Les 500 dernières sessions de caisse.'}</DialogDescription>
        {msg && <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">{msg}</p>}
        {sel ? (
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <BreakdownRows b={sel.breakdown} />
              {sel.movements.length > 0 && (
                <ul className="space-y-1 border-t pt-3 text-sm">{sel.movements.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3"><span className="text-muted-foreground">{time(m.createdAt)} {m.type === 'apport' ? 'Apport' : 'Retrait'} : {m.reason}</span>
                    <span className="tnum">{m.type === 'apport' ? '+' : '−'}{formatMoney(m.amount)}</span></li>))}</ul>
              )}
            </div>
            <div className="space-y-3">
              <dl className="space-y-1.5 rounded-lg bg-muted p-4">
                <div className="flex justify-between"><dt>Attendu</dt><dd className="tnum font-semibold">{formatMoney(sel.expected ?? 0)}</dd></div>
                <div className="flex justify-between"><dt>Compté</dt><dd className="tnum font-semibold">{formatMoney(sel.counted ?? 0)}</dd></div>
                <div className="flex justify-between border-t pt-1.5"><dt className="font-semibold">Écart</dt><dd className={cn('tnum font-semibold', (sel.gap ?? 0) === 0 ? 'text-success' : 'text-destructive')}>{(sel.gap ?? 0) > 0 ? '+' : ''}{formatMoney(sel.gap ?? 0)}</dd></div>
              </dl>
              {sel.note && <p className="text-sm"><span className="font-medium">Explication : </span>{sel.note}</p>}
              <p className="text-sm text-muted-foreground">Ouverte par {sel.openedBy ?? '—'}, clôturée par {sel.closedBy ?? '—'}.</p>
              <div className="flex gap-2"><Button variant="outline" onClick={() => setSel(null)}>Retour</Button>{sel.status === 'cloturee' && <Button variant="outline" onClick={() => reprint(sel.id)}><Printer className="h-4 w-4" />Réimprimer le ticket Z</Button>}</div>
            </div>
          </div>
        ) : (
          <div className="mt-4 max-h-[60vh] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground"><tr>
                <th className="px-3 py-2 font-medium">N°</th><th className="px-3 py-2 font-medium">Ouverture</th><th className="px-3 py-2 font-medium">Clôture</th>
                <th className="px-3 py-2 text-right font-medium">Attendu</th><th className="px-3 py-2 text-right font-medium">Compté</th><th className="px-3 py-2 text-right font-medium">Écart</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => window.api.cash.get(r.id).then((x) => x.ok && setSel(x.data))} className="cursor-pointer border-t hover:bg-muted/60">
                    <td className="px-3 py-2">{r.id}</td>
                    <td className="tnum px-3 py-2">{when(r.openedAt)}<div className="text-xs text-muted-foreground">{r.openedBy}</div></td>
                    <td className="tnum px-3 py-2">{r.status === 'ouverte' ? <span className="font-medium text-success">En cours</span> : <>{when(r.closedAt)}<div className="text-xs text-muted-foreground">{r.closedBy}</div></>}</td>
                    <td className="tnum px-3 py-2 text-right">{r.expected === null ? '—' : formatMoney(r.expected)}</td>
                    <td className="tnum px-3 py-2 text-right">{r.counted === null ? '—' : formatMoney(r.counted)}</td>
                    <td className={cn('tnum px-3 py-2 text-right font-semibold', r.gap === null ? '' : r.gap === 0 ? 'text-success' : 'text-destructive')}>{r.gap === null ? '—' : `${r.gap > 0 ? '+' : ''}${formatMoney(r.gap)}`}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Aucune session de caisse pour l’instant.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
