import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label, Select } from '@/components/ui/input'
import { ROLE_LABELS, type Role, type User, type UserInput } from '@shared/types'

const EMPTY: UserInput = { username: '', fullName: '', role: 'caissier', active: true, password: '' }

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [target, setTarget] = useState<User | 'new' | null>(null)

  const load = useCallback(async () => {
    const r = await window.api.users.list()
    if (r.ok) setUsers(r.data)
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Utilisateurs</h1>
          <p className="text-muted-foreground">Comptes et rôles : administrateur (tout), gérant (tout sauf utilisateurs), caissier (caisse uniquement).</p>
        </div>
        <Button onClick={() => setTarget('new')}><Plus className="h-4 w-4" />Nouvel utilisateur</Button>
      </header>

      <section className="rounded-lg border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              {['Nom', 'Identifiant', 'Rôle', 'Statut', ''].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3 font-medium">{u.fullName}</td>
                <td className="px-4 py-3 font-mono text-[13px] text-muted-foreground">{u.username}</td>
                <td className="px-4 py-3"><Badge>{ROLE_LABELS[u.role]}</Badge></td>
                <td className="px-4 py-3">{u.active ? <Badge tone="success">Actif</Badge> : <Badge tone="danger">Désactivé</Badge>}</td>
                <td className="px-4 py-3 text-right"><Button variant="ghost" size="icon" onClick={() => setTarget(u)}><Pencil className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <UserDialog target={target} onClose={() => setTarget(null)} onSaved={() => { setTarget(null); load() }} />
    </div>
  )
}

function UserDialog({ target, onClose, onSaved }: { target: User | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<UserInput>(EMPTY)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!target) return
    setError('')
    setF(target === 'new' ? EMPTY : { username: target.username, fullName: target.fullName, role: target.role, active: target.active, password: '' })
  }, [target])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const r = target === 'new' ? await window.api.users.create(f) : await window.api.users.update((target as User).id, f)
    if (!r.ok) return setError(r.error)
    onSaved()
  }
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>{target === 'new' ? 'Nouvel utilisateur' : "Modifier l'utilisateur"}</DialogTitle>
        {target !== 'new' && <DialogDescription>Laissez le mot de passe vide pour le conserver.</DialogDescription>}
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div><Label>Nom complet *</Label><Input autoFocus value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div>
          <div><Label>Identifiant *</Label><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
          <div><Label>Mot de passe {target === 'new' && '*'}</Label><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Rôle</Label>
              <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select></div>
            <div><Label>Statut</Label>
              <Select value={f.active ? '1' : '0'} onChange={(e) => setF({ ...f, active: e.target.value === '1' })}>
                <option value="1">Actif</option><option value="0">Désactivé</option>
              </Select></div>
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit">Enregistrer</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
