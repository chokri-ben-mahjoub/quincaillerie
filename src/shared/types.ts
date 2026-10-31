// Types partagés entre le processus principal (Node) et l'interface (React).
// Tous les montants sont exprimés en dinars avec 3 décimales (ex. 12.500).

export interface Category {
  id: number
  name: string
}

export interface Article {
  id: number
  barcode: string
  designation: string
  categoryId: number | null
  categoryName: string | null
  unit: string
  purchasePrice: number
  salePrice: number
  /** Stock courant : calculé par la base à partir des mouvements, jamais saisi directement. */
  stock: number
  minStock: number
}

/** Données du formulaire article. `initialStock` n'est utilisé qu'à la création. */
export interface ArticleInput {
  barcode: string
  designation: string
  categoryId: number | null
  unit: string
  purchasePrice: number
  salePrice: number
  minStock: number
  initialStock?: number
}

export interface ImportReport {
  created: number
  updated: number
  errors: { line: number; message: string }[]
}

/** Réponse standard des appels IPC : jamais d'exception à travers le pont. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export const UNITS = ['pièce', 'kg', 'g', 'm', 'm²', 'm³', 'L', 'boîte', 'sac', 'rouleau', 'paire', 'lot'] as const

// ---------- Stock ----------
export type MovementType =
  | 'initial' | 'achat' | 'vente' | 'retour_client' | 'retour_fournisseur' | 'ajustement' | 'perte'

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  initial: 'Stock initial', achat: 'Achat', vente: 'Vente', retour_client: 'Retour client',
  retour_fournisseur: 'Retour fournisseur', ajustement: 'Ajustement', perte: 'Perte / casse'
}

export interface StockMovement {
  id: number
  articleId: number
  barcode: string
  designation: string
  unit: string
  type: MovementType
  /** Quantité signée : + entrée, - sortie. */
  quantity: number
  note: string | null
  createdAt: string
}

/** Saisie manuelle : quantité toujours positive, le sens est donné par `direction`. */
export interface MovementInput {
  articleId: number
  type: 'ajustement' | 'perte' | 'retour_client' | 'retour_fournisseur'
  direction: 'in' | 'out'
  quantity: number
  note: string
}

// ---------- Caisse ----------
export type PayMethod = 'especes' | 'carte' | 'cheque' | 'credit'

export const PAY_LABELS: Record<PayMethod, string> = { especes: 'Espèces', carte: 'Carte', cheque: 'Chèque', credit: 'Crédit' }

export interface SaleInput {
  clientId?: number | null // facultatif ; obligatoire pour une vente à crédit
  replaces?: number // id d'une vente à remplacer (modification d'une vente encaissée)
  items: { articleId: number; quantity: number }[]
  discount: number // remise globale en dinars
  method: PayMethod
  received: number // montant remis par le client
}

export interface Receipt {
  id: number
  number: string
  createdAt: string
  shopName: string
  lines: { designation: string; unit: string; quantity: number; unitPrice: number; total: number }[]
  subtotal: number
  discount: number
  total: number
  received: number
  change: number
  /** Reste à payer porté au crédit du client (0 si payé en totalité). */
  due: number
  clientName: string | null
  method: PayMethod
}

// ---------- Clients ----------
export interface Client {
  id: number
  name: string
  phone: string | null
  address: string | null
  /** Plafond de crédit autorisé (0 = pas de crédit). */
  creditLimit: number
  /** Montant que le client nous doit. */
  balance: number
}
export type ClientInput = Pick<Client, 'name' | 'phone' | 'address' | 'creditLimit'>

// ---------- Achats / Fournisseurs ----------
export interface Supplier {
  id: number
  name: string
  phone: string | null
  address: string | null
  note: string | null
  /** Montant que nous devons au fournisseur (achats non réglés - règlements). */
  balance: number
}
export type SupplierInput = Pick<Supplier, 'name' | 'phone' | 'address' | 'note'>

export interface PurchaseInput {
  supplierId: number | null
  reference: string
  items: { articleId: number; quantity: number; unitCost: number }[]
  paid: number
}

export interface Purchase {
  id: number
  supplierName: string | null
  reference: string | null
  total: number
  paid: number
  itemCount: number
  createdAt: string
}

// ---------- Utilisateurs ----------
export type Role = 'admin' | 'gerant' | 'caissier'
export const ROLE_LABELS: Record<Role, string> = { admin: 'Administrateur', gerant: 'Gérant', caissier: 'Caissier' }

export interface User {
  id: number
  username: string
  fullName: string
  role: Role
  active: boolean
  avatar?: string | null // photo de profil (data URL)
}

/** Modification de son propre profil. Le mot de passe actuel est exigé pour en choisir un nouveau. */
export interface ProfileInput {
  fullName: string
  avatar: string | null
  currentPassword?: string
  newPassword?: string
}
export interface UserInput {
  username: string
  fullName: string
  role: Role
  active: boolean
  password?: string // vide en modification = inchangé
}
export interface AuthStatus {
  hasUsers: boolean
  user: User | null
  shopName: string // affiché sur l'écran de connexion
  logo: string // logo de la société (data URL) ou ''
}

// ---------- Sauvegarde ----------
export interface BackupInfo {
  name: string
  size: number // octets
  createdAt: string // ISO
}
export interface BackupConfig {
  dir: string
  keep: number // nombre de sauvegardes conservées
  last: string | null // ISO de la dernière sauvegarde
}

// ---------- Rapports ----------
export interface ReportData {
  from: string // AAAA-MM-JJ
  to: string
  revenue: number // chiffre d'affaires
  salesCount: number
  avgBasket: number
  grossMargin: number // CA - coût d'achat des articles vendus
  clientDebt: number // créances clients totales (indépendant de la période)
  stockValue: number // valeur du stock au prix d'achat
  daily: { day: string; revenue: number; margin: number }[]
  byMethod: { method: string; total: number }[]
  byCategory: { name: string; total: number }[]
  topArticles: { designation: string; quantity: number; total: number; margin: number }[]
  /** Même durée juste avant la période, pour comparer. */
  previous: { from: string; to: string; revenue: number; grossMargin: number; salesCount: number; avgBasket: number }
}

export type TopArticlesBy = 'total' | 'quantity' | 'margin'
export interface ReportOptions {
  topCount?: number // 5 à 50
  topBy?: TopArticlesBy
}

/** Ticket de caisse imprimable : le reçu de la vente + le caissier. */
export interface Ticket extends Receipt {
  cashier: string | null
}

// ---------- Consultation et correction des ventes ----------
export interface SaleSummary {
  id: number
  number: string
  createdAt: string
  clientId: number | null
  clientName: string | null
  total: number
  discount: number
  paid: number
  due: number // reste à crédit
  method: PayMethod
  status: 'validee' | 'annulee'
  cancelReason: string | null
  replacedBy: number | null
  cashier: string | null
  itemCount: number
}

export interface SaleDetail extends SaleSummary {
  lines: { articleId: number; designation: string; unit: string; quantity: number; unitPrice: number }[]
  /** L'utilisateur courant peut-il modifier / annuler cette vente ? */
  editable: boolean
}

/** Ligne du relevé de crédit d'un client (vente à crédit ou règlement), avec le solde cumulé. */
export interface StatementEntry {
  date: string
  kind: 'vente' | 'reglement'
  ref: string
  label: string
  debit: number // ajouté à la dette
  credit: number // retranché de la dette
  balance: number // dette après cette ligne
  cancelled: boolean
}

export interface ClientStatement {
  client: Client
  entries: StatementEntry[]
  salesCount: number // ventes validées liées à ce client (tous modes de paiement)
  salesTotal: number
}
