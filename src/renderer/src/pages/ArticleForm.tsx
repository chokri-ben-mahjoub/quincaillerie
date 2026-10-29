import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAppConfig } from '@/lib/useAppConfig'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label, Select } from '@/components/ui/input'
import { UNITS, type Article, type ArticleInput, type Category } from '@shared/types'

interface Props {
  open: boolean
  article: Article | null // null = création
  categories: Category[]
  onClose: () => void
  onSaved: () => void
}

const EMPTY: ArticleInput = {
  barcode: '', designation: '', categoryId: null, unit: 'pièce',
  purchasePrice: 0, salePrice: 0, minStock: 0, initialStock: 0
}

export default function ArticleForm({ open, article, categories, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ArticleInput>(EMPTY)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Remplit le formulaire à l'ouverture (édition) ou le vide (création).
  const cfg = useAppConfig()
  useEffect(() => {
    if (!open) return
    setError('')
    setForm(
      article
        ? { barcode: article.barcode, designation: article.designation, categoryId: article.categoryId,
            unit: article.unit, purchasePrice: article.purchasePrice, salePrice: article.salePrice,
            minStock: article.minStock }
        : { ...EMPTY, unit: cfg.stockDefaultUnit, minStock: cfg.stockDefaultMin } // valeurs par défaut des paramètres
    )
  }, [open, article, cfg])

  const set = <K extends keyof ArticleInput>(k: K, v: ArticleInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const numberField = (k: 'purchasePrice' | 'salePrice' | 'minStock' | 'initialStock') => ({
    type: 'number' as const, step: '0.001', min: 0, value: form[k] ?? 0,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, parseFloat(e.target.value) || 0)
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.barcode.trim() || !form.designation.trim()) return setError('Code-barres et désignation sont obligatoires.')
    setSaving(true)
    const res = article ? await window.api.articles.update(article.id, form) : await window.api.articles.create(form)
    setSaving(false)
    if (!res.ok) return setError(res.error)
    onSaved()
  }

  const margin = form.purchasePrice > 0 ? ((form.salePrice - form.purchasePrice) / form.purchasePrice) * 100 : null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>{article ? "Modifier l'article" : 'Nouvel article'}</DialogTitle>
        <DialogDescription>
          {article ? 'Le stock se modifie depuis le module Stock (mouvements).' : 'Renseignez les informations de l’article.'}
        </DialogDescription>

        <form onSubmit={submit} className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
          <div>
            <Label>Code-barres *</Label>
            <Input autoFocus value={form.barcode} onChange={(e) => set('barcode', e.target.value)} className="font-mono" />
          </div>
          <div>
            <Label>Catégorie</Label>
            <Select value={form.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Aucune —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Désignation *</Label>
            <Input value={form.designation} onChange={(e) => set('designation', e.target.value)} />
          </div>
          <div>
            <Label>Prix d’achat (DT)</Label>
            <Input {...numberField('purchasePrice')} />
          </div>
          <div>
            <Label>Prix de vente (DT)</Label>
            <Input {...numberField('salePrice')} />
            {margin !== null && (
              <p className={`mt-1 text-xs ${margin < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                Marge : {margin.toFixed(1)} %
              </p>
            )}
          </div>
          <div>
            <Label>Unité</Label>
            <Select value={form.unit} onChange={(e) => set('unit', e.target.value)}>
              {UNITS.map((u) => <option key={u}>{u}</option>)}
            </Select>
          </div>
          <div>
            <Label>Seuil d’alerte</Label>
            <Input {...numberField('minStock')} />
          </div>
          {!article && (
            <div className="col-span-2">
              <Label>Stock initial</Label>
              <Input {...numberField('initialStock')} />
            </div>
          )}

          {error && <p className="col-span-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
