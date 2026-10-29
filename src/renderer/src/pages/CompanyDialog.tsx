import { useEffect, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label, Select } from '@/components/ui/input'
import { TVA_RATES, type CompanyInfo } from '@shared/invoice'

/** Réglage des informations société imprimées sur les factures (logo, MF, RC, RIB, timbre...). */
export default function CompanyDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [c, setC] = useState<CompanyInfo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    window.api.company.get().then((r) => r.ok && setC(r.data))
  }, [open])

  if (!c) return null
  const text = (k: keyof CompanyInfo, label: string, span = '') => (
    <div className={span}>
      <Label>{label}</Label>
      <Input value={String(c[k] ?? '')} onChange={(e) => setC({ ...c, [k]: e.target.value })} />
    </div>
  )

  // Le logo est lu en data URL : stocké dans la base, donc inclus dans les sauvegardes.
  function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1_000_000) return setError('Logo trop volumineux (1 Mo maximum).')
    const reader = new FileReader()
    reader.onload = () => setC((cur) => (cur ? { ...cur, logo: String(reader.result) } : cur))
    reader.readAsDataURL(file)
  }

  async function save() {
    const r = await window.api.company.set(c!)
    if (!r.ok) return setError(r.error)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-auto">
        <DialogTitle>Informations de la société</DialogTitle>
        <DialogDescription>Ces informations apparaissent sur toutes les factures imprimées.</DialogDescription>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="col-span-2 flex items-center gap-4 rounded-lg border bg-muted/40 p-4">
            <div className="flex h-20 w-40 items-center justify-center overflow-hidden rounded-md border bg-white">
              {c.logo ? <img src={c.logo} alt="Logo" className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
            </div>
            <div className="space-y-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium hover:bg-muted">
                <ImagePlus className="h-4 w-4" />Choisir un logo
                <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={pickLogo} />
              </label>
              {c.logo && <Button variant="ghost" size="sm" onClick={() => setC({ ...c, logo: '' })}><Trash2 className="h-4 w-4 text-destructive" />Retirer</Button>}
              <p className="text-xs text-muted-foreground">PNG, JPG ou SVG — 1 Mo maximum.</p>
            </div>
          </div>

          {text('name', 'Raison sociale', 'col-span-2')}
          {text('taxId', 'Matricule fiscal (MF)')}
          {text('rc', 'Registre de commerce (RC)')}
          {text('address', 'Adresse', 'col-span-2')}
          {text('phone', 'Téléphone')}
          {text('email', 'E-mail')}
          {text('rib', 'RIB bancaire', 'col-span-2')}
          {text('footer', 'Mention de bas de facture', 'col-span-2')}

          <div>
            <Label>TVA par défaut</Label>
            <Select value={c.defaultTva} onChange={(e) => setC({ ...c, defaultTva: Number(e.target.value) })}>
              {TVA_RATES.map((r) => <option key={r} value={r}>{r} %</option>)}
            </Select>
          </div>
          <div>
            <Label>Droit de timbre fiscal (DT)</Label>
            <Input type="number" step="0.001" min="0" value={c.timbreAmount} onChange={(e) => setC({ ...c, timbreAmount: parseFloat(e.target.value) || 0 })} />
          </div>
        </div>

        {error && <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save}>Enregistrer</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
