// Ouverture et clôture de caisse.

/** Détail du calcul des espèces attendues dans le tiroir (montants en DT). */
export interface CashBreakdown {
  openingFloat: number
  cashSales: number // ventes payées en espèces
  creditAdvances: number // acomptes versés sur des ventes à crédit
  creditRepayments: number // règlements de dettes clients
  invoicePayments: number // factures réglées en espèces
  deposits: number // apports
  withdrawals: number // retraits (coffre, banque)
  expenses: number // dépenses payées avec la caisse
  refunds: number // ventes d'une session précédente annulées pendant celle-ci
  expected: number
  // Pour information (ne sont pas dans le tiroir en espèces)
  cardSales: number
  chequesReceived: { count: number; total: number }
  salesCount: number
}

export interface CashMovement { id: number; type: 'apport' | 'retrait'; amount: number; reason: string; userName: string | null; createdAt: string }

export interface CashSession {
  id: number
  status: 'ouverte' | 'cloturee'
  openedAt: string
  openedBy: string | null
  openingFloat: number
  closedAt: string | null
  closedBy: string | null
  expected: number | null
  counted: number | null
  gap: number | null
  counts: Record<string, number> | null
  note: string | null
}

export interface CashSessionDetail extends CashSession {
  breakdown: CashBreakdown
  movements: CashMovement[]
}

export interface CloseInput {
  counts: Record<string, number> // { "20": 7, "0.5": 3 }
  note?: string
}
