// Détection des imprimantes déjà installées sur le poste du client.

export type PrinterKind = 'ticket' | 'a4' | 'virtuelle'
export type PrinterLink = 'usb' | 'reseau' | 'bluetooth' | 'partagee' | 'virtuelle' | 'inconnue'
export type PrinterState = 'prete' | 'hors_ligne' | 'erreur' | 'papier' | 'pause' | 'inconnu'

export const KIND_LABELS: Record<PrinterKind, string> = { ticket: 'Ticket (thermique)', a4: 'Documents A4', virtuelle: 'Virtuelle (fichier)' }
export const LINK_LABELS: Record<PrinterLink, string> = {
  usb: 'USB', reseau: 'Réseau', bluetooth: 'Bluetooth', partagee: 'Partagée', virtuelle: 'Logicielle', inconnue: 'Connexion inconnue'
}
export const STATE_LABELS: Record<PrinterState, string> = {
  prete: 'Prête', hors_ligne: 'Hors ligne', erreur: 'En erreur', papier: 'Problème de papier', pause: 'En pause', inconnu: 'État inconnu'
}

export interface DetectedPrinter {
  name: string // nom système (celui qu'on enregistre)
  displayName: string
  driver: string
  port: string
  isDefault: boolean // imprimante par défaut de Windows
  kind: PrinterKind
  paperMm: 58 | 80 | null // largeur de rouleau devinée pour un ticket
  link: PrinterLink
  state: PrinterState
}

export interface PrinterDetection {
  printers: DetectedPrinter[]
  /** Pour chaque usage : imprimante enregistrée, si elle est trouvée, et ce que la détection propose. */
  ticket: { configured: string; found: boolean; suggestion: string; paperMm: 58 | 80 | null }
  a4: { configured: string; found: boolean; suggestion: string }
}
