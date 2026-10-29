import { useState } from 'react'
import { Hammer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import type { User } from '@shared/types'

/** Écran de connexion ; au tout premier lancement (aucun utilisateur) il crée le compte administrateur. */
export default function LoginPage({ firstRun, onLogin }: { firstRun: boolean; onLogin: (u: User) => void }) {
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const res = firstRun
      ? await window.api.auth.setup({ fullName, username, password, role: 'admin', active: true })
      : await window.api.auth.login(username, password)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onLogin(res.data)
  }

  return (
    <div className="flex h-full items-center justify-center bg-sidebar p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-8 shadow-soft">
        <div className="flex flex-col items-center gap-3 pb-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft"><Hammer className="h-7 w-7" /></div>
          <h1 className="text-xl font-semibold">{firstRun ? 'Bienvenue' : 'Connexion'}</h1>
          <p className="text-center text-sm text-muted-foreground">
            {firstRun ? "Créez le compte administrateur pour démarrer." : 'Identifiez-vous pour accéder à la quincaillerie.'}
          </p>
        </div>
        {firstRun && <div><Label>Nom complet</Label><Input autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>}
        <div><Label>Identifiant</Label><Input autoFocus={!firstRun} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></div>
        <div><Label>Mot de passe</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{firstRun ? 'Créer le compte' : 'Se connecter'}</Button>
      </form>
    </div>
  )
}
