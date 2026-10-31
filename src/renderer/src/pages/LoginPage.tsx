import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowBigUpDash, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import type { User } from '@shared/types'

/** Écran de connexion ; au tout premier lancement (aucun utilisateur) il crée le compte administrateur. */
export default function LoginPage({ firstRun, onLogin }: { firstRun: boolean; onLogin: (u: User) => void }) {
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [shop, setShop] = useState({ name: '', logo: '' })
  const passwordRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    window.api.auth.status().then((r) => r.ok && setShop({ name: r.data.shopName, logo: r.data.logo }))
  }, [])

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  function fail(message: string) {
    setError(message)
    // Le formulaire tremble brièvement (sauf si l'utilisateur a demandé moins d'animations).
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      formRef.current?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' },
        { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 360, easing: 'ease-in-out' })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (firstRun && !fullName.trim()) return fail('Saisissez votre nom complet.')
    if (!username.trim()) return fail('Saisissez votre identifiant.')
    if (!password) { passwordRef.current?.focus(); return fail('Saisissez votre mot de passe.') }
    if (firstRun && password !== confirm) return fail('Les deux mots de passe ne sont pas identiques.')
    setBusy(true)
    const res = firstRun
      ? await window.api.auth.setup({ fullName, username, password, role: 'admin', active: true })
      : await window.api.auth.login(username, password)
    setBusy(false)
    if (!res.ok) {
      fail(res.error)
      if (!firstRun) { setPassword(''); passwordRef.current?.focus() } // on retape directement le mot de passe
      return
    }
    onLogin(res.data)
  }

  const trackCaps = (e: React.KeyboardEvent) => setCapsLock(e.getModifierState('CapsLock'))

  return (
    <div className="grid h-full md:grid-cols-[minmax(0,1.35fr)_minmax(26rem,1fr)]">
      {/* ---- Panneau perforé : le mur à outils du magasin ---- */}
      <aside className="pegboard relative hidden overflow-hidden bg-sidebar md:block" aria-hidden="true">
        <ToolWall />
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-sidebar via-sidebar/95 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-14 pb-14">
          {shop.logo && (
            <div className="mb-6 flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-white p-2">
              <img src={shop.logo} alt="" className="max-h-full max-w-full object-contain" />
            </div>
          )}
          <p className="login-display max-w-[14ch] text-balance text-[3.5rem] font-semibold leading-[1.02] text-white">
            {shop.name || '\u00a0'}
          </p>
          <p className="mt-4 text-lg text-slate-400 first-letter:uppercase">{today}</p>
        </div>
      </aside>

      {/* ---- Formulaire ---- */}
      <main className="flex flex-col bg-background px-8 py-10 sm:px-14">
        <div className="flex flex-1 items-center">
          <form ref={formRef} onSubmit={submit} className="w-full max-w-[22rem]" noValidate>
            <h1 className="text-3xl font-semibold tracking-tight">{firstRun ? 'Créer le compte administrateur' : 'Connexion'}</h1>
            <p className="mt-2 text-muted-foreground">
              {firstRun
                ? 'Ce compte gère les utilisateurs, leurs droits et les paramètres. Les autres comptes s’ajoutent ensuite.'
                : 'Entrez votre identifiant et votre mot de passe.'}
            </p>

            <div className="mt-9 space-y-5">
              {firstRun && (
                <div>
                  <Label htmlFor="fullName">Nom complet</Label>
                  <Input id="fullName" className="h-12 text-base" autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
                </div>
              )}
              <div>
                <Label htmlFor="username">Identifiant</Label>
                <Input id="username" className="h-12 text-base" autoFocus={!firstRun} value={username} onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username" autoCapitalize="none" spellCheck={false} />
              </div>
              <div>
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Input id="password" ref={passwordRef} className="h-12 pr-12 text-base" type={showPw ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)} onKeyDown={trackCaps} onKeyUp={trackCaps}
                    autoComplete={firstRun ? 'new-password' : 'current-password'} />
                  <button type="button" onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} title={showPw ? 'Masquer' : 'Afficher'}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {capsLock && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-warning"><ArrowBigUpDash className="h-4 w-4" />Majuscules activées</p>
                )}
                {firstRun && !capsLock && <p className="mt-2 text-sm text-muted-foreground">4 caractères minimum.</p>}
              </div>
              {firstRun && (
                <div>
                  <Label htmlFor="confirm">Confirmer le mot de passe</Label>
                  <Input id="confirm" className="h-12 text-base" type={showPw ? 'text' : 'password'} value={confirm}
                    onChange={(e) => setConfirm(e.target.value)} onKeyDown={trackCaps} onKeyUp={trackCaps} autoComplete="new-password" />
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-6 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
              </p>
            )}

            <Button type="submit" className="mt-8 h-12 w-full text-base" disabled={busy}>
              {busy && <Loader2 className="h-5 w-5 animate-spin" />}
              {firstRun ? (busy ? 'Création…' : 'Créer le compte et entrer') : busy ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>
        </div>
        <p className="text-sm text-muted-foreground">Les données restent sur cet ordinateur.</p>
      </main>
    </div>
  )
}

// ---------- Outils accrochés au panneau perforé ----------
// Le panneau a un trou tous les 28 px (centre à 14 px) : chaque crochet est posé exactement sur un trou.
const HOLE = 28
const TOOL_SCALE = 1.4 // les outils sont dessinés petits puis agrandis ; les crochets restent sur les trous
const at = (col: number, row: number) => ({ x: HOLE / 2 + col * HOLE, y: HOLE / 2 + row * HOLE })

function Hook({ children, col, row, swing, delay }: { children: React.ReactNode; col: number; row: number; swing: number; delay: number }) {
  const { x, y } = at(col, row)
  return (
    <svg x={x} y={y} overflow="visible">
      <circle r="3.6" className="fill-slate-500" />
      <path d="M0 0 V14" className="stroke-slate-500" strokeWidth="2.5" strokeLinecap="round" />
      <g className="tool-swing" style={{ '--swing': `${swing}deg`, animationDelay: `${delay}ms` } as React.CSSProperties}>
        <g transform={`scale(${TOOL_SCALE})`}>{children}</g>
      </g>
    </svg>
  )
}

function ToolWall() {
  const line = 'fill-none stroke-slate-400/60'
  return (
    <svg className="absolute left-[56px] top-[56px]" width={HOLE * 22} height={HOLE * 14} overflow="visible" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      {/* Marteau : l'outil de l'enseigne, seul en couleur */}
      <Hook col={2} row={0} swing={7} delay={0}>
        <g className="fill-primary/15 stroke-primary">
          <rect x="-7" y="14" width="14" height="150" rx="7" />
          <circle cx="0" cy="26" r="3.5" className="fill-sidebar" />
          <rect x="-36" y="162" width="58" height="24" rx="3" />
          <rect x="-48" y="165" width="12" height="18" rx="2" />
          <path d="M22 165 C38 165 49 158 56 145 M22 186 C42 187 55 178 60 163" className="fill-none" />
        </g>
      </Hook>
      {/* Clé plate */}
      <Hook col={6} row={1} swing={-5} delay={90}>
        <g className={line}>
          <circle cx="0" cy="32" r="17" />
          <circle cx="0" cy="32" r="8" />
          <path d="M-6 48 V196 M6 48 V196" />
          <path d="M-6 196 C-24 200 -26 226 -11 238 L-4 227 C-12 221 -10 209 0 207 C10 209 12 221 4 227 L11 238 C26 226 24 200 6 196" />
        </g>
      </Hook>
      {/* Tournevis */}
      <Hook col={10} row={0} swing={6} delay={160}>
        <g className={line}>
          <rect x="-11" y="14" width="22" height="76" rx="9" />
          <circle cx="0" cy="25" r="3" />
          <path d="M-4 38 V80 M4 38 V80" />
          <rect x="-6" y="90" width="12" height="9" rx="1.5" />
          <path d="M-2.5 99 V194 L0 205 L2.5 194 V99" />
        </g>
      </Hook>
      {/* Mètre ruban */}
      <Hook col={14} row={2} swing={-6} delay={220}>
        <g className={line}>
          <rect x="-36" y="14" width="72" height="68" rx="16" />
          <circle cx="0" cy="48" r="17" />
          <circle cx="0" cy="48" r="4" />
          <path d="M36 66 H46 V150 H38 V66" />
          <path d="M38 80 H42 M38 92 H44 M38 104 H42 M38 116 H44 M38 128 H42 M38 140 H44" />
          <path d="M36 150 H50" />
        </g>
      </Hook>
      {/* Scie à métaux */}
      <Hook col={19} row={1} swing={4} delay={280}>
        <g className={line}>
          <path d="M0 14 V24" />
          <path d="M-6 24 H18 V170 M-6 24 V170" />
          <path d="M-6 30 V164" />
          <path d="M-6 44 l-4 4 l4 4 M-6 64 l-4 4 l4 4 M-6 84 l-4 4 l4 4 M-6 104 l-4 4 l4 4 M-6 124 l-4 4 l4 4 M-6 144 l-4 4 l4 4" />
          <path d="M-12 170 H24 L20 214 C19 222 -8 222 -9 214 Z" />
          <path d="M-2 186 H14" />
        </g>
      </Hook>
    </svg>
  )
}
