// Page d'accueil « Aujourd'hui » : chaque section vaut null si l'utilisateur n'a pas le droit correspondant.
import type { PayMethod } from './types'

export interface DashboardSale {
  id: number
  number: string
  time: string // HH:MM
  clientName: string | null
  total: number
  method: PayMethod
  cancelled: boolean
}

export interface DashboardData {
  sales: {
    count: number
    total: number
    margin: number | null // null : réservé aux rôles qui ont accès aux Rapports
    avgBasket: number
    yesterdaySameTime: number // CA d'hier à la même heure, pour comparer
    byHour: { hour: number; today: number; yesterday: number }[]
    byMethod: { method: PayMethod; total: number }[]
    creditToday: number // reste dû des ventes à crédit du jour
    cashOut: number // dépenses payées aujourd'hui avec l'argent de la caisse
    cancelledCount: number
    last: DashboardSale[]
  } | null
  stock: { out: number; low: number; items: { id: number; designation: string; stock: number; minStock: number; unit: string }[] } | null
  invoices: {
    unpaidCount: number; unpaidTotal: number; overdueCount: number; overdueTotal: number
    items: { id: number; number: string; clientName: string; dueDate: string | null; remaining: number; overdueDays: number }[]
  } | null
  clients: { debtorCount: number; debtTotal: number } | null
  lots: { expired: number; soon: number; pending: number } | null
  expenses: {
    dueCount: number; dueTotal: number; overdueCount: number
    items: { id: number; label: string; categoryName: string; amount: number; dueDate: string; overdue: boolean }[]
  } | null
  cash: { open: boolean; openedAt: string | null; stale: boolean } | null // stale : ouverte un jour précédent, jamais clôturée
  cheques: {
    toDeposit: { count: number; total: number } // reçus, en portefeuille, encaissables d'ici X jours
    toProvision: { id: number; holder: string; number: string; amount: number; dueDate: string }[] // émis, à débiter bientôt
    unpaid: { count: number; total: number }
    incomplete: number // saisis automatiquement, n° ou banque manquants
  } | null
}

/** Pastilles de la barre latérale, par page. */
export type NavBadges = Partial<Record<string, number>>
