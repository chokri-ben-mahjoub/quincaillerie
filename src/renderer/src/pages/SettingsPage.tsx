import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Database, DatabaseBackup, FolderOpen, ListChecks, ShieldCheck, Printer, Receipt, RefreshCw, Share2, Building2, FileText, ImagePlus, Percent, Plus, ShoppingCart, Trash2, Wand2, Warehouse, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { SHARE_PLACEHOLDERS, formatDocNumber, normalizePhone, renderTemplate, type SettingsMap } from '@shared/settings'
import { PAY_LABELS, type PayMethod } from '@shared/types'
import { PERMISSIONS } from '@shared/permissions'
import BackupPanel from '@/components/BackupPanel'
import type { DemoReport, DemoStats } from '@shared/demo'
import { KIND_LABELS, LINK_LABELS, STATE_LABELS, type PrinterDetection } from '@shared/printers'
import { takeSettingsTab } from '@/lib/searchIntent'

// ---------- Organisation en onglets ----------
const TABS = [
  { id: 'societe', label: 'Société', icon: Building2, ready: true },
  { id: 'documents', label: 'Documents', icon: FileText, ready: true },
  { id: 'taxes', label: 'Taxes', icon: Percent, ready: true },
  { id: 'ventes', label: 'Ventes', icon: ShoppingCart, ready: true },
  { id: 'stock', label: 'Stock', icon: Warehouse, ready: true },
  { id: 'impression', label: 'Impression', icon: Printer, ready: true },
  { id: 'partage', label: 'Partage', icon: Share2, ready: true },
  { id: 'utilisateurs', label: 'Utilisateurs / droits', icon: ShieldCheck, ready: true },
  { id: 'sauvegarde', label: 'Sauvegarde', icon: DatabaseBackup, ready: true },
  { id: 'listes', label: 'Listes', icon: ListChecks, ready: true },
  { id: 'donnees', label: 'Données (démo)', icon: Database, ready: true }
] as const
type TabId = (typeof TABS)[number]['id']

// Props communes des onglets : valeur courante (brouillon), modification, valeur enregistrée.
interface TabProps { v: SettingsMap; set: (key: string, value: string) => void; saved: SettingsMap }

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

      <Card title="Mise en page" hint="Modèle utilisé pour l’aperçu, l’impression et l’export PDF des factures, devis, bons de commande et de livraison.">
        <div className="grid grid-cols-2 gap-3">
          {([
            { id: 'classique', label: 'Classique', hint: 'Cadre client à droite, grille pleine page, récapitulatif TVA et totaux en bas.' },
            { id: 'moderne', label: 'Moderne', hint: 'Bandeaux de couleur, blocs arrondis, totaux à droite.' }
          ] as const).map((m) => (
            <button key={m.id} type="button" onClick={() => set('doc_layout', m.id)}
              className={cn('rounded-lg border p-4 text-left transition', v.doc_layout === m.id ? 'border-primary ring-2 ring-primary/30' : 'hover:bg-muted')}>
              <div className="text-sm font-semibold">{m.label}</div>
              <div className="mt-1 text-sm text-muted-foreground">{m.hint}</div>
            </button>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-5 border-t pt-5">
          <div className="col-span-2"><Label>Titre de l’en-tête</Label>
            <Input value={v.doc_header_title} maxLength={60} placeholder={v.company_name || 'Raison sociale'} onChange={(e) => set('doc_header_title', e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Grand titre en haut à gauche (ex. « QUINCAILLERIE »). Vide : la raison sociale.</p></div>
          <Switch checked={v.doc_show_code === '1'} onChange={(b) => set('doc_show_code', b ? '1' : '0')} label="Colonne « Code » article"
            hint="Code-barres de l’article, retrouvé dans le catalogue (modèle classique)." />
          <Switch checked={v.doc_show_signatures === '1'} onChange={(b) => set('doc_show_signatures', b ? '1' : '0')} label="Cadres de signature"
            hint="Cachet du fournisseur et signature du client en bas du document." />
        </div>
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

      <Card title="Modification des ventes" hint="Une vente encaissée n'est jamais effacée : elle est annulée (le stock est rendu, la dette reprise) ou remplacée par une vente corrigée.">
        <div className="space-y-4">
          <Switch checked={v.sales_allow_edit === '1'} onChange={(b) => set('sales_allow_edit', b ? '1' : '0')}
            label="Autoriser le caissier à modifier ou annuler une vente" hint="Le gérant et l’administrateur peuvent toujours le faire." />
          <div className={cn('w-64', v.sales_allow_edit !== '1' && 'pointer-events-none opacity-50')}>
            <Label>Délai pour le caissier (heures)</Label>
            <Input type="number" min={0} max={720} value={v.sales_cashier_edit_hours} onChange={(e) => set('sales_cashier_edit_hours', e.target.value)} />
            <p className="mt-1.5 text-xs text-muted-foreground">0 = sans limite de temps.</p>
          </div>
        </div>
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
              {v.list_units.split(',').map((u) => <option key={u}>{u}</option>)}
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

// ---------- Onglet Impression ----------
function PrinterSelect({ value, onChange, printers }: { value: string; onChange: (v: string) => void; printers: { name: string; isDefault: boolean }[] }) {
  const known = !value || printers.some((p) => p.name === value)
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Imprimante par défaut de Windows</option>
      {printers.map((p) => <option key={p.name} value={p.name}>{p.name}{p.isDefault ? ' (par défaut)' : ''}</option>)}
      {!known && <option value={value}>{value} (introuvable)</option>}
    </Select>
  )
}

function ImpressionTab({ v, set }: TabProps) {
  const [det, setDet] = useState<PrinterDetection | null>(null)
  const [scanning, setScanning] = useState(false)
  const [msg, setMsg] = useState('')
  const printers = det?.printers ?? []

  const scan = useCallback(async () => {
    setScanning(true)
    const r = await window.api.print.detect()
    setScanning(false)
    if (r.ok) setDet(r.data); else setMsg(r.error)
  }, [])
  useEffect(() => { scan() }, [scan])

  async function test(format: 'a4' | 'ticket') {
    setMsg('')
    const r = await window.api.print.test(format) // utilise les réglages ENREGISTRÉS
    setMsg(r.ok ? (r.data ? 'Page de test envoyée à l’imprimante.' : 'Impression annulée.') : r.error)
  }

  // Configuration proposée par la détection, appliquée au brouillon (il reste à enregistrer).
  const suggestion = det && {
    ticket: det.ticket.suggestion, a4: det.a4.suggestion,
    paper: det.ticket.paperMm ? String(det.ticket.paperMm) : v.print_ticket_paper
  }
  const differs = !!suggestion && (suggestion.ticket !== v.print_ticket_printer || suggestion.a4 !== v.print_a4_printer || suggestion.paper !== v.print_ticket_paper)
  function applySuggestion() {
    if (!suggestion) return
    set('print_ticket_printer', suggestion.ticket); set('print_a4_printer', suggestion.a4); set('print_ticket_paper', suggestion.paper)
    setMsg('Configuration appliquée : cliquez sur « Enregistrer » pour la garder, puis faites une page de test.')
  }
  const useFor = (name: string, usage: 'ticket' | 'a4', paperMm: number | null) => {
    set(usage === 'ticket' ? 'print_ticket_printer' : 'print_a4_printer', name)
    if (usage === 'ticket' && paperMm) set('print_ticket_paper', String(paperMm))
  }

  const block = (prefix: 'print_a4_' | 'print_ticket_', title: string, hint: string, fmt: 'a4' | 'ticket') => (
    <Card title={title} hint={hint}>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2"><Label>Imprimante</Label>
          <PrinterSelect value={v[prefix + 'printer']} onChange={(x) => set(prefix + 'printer', x)} printers={printers} /></div>
        <div><Label>Nombre de copies</Label>
          <Input type="number" min={1} max={10} value={v[prefix + 'copies']} onChange={(e) => set(prefix + 'copies', e.target.value)} /></div>
        {fmt === 'ticket' && (
          <div><Label>Largeur du rouleau</Label>
            <Select value={v.print_ticket_paper} onChange={(e) => set('print_ticket_paper', e.target.value)}>
              <option value="80">80 mm</option><option value="58">58 mm</option>
            </Select></div>
        )}
        <div className="col-span-2"><Switch checked={v[prefix + 'silent'] === '1'} onChange={(b) => set(prefix + 'silent', b ? '1' : '0')}
          label="Impression directe" hint="Envoie à l’imprimante sans boîte de dialogue (imprimante par défaut si aucune n’est choisie)." /></div>
        {fmt === 'ticket' && (
          <div className="col-span-2"><Switch checked={v.print_ticket_auto === '1'} onChange={(b) => set('print_ticket_auto', b ? '1' : '0')}
            label="Imprimer le ticket après chaque vente" hint="Le ticket sort automatiquement à l’encaissement." /></div>
        )}
      </div>
      <div className="mt-5"><Button variant="outline" onClick={() => test(fmt)}><Printer className="h-4 w-4" />Imprimer une page de test</Button></div>
    </Card>
  )

  return (
    <div className="space-y-6">
      {msg && <p className="rounded-md bg-muted px-3 py-2 text-sm">{msg}</p>}

      <Card title="Imprimantes de ce poste" hint="Imprimantes déjà installées sur cet ordinateur, détectées automatiquement avec leur branchement et leur état.">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={scan} disabled={scanning}>
            <RefreshCw className={cn('h-4 w-4', scanning && 'animate-spin')} />{scanning ? 'Détection…' : 'Détecter à nouveau'}
          </Button>
          {differs && <Button size="sm" onClick={applySuggestion}><Wand2 className="h-4 w-4" />Configurer automatiquement</Button>}
          {det && !differs && printers.length > 0 && <span className="flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="h-4 w-4" />Réglages cohérents avec les imprimantes détectées</span>}
        </div>

        {det && v.print_ticket_printer && !printers.some((p) => p.name === v.print_ticket_printer) && (
          <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            L’imprimante de tickets « {v.print_ticket_printer} » n’est plus installée ou n’est pas branchée sur ce poste.
          </p>
        )}
        {det && v.print_a4_printer && !printers.some((p) => p.name === v.print_a4_printer) && (
          <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            L’imprimante A4 « {v.print_a4_printer} » n’est plus installée ou n’est pas branchée sur ce poste.
          </p>
        )}

        {det && printers.length === 0 && (
          <p className="rounded-md bg-warning/15 px-3 py-2 text-sm text-warning">
            Aucune imprimante installée sur ce poste. Branchez l’imprimante, installez son pilote dans Windows (Paramètres › Bluetooth et appareils › Imprimantes), puis cliquez sur « Détecter à nouveau ».
          </p>
        )}

        <ul className="divide-y rounded-lg border">
          {printers.map((p) => {
            const usedTicket = v.print_ticket_printer === p.name
            const usedA4 = v.print_a4_printer === p.name || (!v.print_a4_printer && p.isDefault)
            const Icon = p.kind === 'ticket' ? Receipt : p.kind === 'virtuelle' ? FileText : Printer
            return (
              <li key={p.name} className={cn('flex items-center gap-4 px-4 py-3', p.kind === 'virtuelle' && 'opacity-70')}>
                <Icon className={cn('h-5 w-5 shrink-0', p.kind === 'ticket' ? 'text-primary' : 'text-muted-foreground')} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 font-medium">{p.displayName}</span>
                    <Badge tone={p.state === 'prete' ? 'success' : p.state === 'inconnu' ? 'neutral' : p.state === 'pause' || p.state === 'papier' ? 'warning' : 'danger'}>{STATE_LABELS[p.state]}</Badge>
                    {p.isDefault && <Badge>Par défaut Windows</Badge>}
                    {usedTicket && <Badge tone="primary">Utilisée pour les tickets</Badge>}
                    {usedA4 && p.kind !== 'virtuelle' && <Badge tone="primary">Utilisée pour l’A4</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[KIND_LABELS[p.kind] + (p.paperMm ? ` ${p.paperMm} mm` : ''), LINK_LABELS[p.link] + (p.port && p.link !== 'virtuelle' ? ` (${p.port})` : ''), p.driver && p.driver !== p.displayName ? p.driver : null]
                      .filter(Boolean).join(', ')}
                  </div>
                </div>
                {p.kind === 'ticket' && !usedTicket && <Button size="sm" variant="outline" onClick={() => useFor(p.name, 'ticket', p.paperMm)}>Utiliser pour les tickets</Button>}
                {p.kind === 'a4' && !usedA4 && <Button size="sm" variant="outline" onClick={() => useFor(p.name, 'a4', null)}>Utiliser pour l’A4</Button>}
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Le type (ticket ou A4) est déduit du nom et du pilote. Une imprimante éteinte peut quand même apparaître « Prête » : Windows ne le sait pas toujours, d’où la page de test.
        </p>
      </Card>

      {block('print_a4_', 'Documents A4', 'Factures, devis, bons de commande et de livraison (bouton Imprimer). L’aperçu PDF garde la pagination « Page x / y ».', 'a4')}
      {block('print_ticket_', 'Ticket de caisse', 'Imprimante thermique du comptoir.', 'ticket')}
      <p className="text-sm text-muted-foreground">Le bouton « Page de test » utilise les réglages enregistrés : enregistrez d’abord vos modifications.</p>
    </div>
  )
}

// ---------- Onglet Partage ----------
const SAMPLE = { client: 'Ali Trabelsi', document: 'Facture', numero: 'FA-2026-0001', montant: '110,005', date: '29/10/2026', societe: 'Ma Quincaillerie' }

function PartageTab({ v, set }: TabProps) {
  const [focus, setFocus] = useState<string>('share_whatsapp_message')
  const insert = (name: string) => set(focus, (v[focus] ?? '') + `{${name}}`)
  const area = (key: string, label: string, rows = 'min-h-[110px]') => (
    <div><Label>{label}</Label>
      <Textarea className={rows} value={v[key]} onFocus={() => setFocus(key)} onChange={(e) => set(key, e.target.value)} />
      <div className="mt-2 whitespace-pre-line rounded-md bg-muted px-3 py-2 text-sm"><span className="text-xs uppercase tracking-wide text-muted-foreground">Aperçu</span>{'\n'}{renderTemplate(v[key], SAMPLE)}</div>
    </div>
  )
  return (
    <div className="space-y-6">
      <Card title="Numéros de téléphone" hint="Indicatif ajouté aux numéros saisis sans indicatif (WhatsApp).">
        <div className="grid grid-cols-2 items-end gap-4">
          <div><Label>Indicatif du pays</Label><Input value={v.share_country_code} onChange={(e) => set('share_country_code', e.target.value)} className="font-mono" /></div>
          <p className="rounded-md bg-muted px-3 py-2 text-sm">« 98 123 456 » → <b className="font-mono">{normalizePhone('98 123 456', v.share_country_code || '+216')}</b></p>
        </div>
      </Card>

      <Card title="Canaux de partage">
        <div className="space-y-3">
          <Switch checked={v.share_whatsapp_enabled === '1'} onChange={(b) => set('share_whatsapp_enabled', b ? '1' : '0')} label="WhatsApp" hint="Ouvre WhatsApp avec le message prêt à envoyer." />
          <Switch checked={v.share_email_enabled === '1'} onChange={(b) => set('share_email_enabled', b ? '1' : '0')} label="E-mail" hint="Ouvre votre application de messagerie." />
        </div>
      </Card>

      <Card title="Modèles de message" hint="Cliquez sur une variable pour l’ajouter au texte en cours de saisie.">
        <div className="mb-4 flex flex-wrap gap-2">
          {SHARE_PLACEHOLDERS.map((p) => (
            <button key={p} type="button" onClick={() => insert(p)} className="rounded-full border bg-muted px-3 py-1 font-mono text-xs hover:border-primary hover:text-primary">{`{${p}}`}</button>
          ))}
        </div>
        <div className="space-y-5">
          {area('share_whatsapp_message', 'Message WhatsApp')}
          <div><Label>Objet de l’e-mail</Label>
            <Input value={v.share_email_subject} onFocus={() => setFocus('share_email_subject')} onChange={(e) => set('share_email_subject', e.target.value)} />
            <p className="mt-1.5 text-sm text-muted-foreground">{renderTemplate(v.share_email_subject, SAMPLE)}</p></div>
          {area('share_email_body', 'Corps de l’e-mail', 'min-h-[140px]')}
        </div>
      </Card>
    </div>
  )
}

// ---------- Onglet Sauvegarde ----------
const FREQUENCIES: [string, string][] = [['off', 'Désactivée'], ['6h', 'Toutes les 6 heures'], ['12h', 'Toutes les 12 heures'], ['daily', 'Chaque jour'], ['weekly', 'Chaque semaine']]

function SauvegardeTab({ v, set, saved }: TabProps) {
  async function pick() {
    const r = await window.api.backup.pickDir()
    if (r.ok && r.data) set('backup_dir', r.data)
  }
  return (
    <div className="space-y-6">
      <Card title="Dossier de sauvegarde" hint="Choisissez un disque externe ou une clé USB : une copie sur le même disque ne protège pas d'une panne.">
        <div className="flex gap-2">
          <Input readOnly value={v.backup_dir || 'Dossier par défaut de l’application'} className={cn('font-mono text-[13px]', !v.backup_dir && 'text-muted-foreground')} />
          <Button variant="outline" onClick={pick}><FolderOpen className="h-4 w-4" />Choisir…</Button>
          {v.backup_dir && <Button variant="ghost" onClick={() => set('backup_dir', '')}>Par défaut</Button>}
        </div>
      </Card>

      <Card title="Planification">
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          <div><Label>Fréquence automatique</Label>
            <Select value={v.backup_frequency} onChange={(e) => set('backup_frequency', e.target.value)}>
              {FREQUENCIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </Select></div>
          <div><Label>Copies conservées</Label>
            <Input type="number" min={1} max={365} value={v.backup_keep} onChange={(e) => set('backup_keep', e.target.value)} />
            <p className="mt-1.5 text-xs text-muted-foreground">Les plus anciennes sont supprimées automatiquement.</p></div>
          <div className="col-span-2"><Switch checked={v.backup_on_quit === '1'} onChange={(b) => set('backup_on_quit', b ? '1' : '0')}
            label="Sauvegarder à la fermeture de l’application" hint="Une copie est faite à chaque fois que vous quittez le logiciel (la fermeture peut prendre quelques secondes)." /></div>
        </div>
      </Card>

      <BackupPanel reloadKey={saved.backup_dir + '|' + saved.backup_keep} />
    </div>
  )
}

// ---------- Onglet Listes ----------
function CategoriesManager() {
  const [rows, setRows] = useState<{ id: number; name: string; count: number }[]>([])
  const [newName, setNewName] = useState('')
  const [msg, setMsg] = useState('')
  const load = useCallback(async () => { const r = await window.api.categories.stats(); if (r.ok) setRows(r.data) }, [])
  useEffect(() => { load() }, [load])

  async function act(p: Promise<{ ok: boolean; error?: string }>) {
    const r = await p
    setMsg(r.ok ? '' : r.error ?? 'Erreur')
    load()
  }
  return (
    <Card title="Catégories d’articles" hint="Les modifications de cette liste sont enregistrées immédiatement.">
      {msg && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{msg}</p>}
      <div className="space-y-2">
        {rows.map((c) => (
          <div key={c.id} className="flex items-center gap-3">
            <Input defaultValue={c.name} key={c.name} className="h-9 max-w-sm"
              onBlur={(e) => e.target.value.trim() !== c.name && act(window.api.categories.update(c.id, e.target.value))}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            <Badge>{c.count} article(s)</Badge>
            <Button variant="ghost" size="icon" title="Supprimer" onClick={() =>
              confirm(c.count ? `Supprimer « ${c.name} » ? Ses ${c.count} article(s) passeront « sans catégorie ».` : `Supprimer « ${c.name} » ?`) && act(window.api.categories.remove(c.id))}>
              <Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
        {!rows.length && <p className="text-sm text-muted-foreground">Aucune catégorie.</p>}
      </div>
      <div className="mt-4 flex max-w-sm gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nouvelle catégorie" className="h-9"
          onKeyDown={(e) => e.key === 'Enter' && newName.trim() && (act(window.api.categories.create(newName)), setNewName(''))} />
        <Button variant="outline" size="sm" disabled={!newName.trim()} onClick={() => { act(window.api.categories.create(newName)); setNewName('') }}><Plus className="h-4 w-4" />Ajouter</Button>
      </div>
    </Card>
  )
}

function ListesTab({ v, set }: TabProps) {
  const units = v.list_units.split(',').filter(Boolean)
  const [newUnit, setNewUnit] = useState('')
  const setUnits = (list: string[]) => set('list_units', list.join(','))
  function add() {
    const u = newUnit.trim()
    if (!u || u.includes(',') || units.some((x) => x.toLowerCase() === u.toLowerCase())) return
    setUnits([...units, u]); setNewUnit('')
  }
  return (
    <div className="space-y-6">
      <Card title="Unités de mesure" hint="Unités proposées pour les articles et les lignes de documents. L’unité par défaut (onglet Stock) ne peut pas être retirée.">
        <div className="flex flex-wrap items-center gap-2">
          {units.map((u) => (
            <span key={u} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium', u === v.stock_default_unit && 'border-primary bg-primary/10 text-primary')}>
              {u}
              {u !== v.stock_default_unit && units.length > 1 && <button type="button" title="Retirer" onClick={() => setUnits(units.filter((x) => x !== u))}><X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" /></button>}
            </span>
          ))}
          <div className="flex items-center gap-2">
            <Input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="Nouvelle unité" className="h-9 w-36" />
            <Button type="button" variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" />Ajouter</Button>
          </div>
        </div>
      </Card>
      <CategoriesManager />
    </div>
  )
}

// ---------- Onglet Utilisateurs / droits ----------
function DroitsTab({ v, set }: TabProps) {
  const has = (key: 'perm_gerant' | 'perm_caissier', id: string) => v[key].split(',').includes(id)
  const toggle = (key: 'perm_gerant' | 'perm_caissier', id: string, on: boolean) => {
    const list = v[key].split(',').filter(Boolean).filter((x) => x !== id)
    set(key, (on ? [...list, id] : list).join(','))
  }
  const Check = ({ checked, onChange, disabled }: { checked: boolean; onChange?: (b: boolean) => void; disabled?: boolean }) => (
    <input type="checkbox" className="h-[18px] w-[18px] accent-[hsl(var(--primary))] disabled:opacity-60" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
  )
  return (
    <div className="space-y-6">
      <Card title="Droits par rôle" hint="Cochez les écrans accessibles à chaque rôle. L’administrateur a toujours accès à tout. Les comptes se gèrent dans le menu Utilisateurs.">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 font-medium">Écran</th>
              <th className="w-28 py-2 text-center font-medium">Administrateur</th>
              <th className="w-24 py-2 text-center font-medium">Gérant</th>
              <th className="w-24 py-2 text-center font-medium">Caissier</th>
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-3"><div className="font-medium">{p.label}</div><div className="text-xs text-muted-foreground">{p.hint}</div></td>
                <td className="text-center"><Check checked disabled /></td>
                <td className="text-center"><Check checked={has('perm_gerant', p.id)} onChange={(b) => toggle('perm_gerant', p.id, b)} /></td>
                <td className="text-center"><Check checked={has('perm_caissier', p.id)} onChange={(b) => toggle('perm_caissier', p.id, b)} /></td>
              </tr>
            ))}
            {['Utilisateurs', 'Paramètres et sauvegarde'].map((label) => (
              <tr key={label} className="border-b last:border-0 bg-muted/40">
                <td className="py-3"><div className="font-medium">{label}</div><div className="text-xs text-muted-foreground">Réservé à l’administrateur</div></td>
                <td className="text-center"><Check checked disabled /></td>
                <td className="text-center"><Check checked={false} disabled /></td>
                <td className="text-center"><Check checked={false} disabled /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm">
          Un rôle sans le droit « Caisse » ne peut plus encaisser. Les remises maximales du caissier se règlent dans l’onglet Ventes.
        </p>
      </Card>
    </div>
  )
}

// ---------- Onglet Données (démonstration et remise à zéro) ----------
const STAT_LABELS: [keyof DemoStats, string][] = [['articles', 'Articles'], ['clients', 'Clients'], ['suppliers', 'Fournisseurs'], ['sales', 'Ventes'], ['purchases', 'Achats'],
  ['invoices', 'Factures'], ['quotes', 'Devis'], ['orders', 'Bons de commande'], ['deliveries', 'Bons de livraison'], ['movements', 'Mouvements de stock']]

function DonneesTab() {
  const [stats, setStats] = useState<DemoStats | null>(null)
  const [articles, setArticles] = useState('1000')
  const [partners, setPartners] = useState(true)
  const [purchases, setPurchases] = useState(true)
  const [salesDays, setSalesDays] = useState('60')
  const [documents, setDocuments] = useState(true)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<DemoReport | null>(null)
  const [error, setError] = useState('')
  const [keepSettings, setKeepSettings] = useState(true)
  const [keepUsers, setKeepUsers] = useState(true)
  const [confirmText, setConfirmText] = useState('')
  const [resetMsg, setResetMsg] = useState('')

  const refresh = useCallback(async () => { const r = await window.api.demo.stats(); if (r.ok) setStats(r.data) }, [])
  useEffect(() => { refresh() }, [refresh])

  async function generate() {
    setBusy(true); setError(''); setReport(null)
    await new Promise((r) => setTimeout(r, 50)) // laisse l'écran afficher « Génération en cours… »
    const r = await window.api.demo.generate({ articles: Number(articles), partners, purchases, salesDays: Number(salesDays), documents })
    setBusy(false)
    if (r.ok) setReport(r.data); else setError(r.error)
    refresh()
  }

  async function reset() {
    setBusy(true); setError(''); setResetMsg('')
    const r = await window.api.demo.reset({ keepSettings, keepUsers, confirm: confirmText })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setResetMsg(`Base remise à zéro. Une sauvegarde a été faite avant : ${r.data.backup}. Rechargement…`)
    setConfirmText(''); setReport(null)
    setTimeout(() => window.location.reload(), 1500) // sans comptes conservés : retour à l'écran de première installation
  }

  return (
    <div className="space-y-6">
      <Card title="État actuel de la base">
        <div className="grid grid-cols-5 gap-3">
          {STAT_LABELS.map(([k, label]) => (
            <div key={k} className="rounded-md border bg-muted/40 px-3 py-2.5">
              <div className="tnum text-xl font-semibold">{stats ? stats[k].toLocaleString('fr-FR') : '…'}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Générer des données de démonstration" hint="Articles réalistes de quincaillerie (codes-barres, prix, stocks, alertes) et activité complète pour tester tous les écrans. Les données s’ajoutent à l’existant.">
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          <div><Label>Nombre d’articles</Label>
            <Select value={articles} onChange={(e) => setArticles(e.target.value)}>
              {[0, 100, 250, 500, 1000, 2000].map((n) => <option key={n} value={n}>{n === 0 ? 'Aucun article' : `${n.toLocaleString('fr-FR')} articles`}</option>)}
            </Select></div>
          <div><Label>Historique de ventes</Label>
            <Select value={salesDays} onChange={(e) => setSalesDays(e.target.value)}>
              <option value="0">Aucune vente</option><option value="30">30 derniers jours</option><option value="60">60 derniers jours</option><option value="90">90 derniers jours</option>
            </Select></div>
          <Switch checked={partners} onChange={setPartners} label="Fournisseurs et clients" hint="12 fournisseurs et 45 clients (avec plafonds de crédit)." />
          <Switch checked={purchases} onChange={setPurchases} label="Achats fournisseurs" hint="Réceptions de marchandise datées, dettes partielles." />
          <Switch checked={documents} onChange={setDocuments} label="Documents" hint="Factures, devis (dont convertis), bons de commande et de livraison." />
        </div>
        <div className="mt-6 flex items-center gap-4">
          <Button onClick={generate} disabled={busy}><Database className="h-4 w-4" />{busy ? 'Génération en cours…' : 'Générer la démo'}</Button>
          {busy && <span className="text-sm text-muted-foreground">Quelques secondes, ne fermez pas l’application.</span>}
        </div>
        {report && (
          <p className="mt-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            Terminé en {(report.ms / 1000).toFixed(1)} s : {report.articles} article(s), {report.suppliers} fournisseur(s), {report.clients} client(s), {report.purchases} achat(s),
            {' '}{report.sales} vente(s), {report.clientPayments} règlement(s), {report.invoices} facture(s), {report.quotes} devis, {report.orders} bon(s) de commande, {report.deliveries} bon(s) de livraison.
          </p>
        )}
      </Card>

      <section className="rounded-lg border border-destructive/40 bg-card p-6 shadow-soft">
        <h2 className="font-semibold text-destructive">Vider la base (installation chez un client)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Supprime tous les articles, ventes, achats, clients, fournisseurs, factures et mouvements, et remet les numérotations à 1. La base revient à l’état d’une première installation
          (catégories par défaut). Une sauvegarde est faite automatiquement juste avant.
        </p>
        <div className="mt-5 space-y-3">
          <Switch checked={keepSettings} onChange={setKeepSettings} label="Conserver les paramètres" hint="Société, logo, taxes, documents, droits… (décochez pour tout réinitialiser)." />
          <Switch checked={keepUsers} onChange={setKeepUsers} label="Conserver les comptes utilisateurs" hint="Décochez pour repartir de l’écran de création de l’administrateur." />
        </div>
        <div className="mt-5 flex items-end gap-3">
          <div className="w-64"><Label>Tapez VIDER pour confirmer</Label><Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="VIDER" /></div>
          <Button variant="destructive" disabled={busy || confirmText !== 'VIDER'} onClick={reset}><Trash2 className="h-4 w-4" />Vider la base</Button>
        </div>
        {resetMsg && <p className="mt-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">{resetMsg}</p>}
      </section>

      {error && <p className="whitespace-pre-line rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}

// ---------- Page ----------
export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>(() => (takeSettingsTab() as TabId | null) ?? 'societe') // onglet demandé depuis l'accueil
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
  const props: TabProps = { v: draft, set, saved }

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
          {tab === 'impression' && <ImpressionTab {...props} />}
          {tab === 'partage' && <PartageTab {...props} />}
          {tab === 'sauvegarde' && <SauvegardeTab {...props} />}
          {tab === 'listes' && <ListesTab {...props} />}
          {tab === 'utilisateurs' && <DroitsTab {...props} />}
          {tab === 'donnees' && <DonneesTab />}
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
