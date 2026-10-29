import type { DocKind } from './invoice'

// Types du partage de documents (WhatsApp / e-mail), communs au processus principal et à l'interface.

export interface ShareDraft {
  phone: string
  email: string
  whatsappMessage: string
  emailSubject: string
  emailBody: string
}

export interface ShareRequest {
  kind: DocKind
  id: number
  channel: 'whatsapp' | 'email'
  phone: string
  email: string
  subject: string
  message: string // WhatsApp : le message ; e-mail : le corps
}
