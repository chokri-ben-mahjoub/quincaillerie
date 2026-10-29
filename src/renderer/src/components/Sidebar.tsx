import { ROLE_LABELS, type User } from '@shared/types'
import { BarChart3, DatabaseBackup, Hammer, LogOut, Moon, Package, ShoppingCart, Sun, Truck, Users, UserCog, Warehouse } from 'lucide-react'
import { cn } from '@/lib/utils'

export const NAV = [
  { id: 'articles', label: 'Articles', icon: Package },
  { id: 'caisse', label: 'Caisse', icon: ShoppingCart },
  { id: 'stock', label: 'Stock', icon: Warehouse },
  { id: 'achats', label: 'Achats', icon: Truck },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'rapports', label: 'Rapports', icon: BarChart3 },
  { id: 'utilisateurs', label: 'Utilisateurs', icon: UserCog },
  { id: 'sauvegarde', label: 'Sauvegarde', icon: DatabaseBackup }
] as const
export type PageId = (typeof NAV)[number]['id']

interface Props {
  page: PageId
  items: readonly (typeof NAV)[number][] // pages autorisées pour le rôle
  user: User
  onNavigate: (p: PageId) => void
  onLogout: () => void
  dark: boolean
  onToggleTheme: () => void
}

export function Sidebar({ page, items, user, onNavigate, onLogout, dark, onToggleTheme }: Props) {
  return (
    <aside className="flex w-64 shrink-0 flex-col bg-sidebar text-slate-300">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-soft">
          <Hammer className="h-5 w-5" />
        </div>
        <div>
          <div className="text-base font-semibold leading-tight text-white">Quincaillerie</div>
          <div className="text-xs text-slate-400">Gestion de magasin</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
              page === id ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'
            )}
          >
            <Icon className={cn('h-[18px] w-[18px]', page === id && 'text-primary')} />
            {label}
          </button>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          onClick={onToggleTheme}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover:bg-white/5 hover:text-white"
        >
          {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          {dark ? 'Mode clair' : 'Mode sombre'}
        </button>
        <div className="mt-2 flex items-center gap-3 rounded-md bg-white/5 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{user.fullName}</div>
            <div className="text-xs text-slate-400">{ROLE_LABELS[user.role]}</div>
          </div>
          <button onClick={onLogout} title="Se déconnecter" className="rounded-md p-2 hover:bg-white/10 hover:text-white">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

