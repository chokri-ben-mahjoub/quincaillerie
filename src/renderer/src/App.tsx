import { useEffect, useState } from 'react'
import { Construction } from 'lucide-react'
import { NAV, Sidebar, type PageId } from '@/components/Sidebar'
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
import BackupPage from '@/pages/BackupPage'
import LoginPage from '@/pages/LoginPage'
import { ROLE_PAGES, type User } from '@shared/types'

export default function App() {
  const [page, setPage] = useState<PageId>('articles')
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [user, setUser] = useState<User | null>(null)
  const [firstRun, setFirstRun] = useState(false)
  const [ready, setReady] = useState(false)

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

  function onLogin(u: User) {
    setUser(u)
    setFirstRun(false)
    setPage(ROLE_PAGES[u.role][0] as PageId) // page d'accueil selon le rôle
  }
  async function logout() {
    await window.api.auth.logout()
    setUser(null)
  }

  if (!ready) return null
  if (!user) return <LoginPage firstRun={firstRun} onLogin={onLogin} />

  const allowed = NAV.filter((n) => ROLE_PAGES[user.role].includes(n.id))
  const current = allowed.some((n) => n.id === page) ? page : (allowed[0].id as PageId)

  const pages: Record<PageId, JSX.Element> = {
    articles: <ArticlesPage />,
    caisse: <CaissePage />,
    stock: <StockPage />,
    achats: <AchatsPage />,
    clients: <ClientsPage />,
    rapports: <RapportsPage />,
    utilisateurs: <UsersPage />,
    sauvegarde: <BackupPage />,
    factures: <FacturesPage />,
    devis: <DevisPage />,
    commandes: <CommandesPage />,
    livraisons: <LivraisonsPage />,
    parametres: <SettingsPage />
  }

  return (
    <div className="flex h-full">
      <Sidebar page={current} items={allowed} user={user} onNavigate={setPage} onLogout={logout}
        dark={dark} onToggleTheme={() => setDark((d) => !d)} />
      <main className="min-w-0 flex-1 overflow-auto">
        {pages[current] ?? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground"><Construction className="h-10 w-10" /></div>
        )}
      </main>
    </div>
  )
}
