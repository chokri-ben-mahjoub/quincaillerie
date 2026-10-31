// Droits d'accès par rôle. L'administrateur a toujours tout (y compris Utilisateurs et Paramètres).
// Le gérant et le caissier reçoivent la liste des permissions cochées dans Paramètres > Utilisateurs / droits.

export interface Permission {
  id: string
  label: string
  hint: string
  /** Canaux IPC autorisés : un nom finissant par « : » désigne tout le préfixe, sinon le canal exact. */
  channels: string[]
}

// Lectures nécessaires aux écrans de documents (choix du client, des articles, infos société, impression, partage).
const DOC_COMMON = ['company:get', 'share:', 'print:', 'clients:list', 'suppliers:list', 'articles:list', 'categories:list']

export const PERMISSIONS: Permission[] = [
  { id: 'articles', label: 'Articles', hint: 'Catalogue, import Excel, catégories', channels: ['articles:', 'categories:'] },
  { id: 'caisse', label: 'Caisse', hint: 'Ventes, tickets, ouverture et clôture', channels: ['sales:', 'tickets:', 'cash:', 'articles:list', 'clients:list', 'clients:statement', 'clients:pay', 'categories:list'] },
  { id: 'stock', label: 'Stock', hint: 'Mouvements et alertes', channels: ['stock:', 'articles:list'] },
  { id: 'achats', label: 'Achats & fournisseurs', hint: 'Réceptions, dettes fournisseurs', channels: ['purchases:', 'suppliers:', 'articles:list'] },
  { id: 'clients', label: 'Clients', hint: 'Fichier clients, crédit, règlements', channels: ['clients:'] },
  { id: 'rapports', label: 'Rapports', hint: 'Chiffre d’affaires, marges, graphiques', channels: ['reports:'] },
  { id: 'factures', label: 'Factures', hint: 'Création, validation, impression', channels: ['invoices:', ...DOC_COMMON] },
  { id: 'devis', label: 'Devis', hint: 'Création et conversion en facture', channels: ['quotes:', ...DOC_COMMON] },
  { id: 'commandes', label: 'Bons de commande', hint: 'Commandes fournisseurs', channels: ['orders:', ...DOC_COMMON] },
  { id: 'livraisons', label: 'Bons de livraison', hint: 'Livraisons clients', channels: ['deliveries:', ...DOC_COMMON] },
  { id: 'tracabilite', label: 'Traçabilité', hint: 'Lots, n° de série, historique des articles', channels: ['trace:', 'articles:list'] },
  { id: 'depenses', label: 'Dépenses', hint: 'Charges : STEG, SONEDE, loyer, salaires…', channels: ['expenses:'] },
  { id: 'cheques', label: 'Chèques et traites', hint: 'Portefeuille, remises en banque, échéances', channels: ['cheques:', 'clients:list', 'suppliers:list'] }
]

export const PERMISSION_IDS = PERMISSIONS.map((p) => p.id)

/** Pages réservées à l'administrateur (jamais déléguées). */
export const ADMIN_PAGES = ['utilisateurs', 'parametres']

/** Un des droits accordés couvre-t-il ce canal ? */
export function channelGranted(granted: string[], channel: string): boolean {
  return PERMISSIONS.some((p) => granted.includes(p.id) && p.channels.some((c) => (c.endsWith(':') ? channel.startsWith(c) : channel === c)))
}
