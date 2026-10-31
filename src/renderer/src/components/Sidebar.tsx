import { ROLE_LABELS, type User } from '@shared/types'
import {
  BarChart3, ClipboardCheck, ClipboardList, FileSignature, FileText, Hammer, House, LogOut, Moon, Package, PanelLeftClose, PanelLeftOpen,
  ScanSearch, Search, Settings, ShoppingCart, Sun, Truck, UserCog, Users, Wallet, Warehouse
} from 'lucide-react'
import type { NavBadges } from '@shared/dashboard'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/Avatar'

// Pages regroupées par métier : vendre, gérer la marchandise, piloter, administrer.
export const NAV = [
  { id: 'accueil', label: 'Aujourd’hui', icon: House, group: '' },
  { id: 'caisse', label: 'Caisse', icon: ShoppingCart, group: 'Vente' },
  { id: 'devis', label: 'Devis', icon: FileSignature, group: 'Vente' },
  { id: 'factures', label: 'Factures', icon: FileText, group: 'Vente' },
  { id: 'livraisons', label: 'Bons de livraison', icon: ClipboardCheck, group: 'Vente' },
  { id: 'clients', label: 'Clients', icon: Users, group: 'Vente' },
  { id: 'articles', label: 'Articles', icon: Package, group: 'Marchandise' },
  { id: 'stock', label: 'Stock', icon: Warehouse, group: 'Marchandise' },
  { id: 'achats', label: 'Achats', icon: Truck, group: 'Marchandise' },
  { id: 'commandes', label: 'Bons de commande', icon: ClipboardList, group: 'Marchandise' },
  { id: 'tracabilite', label: 'Traçabilité', icon: ScanSearch, group: 'Marchandise' },
  { id: 'depenses', label: 'Dépenses', icon: Wallet, group: 'Pilotage' },
  { id: 'rapports', label: 'Rapports', icon: BarChart3, group: 'Pilotage' },
  { id: 'utilisateurs', label: 'Utilisateurs', icon: UserCog, group: 'Administration' },
  { id: 'parametres', label: 'Paramètres', icon: Settings, group: 'Administration' }
] as const
export type PageId = (typeof NAV)[number]['id']
type NavItem = (typeof NAV)[number]

// Sens de chaque pastille, affiché au survol.
const BADGE_HINTS: Partial<Record<PageId, string>> = {
  stock: 'article(s) en rupture ou sous le seuil',
  factures: 'facture(s) en retard de paiement',
  tracabilite: 'réception(s) à identifier',
  depenses: 'facture(s) à payer bientôt ou en retard'
}

interface Props {
  page: PageId
  items: readonly NavItem[] // pages autorisées pour le rôle
  user: User
  badges: NavBadges
  collapsed: boolean
  onToggleCollapsed: () => void
  onNavigate: (p: PageId) => void
  onSearch: () => void
  onProfile: () => void
  onLogout: () => void
  dark: boolean
  onToggleTheme: () => void
}

export function Sidebar({ page, items, user, badges, collapsed, onToggleCollapsed, onNavigate, onSearch, onProfile, onLogout, dark, onToggleTheme }: Props) {
  const groups = items.reduce<{ name: string; items: NavItem[] }[]>((acc, it) => {
    const last = acc[acc.length - 1]
    if (last && last.name === it.group) last.items.push(it)
    else acc.push({ name: it.group, items: [it] })
    return acc
  }, [])

  const rowCls = (active: boolean) => cn(
    'relative flex w-full items-center gap-3 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
    collapsed ? 'h-9 justify-center' : 'px-3 py-[7px]',
    active ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'
  )

  return (
    <aside className={cn('flex shrink-0 flex-col bg-sidebar text-slate-300 transition-[width] duration-200', collapsed ? 'w-[4.25rem]' : 'w-64')}>
      <div className={cn('flex items-center gap-3 py-4', collapsed ? 'justify-center px-2' : 'px-5')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Hammer className="h-[18px] w-[18px]" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-base font-semibold leading-tight text-white">Quincaillerie</div>
            <div className="text-xs text-slate-400">Gestion de magasin</div>
          </div>
        )}
      </div>

      {/* Recherche rapide : aussi accessible partout avec Ctrl+K */}
      <div className={cn('pb-3', collapsed ? 'px-2' : 'px-3')}>
        <button onClick={onSearch} title="Rechercher (Ctrl+K)"
          className={cn('flex w-full items-center gap-2 rounded-md border border-white/10 bg-white/5 text-sm text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            collapsed ? 'h-10 justify-center' : 'h-9 px-3')}>
          <Search className="h-4 w-4 shrink-0" />
          {!collapsed && <><span className="flex-1 text-left">Rechercher…</span><kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-slate-300">Ctrl K</kbd></>}
        </button>
      </div>

      <nav className={cn('flex-1 overflow-y-auto pb-3', collapsed ? 'px-2' : 'px-3')}>
        {groups.map((g, gi) => (
          <div key={g.name || gi} className={cn(gi > 0 && (collapsed ? 'mt-2 border-t border-white/10 pt-2' : 'mt-3'))}>
            {g.name && !collapsed && <div className="px-3 pb-1 text-xs font-medium text-slate-500">{g.name}</div>}
            <div className="space-y-0.5">
              {g.items.map(({ id, label, icon: Icon }) => {
                const count = badges[id] ?? 0
                const hint = count > 0 && BADGE_HINTS[id] ? ` (${count} ${BADGE_HINTS[id]})` : ''
                return (
                  <button key={id} onClick={() => onNavigate(id)} title={collapsed || hint ? label + hint : undefined}
                    aria-current={page === id ? 'page' : undefined} className={rowCls(page === id)}>
                    <Icon className={cn('h-[18px] w-[18px] shrink-0', page === id && 'text-primary')} />
                    {!collapsed && <span className="flex-1 truncate text-left">{label}</span>}
                    {count > 0 && (collapsed
                      ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
                      : <span className="tnum min-w-[1.5rem] rounded-full bg-primary/20 px-1.5 py-0.5 text-center text-xs font-semibold text-primary">{count > 99 ? '99+' : count}</span>)}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={cn('space-y-0.5 border-t border-white/10', collapsed ? 'p-2' : 'p-3')}>
        <button onClick={onToggleTheme} title={collapsed ? (dark ? 'Mode clair' : 'Mode sombre') : undefined} className={rowCls(false)}>
          {dark ? <Sun className="h-[18px] w-[18px] shrink-0" /> : <Moon className="h-[18px] w-[18px] shrink-0" />}
          {!collapsed && (dark ? 'Mode clair' : 'Mode sombre')}
        </button>
        <button onClick={onToggleCollapsed} title={collapsed ? 'Déplier le menu' : undefined} className={rowCls(false)}>
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" /> : <PanelLeftClose className="h-[18px] w-[18px] shrink-0" />}
          {!collapsed && 'Réduire le menu'}
        </button>
        <div className={cn('mt-2 flex items-center rounded-md bg-white/5', collapsed ? 'flex-col gap-1 py-2' : 'gap-1 py-1.5 pl-1.5 pr-1')}>
          {/* Clic sur son nom ou sa photo : « Mon profil » */}
          <button onClick={onProfile} title={collapsed ? `${user.fullName} (${ROLE_LABELS[user.role]}) : mon profil` : 'Mon profil'}
            className={cn('flex min-w-0 items-center gap-3 rounded-md text-left hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              collapsed ? 'p-1' : 'flex-1 p-1.5')}>
            <Avatar name={user.fullName} src={user.avatar} className="h-9 w-9" />
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-white">{user.fullName}</span>
                <span className="block text-xs text-slate-400">{ROLE_LABELS[user.role]}</span>
              </span>
            )}
          </button>
          <button onClick={onLogout} title="Se déconnecter" className="rounded-md p-2 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
