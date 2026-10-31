import { useCallback, useEffect, useState } from 'react'
import { Construction } from 'lucide-react'
import { NAV, Sidebar, type PageId } from '@/components/Sidebar'
import { CommandPalette } from '@/components/CommandPalette'
import { ProfileDialog } from '@/components/ProfileDialog'
import AccueilPage from '@/pages/AccueilPage'
import DepensesPage from '@/pages/DepensesPage'
import ChequesPage from '@/pages/ChequesPage'
import ArticlesPage from '@/pages/ArticlesPage'
import StockPage from '@/pages/StockPage'
import CaissePage from '@/pages/CaissePage'
import AchatsPage from '@/pages/AchatsPage'
import ClientsPage from '@/pages/ClientsPage'
import RapportsPage from '@/pages/RapportsPage'
import UsersPage from '@/pages/UsersPage'
import FacturesPage from '@/pages/FacturesPage'
import DevisPage from '@/pages/DevisPage'
import CommandesPage from '@/pages/CommandesPage'
import LivraisonsPage from '@/pages/LivraisonsPage'
import SettingsPage from '@/pages/SettingsPage'
import TracabilitePage from '@/pages/TracabilitePage'
import LoginPage from '@/pages/LoginPage'
import type { User } from '@shared/types'
import type { NavBadges } from '@shared/dashboard'

export default function App() {
  const [page, setPage] = useState<PageId>('accueil')
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [user, setUser] = useState<User | null>(null)
  const [allowedPages, setAllowedPages] = useState<string[] | null>(null) // pages accessibles (Paramètres > Utilisateurs / droits)
  const [firstRun, setFirstRun] = useState(false)
  const [ready, setReady] = useState(false)
  const [badges, setBadges] = useState<NavBadges>({})
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [navKey, setNavKey] = useState(0) // change à chaque navigation par la recherche : la page se recharge filtrée
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1')

  useEffect(() => { localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0') }, [collapsed])

  // Pastilles du menu : relues à chaque changement d'écran et chaque minute.
  const refreshBadges = useCallback(() => {
    window.api.dashboard.badges().then((r) => r.ok && setBadges(r.data))
  }, [])
  useEffect(() => {
    if (!user) return
    refreshBadges()
    const t = setInterval(refreshBadges, 60_000)
    return () => clearInterval(t)
  }, [user, page, refreshBadges])

  // Ctrl+K (ou Cmd+K) ouvre la recherche rapide depuis n'importe quel écran.
  useEffect(() => {
    if (!user) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [user])

  // Applique le thème sur <html> et le mémorise.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  // Au démarrage : y a-t-il des utilisateurs ? une session ouverte ?
  useEffect(() => {
    window.api.auth.status().then((r) => {
      if (r.ok) { setFirstRun(!r.data.hasUsers); setUser(r.data.user) }
      setReady(true)
    })
  }, [])

  // Les pages visibles dépendent des droits du rôle : relues à chaque connexion.
  useEffect(() => {
    if (!user) { setAllowedPages(null); return }
    window.api.app.config().then((r) => setAllowedPages(r.ok ? r.data.pages : []))
  }, [user])

  function onLogin(u: User) {
    setUser(u)
    setFirstRun(false)
    setPage(u.role === 'caissier' ? 'caisse' : 'accueil') // la page demandée est corrigée plus bas si non autorisée
  }
  async function logout() {
    await window.api.auth.logout()
    setUser(null)
  }

  if (!ready) return null
  if (!user) return <LoginPage firstRun={firstRun} onLogin={onLogin} />
  if (allowedPages === null) return null

  const allowed = NAV.filter((n) => n.id === 'accueil' || allowedPages.includes(n.id)) // l'accueil est ouvert à tous
  if (!allowed.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <Construction className="h-10 w-10" />
        <p>Aucun écran n’est autorisé pour votre rôle. Contactez l’administrateur.</p>
        <button className="text-primary" onClick={logout}>Se déconnecter</button>
      </div>
    )
  }
  const current = allowed.some((n) => n.id === page) ? page : (allowed[0].id as PageId)

  const pages: Record<PageId, JSX.Element> = {
    accueil: <AccueilPage user={user} onNavigate={setPage} />,
    depenses: <DepensesPage />,
    cheques: <ChequesPage />,
    articles: <ArticlesPage />,
    caisse: <CaissePage />,
    stock: <StockPage />,
    achats: <AchatsPage />,
    clients: <ClientsPage />,
    rapports: <RapportsPage />,
    tracabilite: <TracabilitePage isAdmin={user.role === 'admin'} />,
    utilisateurs: <UsersPage />,
    factures: <FacturesPage />,
    devis: <DevisPage />,
    commandes: <CommandesPage />,
    livraisons: <LivraisonsPage />,
    parametres: <SettingsPage />
  }

  return (
    <div className="flex h-full">
      <Sidebar page={current} items={allowed} user={user} badges={badges} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)}
        onNavigate={setPage} onSearch={() => setPaletteOpen(true)} onProfile={() => setProfileOpen(true)} onLogout={logout} dark={dark} onToggleTheme={() => setDark((d) => !d)} />
      <main key={navKey} className="min-w-0 flex-1 overflow-auto">{pages[current]}</main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} pages={allowed}
        onGo={(p) => { setPage(p); setNavKey((k) => k + 1) }} />
      <ProfileDialog open={profileOpen} user={user} onClose={() => setProfileOpen(false)} onSaved={setUser} />
    </div>
  )
}
