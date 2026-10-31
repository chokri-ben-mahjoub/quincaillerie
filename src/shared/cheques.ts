// Chèques et traites : reçus des clients, émis aux fournisseurs et pour les charges.

export type ChequeDirection = 'recu' | 'emis'
export type ChequeKind = 'cheque' | 'traite'
export type ChequeStatus = 'portefeuille' | 'remis' | 'encaisse' | 'impaye' | 'annule' | 'emis' | 'debite'

export const CHEQUE_STATUS_LABELS: Record<ChequeStatus, string> = {
  portefeuille: 'En portefeuille', remis: 'Remis en banque', encaisse: 'Encaissé', impaye: 'Impayé', annule: 'Annulé',
  emis: 'Émis', debite: 'Débité'
}
/** États possibles selon le sens (l'ordre est celui de la vie du chèque). */
export const STATUSES_BY_DIRECTION: Record<ChequeDirection, ChequeStatus[]> = {
  recu: ['portefeuille', 'remis', 'encaisse', 'impaye', 'annule'],
  emis: ['emis', 'debite', 'impaye', 'annule']
}

export interface Cheque {
  id: number
  direction: ChequeDirection
  kind: ChequeKind
  number: string
  bank: string
  holder: string
  clientId: number | null
  supplierId: number | null
  amount: number
  issueDate: string
  dueDate: string
  status: ChequeStatus
  statusDate: string | null
  refType: string | null
  refLabel: string | null // « Vente V-…», « Facture FA-… », « Dépense … »
  note: string | null
  incomplete: boolean // n° ou banque manquants (saisi automatiquement)
  userName: string | null
  createdAt: string
}

export interface ChequeInput {
  direction: ChequeDirection
  kind: ChequeKind
  number: string
  bank: string
  holder: string
  clientId?: number | null
  supplierId?: number | null
  amount: number
  issueDate: string
  dueDate: string
  note?: string | null
}
