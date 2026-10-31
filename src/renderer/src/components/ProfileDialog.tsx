import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Loader2, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Avatar, imageToAvatar } from '@/components/Avatar'
import { ROLE_LABELS, type User } from '@shared/types'

/** « Mon profil » : nom, photo et mot de passe de l'utilisateur connecté. */
export function ProfileDialog({ open, user, onClose, onSaved }: { open: boolean; user: User; onClose: () => void; onSaved: (u: User) => void }) {
  const [fullName, setFullName] = useState(user.fullName)
  const [avatar, setAvatar] = useState<string | null>(user.avatar ?? null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setFullName(user.fullName); setAvatar(user.avatar ?? null)
    setCurrent(''); setNext(''); setConfirm(''); setError(''); setSaving(false)
  }, [open, user])

  async function pick(file: File | undefined) {
    if (!file) return
    try { setAvatar(await imageToAvatar(file)); setError('') } catch (e: any) { setError(e.message) }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (next && next !== confirm) return setError('Les deux nouveaux mots de passe ne sont pas identiques.')
    if (next && !current) return setError('Saisissez votre mot de passe actuel pour le changer.')
    setSaving(true)
    const r = await window.api.profile.update({ fullName, avatar, ...(next ? { currentPassword: current, newPassword: next } : {}) })
    setSaving(false)
    if (!r.ok) return setError(r.error)
    onSaved(r.data)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Mon profil</DialogTitle>
        <DialogDescription>{user.username}, {ROLE_LABELS[user.role].toLowerCase()}</DialogDescription>
        <form onSubmit={submit} className="mt-6 space-y-6">
          {/* Photo : clic ou glisser-déposer */}
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => fileRef.current?.click()} title="Changer la photo"
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]) }}
              className={`group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${dragging ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
              <Avatar name={fullName || user.fullName} src={avatar} className="h-24 w-24 text-2xl" />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera className="h-6 w-6" />
              </span>
            </button>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Camera className="h-4 w-4" />{avatar ? 'Changer la photo' : 'Ajouter une photo'}</Button>
                {avatar && <Button type="button" variant="ghost" size="sm" onClick={() => setAvatar(null)}><Trash2 className="h-4 w-4 text-destructive" />Retirer</Button>}
              </div>
              <p className="text-sm text-muted-foreground">JPG, PNG ou WebP. L’image est recadrée en carré.</p>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
          </div>

          <div>
            <Label htmlFor="pf-name">Nom complet</Label>
            <Input id="pf-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          </div>

          <fieldset className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">Changer le mot de passe</legend>
            <p className="text-sm text-muted-foreground">Laissez vide pour garder le mot de passe actuel.</p>
            <div>
              <Label htmlFor="pf-cur">Mot de passe actuel</Label>
              <Input id="pf-cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pf-new">Nouveau</Label>
                <Input id="pf-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
              </div>
              <div>
                <Label htmlFor="pf-conf">Confirmer</Label>
                <Input id="pf-conf" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </div>
            </div>
          </fieldset>

          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Enregistrer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
