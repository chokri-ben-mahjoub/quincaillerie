// Recherche transmise d'un écran à l'autre : la recherche rapide (Ctrl+K) ouvre une page déjà filtrée.
// La grille dont l'id correspond lit la recherche à son affichage, une seule fois.
let pending: { gridId: string; query: string } | null = null

export function setSearchIntent(gridId: string, query: string): void {
  pending = { gridId, query }
}

export function takeSearchIntent(gridId: string): string | null {
  if (!pending || pending.gridId !== gridId) return null
  const q = pending.query
  setTimeout(() => { pending = null }, 0) // effacée après l'affichage (React peut lire deux fois en développement)
  return q
}

// Onglet des Paramètres à ouvrir (ex. « Impression » depuis l'accueil).
let pendingTab: string | null = null
export const openSettingsTab = (tab: string): void => { pendingTab = tab }
export function takeSettingsTab(): string | null {
  const t = pendingTab
  setTimeout(() => { pendingTab = null }, 0)
  return t
}
