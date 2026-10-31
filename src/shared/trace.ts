// Module Traçabilité : lots / numéros de série, historique complet d'un article, journal d'audit des utilisateurs.
import type { MovementType } from './types'

export type TrackingMode = 'aucun' | 'lot' | 'serie'
export const TRACKING_LABELS: Record<TrackingMode, string> = { aucun: 'Non suivi', lot: 'Par lot', serie: 'Par n° de série' }

/** Article avec son mode de suivi et la part de son stock identifiée dans des lots. */
export interface TrackedArticle {
  id: number
  barcode: string
  designation: string
  unit: string
  categoryName: string | null
  tracking: TrackingMode
  trackingSince: string | null
  stock: number
  inLots: number // somme des quantités restantes des lots
  unidentified: number // stock pas encore rattaché à un lot
  lotCount: number // lots encore en stock
}

export interface Lot {
  id: number
  articleId: number
  barcode: string
  designation: string
  unit: string
  code: string
  kind: 'lot' | 'serie'
  supplierName: string | null
  purchaseId: number | null
  purchaseRef: string | null
  expiryDate: string | null
  quantityIn: number
  quantityLeft: number
  note: string | null
  userName: string | null
  createdAt: string
}

/** Une ligne du journal d'un lot : d'où il vient, où il est parti (client, vente…). */
export interface LotEvent {
  id: number
  date: string
  quantity: number
  type: MovementType | null // null : identification d'un stock existant
  docLabel: string | null // n° de vente, réf. d'achat…
  party: string | null // client ou fournisseur
  userName: string | null
  note: string | null
  movementId: number | null
  /** Sortie qu'on peut réaffecter à un autre lot (ex. corriger le n° de série réellement vendu). */
  reassignable: boolean
}

export interface LotDetail extends Lot {
  events: LotEvent[]
}

/** Ligne d'achat d'un article suivi dont les lots ne sont pas encore (tous) saisis. */
export interface PendingReception {
  purchaseId: number
  purchaseRef: string | null
  purchaseDate: string
  supplierName: string | null
  articleId: number
  barcode: string
  designation: string
  unit: string
  tracking: TrackingMode
  quantity: number
  identified: number
}

export interface LotEntry {
  code: string
  quantity: number // ignoré pour un n° de série (toujours 1)
  expiryDate?: string | null
}

export interface ReceiveInput {
  articleId: number
  purchaseId: number | null // null : identification du stock déjà présent
  entries: LotEntry[]
  note?: string
}

/** Mouvement de l'historique d'un article, avec stock après mouvement et documents liés. */
export interface ArticleEvent {
  id: number
  date: string
  type: MovementType
  quantity: number
  balance: number
  unitCost: number | null
  docLabel: string | null
  party: string | null
  userName: string | null
  note: string | null
  lots: string | null // codes des lots touchés
}

export interface AuditEntry {
  id: number
  date: string
  userName: string
  channel: string
  action: string // libellé lisible
  details: string | null
  result: string | null
  ok: boolean
  error: string | null
}

// Libellés lisibles des actions enregistrées dans le journal d'audit (canal IPC -> action).
export const AUDIT_LABELS: Record<string, string> = {
  'auth:login': 'Connexion', 'auth:logout': 'Déconnexion', 'auth:setup': 'Création du compte administrateur',
  'articles:create': 'Article créé', 'articles:update': 'Article modifié', 'articles:delete': 'Article supprimé', 'articles:import': 'Import Excel des articles',
  'categories:create': 'Catégorie créée', 'categories:update': 'Catégorie modifiée', 'categories:delete': 'Catégorie supprimée',
  'stock:add': 'Mouvement de stock manuel',
  'sales:create': 'Vente encaissée', 'sales:cancel': 'Vente annulée',
  'purchases:create': 'Achat enregistré',
  'suppliers:create': 'Fournisseur créé', 'suppliers:update': 'Fournisseur modifié', 'suppliers:delete': 'Fournisseur supprimé', 'suppliers:pay': 'Règlement fournisseur',
  'clients:create': 'Client créé', 'clients:update': 'Client modifié', 'clients:delete': 'Client supprimé', 'clients:pay': 'Règlement client',
  'invoices:save': 'Facture enregistrée', 'invoices:validate': 'Facture validée', 'invoices:delete': 'Facture supprimée',
  'invoices:pay': 'Règlement de facture', 'invoices:unpay': 'Règlement de facture annulé', 'invoices:print': 'Facture imprimée', 'invoices:export': 'Facture exportée (PDF)',
  'quotes:save': 'Devis enregistré', 'quotes:validate': 'Devis validé', 'quotes:delete': 'Devis supprimé', 'quotes:setStatus': 'Statut du devis changé', 'quotes:convert': 'Devis converti en facture',
  'orders:save': 'Bon de commande enregistré', 'orders:validate': 'Bon de commande validé', 'orders:delete': 'Bon de commande supprimé', 'orders:setReceived': 'Bon de commande reçu',
  'deliveries:save': 'Bon de livraison enregistré', 'deliveries:validate': 'Bon de livraison validé', 'deliveries:delete': 'Bon de livraison supprimé', 'deliveries:setDelivered': 'Bon de livraison livré',
  'tickets:print': 'Ticket imprimé', 'tickets:export': 'Ticket exporté (PDF)',
  'users:create': 'Utilisateur créé', 'users:update': 'Utilisateur modifié',
  'settings:set': 'Paramètres modifiés',
  'backup:now': 'Sauvegarde manuelle', 'backup:restore': 'Restauration de sauvegarde',
  'demo:generate': 'Données de démonstration générées', 'demo:reset': 'Remise à zéro de la base',
  'expenses:create': 'Dépense enregistrée', 'expenses:update': 'Dépense modifiée', 'expenses:pay': 'Dépense payée', 'expenses:delete': 'Dépense supprimée',
  'expcat:save': 'Catégorie de dépense enregistrée', 'expcat:delete': 'Catégorie de dépense supprimée',
  'cash:open': 'Caisse ouverte', 'cash:move': 'Apport / retrait de caisse', 'cash:close': 'Caisse clôturée', 'cash:printZ': 'Ticket de clôture réimprimé',
  'cheques:create': 'Chèque enregistré', 'cheques:update': 'Chèque modifié', 'cheques:setStatus': 'État de chèque modifié', 'cheques:delete': 'Chèque supprimé',
  'profile:update': 'Profil modifié', 'profile:setPrefs': 'Préférences d’affichage modifiées',
  'trace:receive': 'Lots / n° de série saisis', 'trace:setTracking': 'Mode de suivi modifié', 'trace:reassign': 'Affectation de lot corrigée'
}

export const auditLabel = (channel: string): string => AUDIT_LABELS[channel] ?? channel
