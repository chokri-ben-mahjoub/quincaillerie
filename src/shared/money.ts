// Les montants sont stockés en millimes (entiers) pour éviter les erreurs d'arrondi des flottants.
// 12.500 DT  <->  12500 en base.

export const toMillimes = (dinars: number): number => Math.round((Number(dinars) || 0) * 1000)
export const fromMillimes = (millimes: number): number => (Number(millimes) || 0) / 1000
