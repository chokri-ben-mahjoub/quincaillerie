// Types des données de démonstration (Paramètres > Données).

export interface DemoOptions {
  articles: number // nombre d'articles à ajouter (0 = aucun)
  partners: boolean // fournisseurs et clients
  purchases: boolean // réceptions de marchandise (achats datés)
  salesDays: number // jours d'historique de ventes (0 = aucune vente)
  documents: boolean // factures, devis, bons de commande et de livraison
}

export interface DemoReport {
  articles: number
  suppliers: number
  clients: number
  purchases: number
  sales: number
  clientPayments: number
  invoices: number
  quotes: number
  orders: number
  deliveries: number
  ms: number
}

export interface DemoStats {
  articles: number
  clients: number
  suppliers: number
  sales: number
  purchases: number
  invoices: number
  quotes: number
  orders: number
  deliveries: number
  movements: number
}

export interface ResetOptions {
  keepSettings: boolean // société, taxes, documents, droits…
  keepUsers: boolean // comptes utilisateurs
  confirm: string // doit valoir « VIDER »
}
