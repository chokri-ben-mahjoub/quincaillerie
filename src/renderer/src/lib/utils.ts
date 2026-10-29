import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

const money = new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const qty = new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 3 })

/** 12.5 -> "12,500 DT" */
export const formatMoney = (n: number) => `${money.format(n)} DT`
export const formatQty = (n: number) => qty.format(n)
