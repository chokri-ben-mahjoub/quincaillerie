import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, FileText, ImagePlus, Percent, Plus, ShoppingCart, Trash2, Warehouse, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatDocNumber, type SettingsMap } from '@shared/settings'
import { PAY_LABELS, UNITS, type PayMethod } from '@shared/types'

// ---------- Organisation en onglets ----------
const TABS = [
  { id: 'societe', label: 'Société', icon: Building2, ready: true },
  { id: 'documents', label: 'Documents', icon: FileText, ready: true },
  { id: 'taxes', label: 'Taxes', icon: Percent, ready: true },
  { id: 'ventes', label: 'Ventes', icon: ShoppingCart, ready: true },
  { id: 'stock', label: 'Stock', icon: Warehouse, ready: true },
  { id: 'impression', label: 'Impression', ready: false },
  { id: 'partage', label: 'Partage', ready: false },
  { id: 'utilisateurs', label: 'Utilisateurs / droits', ready: false },
  { id: 'sauvegarde', label: 'Sauvegarde', ready: false },
  { id: 'listes', label: 'Listes', ready: false }
] as const
type TabId = (typeof TABS)[number]['id']

// Props communes des onglets : valeur courante (brouillon), modification, valeur enregistrée.
interface TabProps { v: SettingsMap; set: (key: string, value: string) => void }

const DOC_KINDS = [
  { id: 'facture', label: 'Facture' }, { id: 'devis', label: 'Devis' },
  { id: 'bon_commande', label: 'Bon de commande' }, { id: 'bon_livraison', label: 'Bon de livraison' }
] as const

// ---------- Petits composants ----------
const Card = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className="rounded-lg border bg-card p-6 shadow-soft">
    <h2 className="font-semibold">{title}</h2>
    {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    <div className="mt-5">{children}</div>
  </section>
)

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-input')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
      <span><span className="text-sm font-medium">{label}</span>{hint && <span className="block text-sm text-muted-foreground">{hint}</span>}</span>
    </label>
  )
}

// ---------- Onglet Société ----------
function SocieteTab({ v, set }: TabProps) {
  const text = (key: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, span = '') => (
    <div className={span}><Label>{label}</Label><Input value={v[key] ?? ''} onChange={(e) => set(key, e.target.value)} {...props} /></div>
  )

  function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 1_000_000) return alert('Logo trop volumineux (1 Mo maximum).')
    const reader = new FileReader()
    reader.onload = () => set('company_logo', String(reader.result)) // stocké dans la base : inclus dans les sauvegardes
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-6">
      <Card title="Logo" hint="Imprimé en en-tête des factures, devis, bons et tickets.">
        <div className="flex items-center gap-5">
          <div className="flex h-24 w-48 items-center justify-center overflow-hidden rounded-lg border bg-white">
            {v.company_logo ? <img src={v.company_logo} alt="Logo" className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-7 w-7 text-muted-foreground" />}
          </div>
          <div className="space-y-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium hover:bg-muted">
              <ImagePlus className="h-4 w-4" />Choisir un logo
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={pickLogo} />
            </label>
            {v.company_logo && <div><Button variant="ghost" size="sm" onClick={() => set('company_logo', '')}><Trash2 className="h-4 w-4 text-destructive" />Retirer</Button></div>}
            <p className="text-xs text-muted-foreground">PNG, JPG ou SVG — 1 Mo maximum.</p>
          </div>
        </div>
      </Card>

      <Card title="Identité de la société">
        <div className="grid grid-cols-2 gap-4">
          {text('company_name', 'Raison sociale', {}, 'col-span-2')}
          {text('company_mf', 'Matricule fiscal', { placeholder: '1234567/A/M/000' })}
          {text('company_rc', 'Registre de commerce', { placeholder: 'B0123452020' })}
          <div className="col-span-2"><Label>Adresse</Label><Textarea value={v.company_address} onChange={(e) => set('company_address', e.target.value)} className="min-h-[64px]" /></div>
          {text('company_phone', 'Téléphone', { placeholder: '+216 73 000 000' })}
          {text('company_email', 'E-mail')}
          {text('company_website', 'Site web', {}, 'col-span-2')}
        </div>
      </Card>

      <Card title="Coordonnées bancaires" hint="Le RIB est imprimé sur les factures.">
        <div className="grid grid-cols-2 gap-4">
          {text('company_bank', 'Banque')}
          {text('company_rib', 'RIB', { className: 'font-mono', placeholder: '08 006 0123456789012 34' })}
        </div>
      </Card>
    </div>
  )
}

// ---------- Onglet Documents ----------
const SWATCHES = ['#14213d', '#1d4ed8', '#0f766e', '#166534', '#c2410c', '#b91c1c', '#7c2d12', '#4b5563']

function DocumentsTab({ v, set }: TabProps) {
  const year = new Date().getFullYear()
  const example = (kind: string) =>
    formatDocNumber({ prefix: v['doc_prefix_' + kind] || '?', separator: v.doc_separator, includeYear: v.doc_include_year === '1',
      digits: Number(v.doc_number_digits) || 4 }, year, 1)

  return (
    <div className="space-y-6">
      <Card title="Numérotation" hint="Le numéro définitif est attribué à la validation du document : il est continu, sans trou.">
        <div className="space-y-3">
          {DOC_KINDS.map((k) => (
            <div key={k.id} className="grid grid-cols-[1fr_8rem_12rem] items-center gap-4">
              <span className="text-sm font-medium">{k.label}</span>
              <Input value={v['doc_prefix_' + k.id]} maxLength={6} className="font-mono uppercase" onChange={(e) => set('doc_prefix_' + k.id, e.target.value.toUpperCase())} />
              <Badge className="justify-center font-mono">{example(k.id)}</Badge>
            </div>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 border-t pt-5">
          <div><Label>Séparateur</Label>
            <Select value={v.doc_separator} onChange={(e) => set('doc_separator', e.target.value)}>
              {['-', '/', '.', '_'].map((s) => <option key={s} value={s}>{s === '-' ? 'Tiret ( - )' : s === '/' ? 'Barre oblique ( / )' : s === '.' ? 'Point ( . )' : 'Tiret bas ( _ )'}</option>)}
            </Select></div>
          <div><Label>Nombre de chiffres du compteur</Label>
            <Select value={v.doc_number_digits} onChange={(e) => set('doc_number_digits', e.target.value)}>
              {[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} chiffres</option>)}
            </Select></div>
          <Switch checked={v.doc_include_year === '1'} onChange={(b) => set('doc_include_year', b ? '1' : '0')} label="Inclure l’année dans le numéro" />
          <Switch checked={v.doc_reset_yearly === '1'} onChange={(b) => set('doc_reset_yearly', b ? '1' : '0')} label="Repartir à 1 chaque année"
            hint="Désactivé : le compteur continue d’une année à l’autre." />
        </div>
      </Card>

      <Card title="Valeurs par défaut" hint="Date proposée automatiquement dans les nouveaux documents (0 = aucune).">
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Validité d’un devis (jours)</Label>
            <Input type="number" min={0} max={365} value={v.doc_quote_validity_days} onChange={(e) => set('doc_quote_validity_days', e.target.value)} /></div>
          <div><Label>Échéance d’une facture (jours)</Label>
            <Input type="number" min={0} max={365} value={v.doc_invoice_due_days} onChange={(e) => set('doc_invoice_due_days', e.target.value)} /></div>
        </div>
      </Card>

      <Card title="Conditions" hint="Texte imprimé sous les totaux, par type de document (conditions de règlement, garantie, délais…).">
        <div className="grid grid-cols-2 gap-4">
          {DOC_KINDS.map((k) => (
            <div key={k.id}><Label>{k.label}</Label>
              <Textarea value={v['doc_conditions_' + k.id]} onChange={(e) => set('doc_conditions_' + k.id, e.target.value)} /></div>
          ))}
        </div>
      </Card>

      <Card title="Pied de page" hint="Mention affichée en bas de tous les documents et des tickets (ex. mentions légales, remerciements).">
        <Textarea value={v.company_footer} onChange={(e) => set('company_footer', e.target.value)} />
      </Card>

      <Card title="Couleur des documents" hint="Couleur d’accent : en-têtes de tableau, titres et bandeau du total.">
        <div className="flex flex-wrap items-center gap-3">
          {SWATCHES.map((c) => (
            <button key={c} type="button" title={c} onClick={() => set('doc_accent_color', c)} style={{ background: c }}
              className={cn('h-9 w-9 rounded-full ring-offset-2 ring-offset-card transition', v.doc_accent_color === c ? 'ring-2 ring-foreground' : 'hover:scale-110')} />
          ))}
          <input type="color" value={v.doc_accent_color} onChange={(e) => set('doc_accent_color', e.target.value)} className="h-9 w-12 cursor-pointer rounded border bg-card" aria-label="Couleur personnalisée" />
          <Input value={v.doc_accent_color} onChange={(e) => set('doc_accent_color', e.target.value)} className="w-28 font-mono" />
        </div>
        <div className="mt-5 overflow-hidden rounded-md border">
          <div className="grid grid-cols-[1fr_5rem_8rem] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white" style={{ background: v.doc_accent_color }}>
            <span>Désignation</span><span className="text-right">Qté</span><span className="text-right">Total HT</span>
          </div>
          <div className="grid grid-cols-[1fr_5rem_8rem] px-3 py-2 text-sm"><span>Exemple d’article</span><span className="text-right">2</span><span className="text-right">25,000</span></div>
          <div className="px-3 py-2 text-right text-sm font-semibold text-white" style={{ background: v.doc_accent_color }}>NET À PAYER 25,000 DT</div>
        </div>
      </Card>
    </div>
  )
}

// ---------- Onglet Taxes ----------
function TaxesTab({ v, set }: TabProps) {
  const rates = useMemo(() => v.tax_rates.split(',').map(Number).filter((n) => Number.isFinite(n)), [v.tax_rates])
  const [newRate, setNewRate] = useState('')
  const setRates = (list: number[]) => set('tax_rates', [...new Set(list)].sort((a, b) => a - b).join(','))
  const defaultRate = Number(v.tax_default_rate)
  const exTtc = 119
  const exHt = v.tax_prices_mode === 'TTC' ? exTtc / (1 + defaultRate / 100) : 100

  function addRate() {
    const n = Number(newRate.replace(',', '.'))
    if (newRate.trim() === '' || !Number.isFinite(n) || n < 0 || n > 100) return
    setRates([...rates, n]); setNewRate('')
  }

  return (
    <div className="space-y-6">
      <Card title="Taux de TVA" hint="Taux proposés dans les factures, devis et bons. En Tunisie : 0 %, 7 %, 13 % et 19 %.">
        <div className="flex flex-wrap items-center gap-2">
          {rates.map((r) => (
            <span key={r} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium', r === defaultRate && 'border-primary bg-primary/10 text-primary')}>
              {r} %
              {r !== defaultRate && rates.length > 1 && <button type="button" title="Retirer" onClick={() => setRates(rates.filter((x) => x !== r))}><X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" /></button>}
            </span>
          ))}
          <div className="flex items-center gap-2">
            <Input value={newRate} onChange={(e) => setNewRate(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRate())} placeholder="Nouveau taux" className="h-9 w-32" />
            <Button type="button" variant="outline" size="sm" onClick={addRate}><Plus className="h-4 w-4" />Ajouter</Button>
          </div>
        </div>
        <div className="mt-5 w-64">
          <Label>Taux par défaut</Label>
          <Select value={v.tax_default_rate} onChange={(e) => set('tax_default_rate', e.target.value)}>
            {rates.map((r) => <option key={r} value={r}>{r} %</option>)}
          </Select>
        </div>
      </Card>

      <Card title="Prix du catalogue" hint="Comment sont saisis les prix de vente des articles ? Ce réglage sert quand un article est ajouté à un document.">
        <div className="grid grid-cols-2 gap-4">
          {(['HT', 'TTC'] as const).map((m) => (
            <button key={m} type="button" onClick={() => set('tax_prices_mode', m)}
              className={cn('rounded-lg border p-4 text-left transition', v.tax_prices_mode === m ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted')}>
              <div className="font-semibold">Prix {m === 'HT' ? 'hors taxe (HT)' : 'toutes taxes comprises (TTC)'}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {m === 'HT' ? 'Le prix de l’article est repris tel quel, la TVA est ajoutée.' : 'La TVA est extraite du prix pour obtenir le prix HT de la ligne.'}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm">
          Exemple : un article à <b>{v.tax_prices_mode === 'TTC' ? exTtc.toFixed(3) : '100,000'}</b> sur un document devient
          <b> {exHt.toFixed(3)}</b> HT, soit <b>{(exHt * (1 + defaultRate / 100)).toFixed(3)}</b> TTC à {defaultRate} %.
        </p>
      </Card>

      <Card title="Droit de timbre fiscal" hint="Ajouté au total des factures (1,000 DT en Tunisie).">
        <div className="grid grid-cols-2 items-end gap-6">
          <div><Label>Montant (DT)</Label>
            <Input type="number" step="0.001" min={0} value={v.tax_timbre_amount} onChange={(e) => set('tax_timbre_amount', e.target.value)} /></div>
          <Switch checked={v.tax_timbre_default === '1'} onChange={(b) => set('tax_timbre_default', b ? '1' : '0')}
            label="Appliquer par défaut" hint="Case cochée sur chaque nouvelle facture." />
        </div>
      </Card>
    </div>
  )
}

// ---------- Onglet Ventes ----------
function VentesTab({ v, set }: TabProps) {
  const methods = v.sales_payment_methods.split(',').filter(Boolean)
  const toggle = (m: string, on: boolean) => {
    const next = on ? [...methods, m] : methods.filter((x) => x !== m)
    if (!next.length) return // au moins un mode de paiement
    set('sales_payment_methods', next.join(','))
    if (!next.includes(v.sales_default_method)) set('sales_default_method', next[0])
  }
  return (
    <div className="space-y-6">
      <Card title="Remises" hint="Limite appliquée aux caissiers. Le gérant et l’administrateur n’ont pas de limite.">
        <div className="w-64">
          <Label>Remise maximale (% du total)</Label>
          <Input type="number" min={0} max={100} value={v.sales_max_discount_pct} onChange={(e) => set('sales_max_discount_pct', e.target.value)} />
          <p className="mt-1.5 text-xs text-muted-foreground">0 = aucune remise autorisée à la caisse.</p>
        </div>
      </Card>

      <Card title="Modes de paiement" hint="Modes proposés à la caisse. Le crédit demande un client avec un plafond.">
        <div className="space-y-3">
          {(Object.keys(PAY_LABELS) as PayMethod[]).map((m) => (
            <Switch key={m} checked={methods.includes(m)} onChange={(on) => toggle(m, on)} label={PAY_LABELS[m]} />
          ))}
        </div>
        <div className="mt-5 w-64">
          <Label>Mode par défaut</Label>
          <Select value={v.sales_default_method} onChange={(e) => set('sales_default_method', e.target.value)}>
            {methods.map((m) => <option key={m} value={m}>{PAY_LABELS[m as PayMethod]}</option>)}
          </Select>
        </div>
      </Card>

      <Card title="Stock insuffisant">
        <Switch checked={v.sales_allow_below_stock === '1'} onChange={(b) => set('sales_allow_below_stock', b ? '1' : '0')}
          label="Autoriser la vente sous stock" hint="Permet de vendre un article dont le stock est insuffisant : le stock devient négatif jusqu’à la prochaine réception." />
      </Card>

      <Card title="Crédit clients">
        <div className="w-64">
          <Label>Plafond proposé pour un nouveau client (DT)</Label>
          <Input type="number" step="0.001" min={0} value={v.sales_credit_default_limit} onChange={(e) => set('sales_credit_default_limit', e.target.value)} />
          <p className="mt-1.5 text-xs text-muted-foreground">0 = pas de crédit par défaut.</p>
        </div>
      </Card>
    </div>
  )
}

// ---------- Onglet Stock ----------
function StockTab({ v, set }: TabProps) {
  const min = 10
  const margin = Number(v.stock_alert_margin_pct) || 0
  return (
    <div className="space-y-6">
      <Card title="Nouveaux articles" hint="Valeurs proposées à la création d’un article et à l’import Excel quand la colonne est vide.">
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Seuil d’alerte par défaut</Label>
            <Input type="number" min={0} step="0.001" value={v.stock_default_min} onChange={(e) => set('stock_default_min', e.target.value)} /></div>
          <div><Label>Unité par défaut</Label>
            <Select value={v.stock_default_unit} onChange={(e) => set('stock_default_unit', e.target.value)}>
              {UNITS.map((u) => <option key={u}>{u}</option>)}
            </Select></div>
        </div>
      </Card>

      <Card title="Alertes de stock" hint="Un article passe en alerte quand son stock atteint le seuil ; la rupture (stock ≤ 0) est toujours signalée.">
        <div className="space-y-5">
          <Switch checked={v.stock_alerts_enabled === '1'} onChange={(b) => set('stock_alerts_enabled', b ? '1' : '0')}
            label="Activer les alertes de stock bas" hint="Badges orange, compteur « Stock faible » et onglet Alertes du module Stock." />
          <div className={cn('w-64', v.stock_alerts_enabled !== '1' && 'pointer-events-none opacity-50')}>
            <Label>Prévenir à l’avance (+ %)</Label>
            <Input type="number" min={0} max={200} value={v.stock_alert_margin_pct} onChange={(e) => set('stock_alert_margin_pct', e.target.value)} />
          </div>
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            Exemple : un article avec un seuil de <b>{min}</b> passe en alerte dès <b>{(min * (1 + margin / 100)).toLocaleString('fr-FR', { maximumFractionDigits: 3 })}</b> en stock.
          </p>
        </div>
      </Card>
    </div>
  )
}

// ---------- Page ----------
export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>('societe')
  const [saved, setSaved] = useState<SettingsMap | null>(null)
  const [draft, setDraft] = useState<SettingsMap>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await window.api.settings.getAll()
    if (r.ok) { setSaved(r.data); setDraft(r.data) } else setError(r.error)
  }, [])
  useEffect(() => { load() }, [load])

  const dirty = useMemo(() => (saved ? Object.keys(draft).filter((k) => draft[k] !== saved[k]) : []), [draft, saved])
  const set = (key: string, value: string) => { setNotice(''); setDraft((d) => ({ ...d, [key]: value })) }

  async function save() {
    setBusy(true); setError('')
    const r = await window.api.settings.set(Object.fromEntries(dirty.map((k) => [k, draft[k]])))
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setSaved(r.data); setDraft(r.data); setNotice('Paramètres enregistrés.')
  }

  if (!saved) return <div className="p-8 text-muted-foreground">{error || 'Chargement…'}</div>
  const props: TabProps = { v: draft, set }

  return (
    <div className="mx-auto max-w-[1200px] p-8 pb-28">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
        <p className="text-muted-foreground">Réglages de la société et des documents. Tous les modules lisent ces valeurs.</p>
      </header>

      <div className="grid grid-cols-[14rem_1fr] gap-8">
        <nav className="space-y-1">
          {TABS.map((t) => (
            <button key={t.id} disabled={!t.ready} onClick={() => setTab(t.id)}
              className={cn('flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors',
                tab === t.id ? 'bg-card shadow-soft ring-1 ring-border' : 'text-muted-foreground hover:bg-muted', !t.ready && 'cursor-not-allowed opacity-50 hover:bg-transparent')}>
              {t.label}{!t.ready && <span className="text-[10px] uppercase tracking-wide">Bientôt</span>}
            </button>
          ))}
        </nav>

        <div>
          {tab === 'societe' && <SocieteTab {...props} />}
          {tab === 'documents' && <DocumentsTab {...props} />}
          {tab === 'taxes' && <TaxesTab {...props} />}
          {tab === 'ventes' && <VentesTab {...props} />}
          {tab === 'stock' && <StockTab {...props} />}
        </div>
      </div>

      {(dirty.length > 0 || error || notice) && (
        <div className="fixed bottom-0 left-64 right-0 z-30 border-t bg-card/95 px-8 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4">
            <div className="text-sm">
              {error ? <span className="whitespace-pre-line text-destructive">{error}</span>
                : notice ? <span className="text-success">{notice}</span>
                : <span className="text-muted-foreground">{dirty.length} modification(s) non enregistrée(s)</span>}
            </div>
            {dirty.length > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setDraft(saved); setError('') }}>Annuler</Button>
                <Button onClick={save} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
