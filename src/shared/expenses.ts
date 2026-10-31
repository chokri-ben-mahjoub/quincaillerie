// Dépenses du magasin : charges récurrentes (STEG, SONEDE, loyer…) et dépenses ponctuelles.

export type Recurrence = 'aucune' | 'mensuelle' | 'bimestrielle' | 'trimestrielle' | 'semestrielle' | 'annuelle'
export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  aucune: 'Ponctuelle', mensuelle: 'Tous les mois', bimestrielle: 'Tous les 2 mois', trimestrielle: 'Tous les 3 mois',
  semestrielle: 'Tous les 6 mois', annuelle: 'Tous les ans'
}
export const RECURRENCE_MONTHS: Record<Recurrence, number> = { aucune: 0, mensuelle: 1, bimestrielle: 2, trimestrielle: 3, semestrielle: 6, annuelle: 12 }

export type ExpenseMethod = 'especes' | 'cheque' | 'virement' | 'carte' | 'prelevement'
export const EXPENSE_METHOD_LABELS: Record<ExpenseMethod, string> = {
  especes: 'Espèces', cheque: 'Chèque', virement: 'Virement', carte: 'Carte', prelevement: 'Prélèvement'
}

export interface ExpenseCategory {
  id: number
  name: string
  recurrence: Recurrence
  dueDays: number
  color: string
  active: boolean
  usage: number // nombre de dépenses rattachées
}

export interface Expense {
  id: number
  categoryId: number
  categoryName: string
  categoryColor: string
  recurrence: Recurrence
  label: string
  payee: string | null
  reference: string | null
  amount: number
  expenseDate: string
  dueDate: string | null
  status: 'a_payer' | 'payee'
  paidDate: string | null
  method: ExpenseMethod | null
  fromCash: boolean
  note: string | null
  hasAttachment: boolean
  attachmentName: string | null
  generated: boolean
  userName: string | null
  createdAt: string
}

export interface ExpenseInput {
  categoryId: number
  label: string
  payee?: string | null
  reference?: string | null
  amount: number
  expenseDate: string
  dueDate?: string | null
  paid: boolean
  paidDate?: string | null
  method?: ExpenseMethod | null
  fromCash?: boolean
  note?: string | null
  /** undefined : pièce jointe inchangée ; null : retirée ; texte : nouvelle (data URL). */
  attachment?: string | null
  attachmentName?: string | null
}

export interface PayInput {
  paidDate: string
  method: ExpenseMethod
  amount: number // montant réellement payé (peut différer de l'estimation)
  fromCash: boolean
}

export interface ExpenseCategoryInput {
  name: string
  recurrence: Recurrence
  dueDays: number
  color: string
  active: boolean
}
