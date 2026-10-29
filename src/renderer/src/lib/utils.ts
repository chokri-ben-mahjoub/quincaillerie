import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const qty = new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 3 })

/** 12.5 -> "12,500 DT" */
export const formatMoney = (n: number) => `${money.format(n)} DT`
export const formatQty = (n: number) => qty.format(n)

/** Texte sans accents ni casse, pour des recherches tolérantes (« electricite » trouve « Électricité »). */
export const norm = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** « 2026-10-29 14:32:10 » ou « 2026-10-29 » -> « 29/10/2026 » */
export const fmtDate = (s: string | null | undefined): string => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '')
