import { datePreset } from '@/components/DataGrid'
import DocumentListPage, { type DocRow } from './DocumentListPage'

const LABELS = { brouillon: 'Brouillon', validee: 'Validée' }
const TONES = { brouillon: 'warning', validee: 'success' } as const

export default function FacturesPage() {
  return (
    <DocumentListPage kind="facture" title="Factures" subtitle="Facturation A4 avec TVA, timbre fiscal et montant en lettres." newLabel="Nouvelle facture"
      api={window.api.invoices as any} partyLabel="Client" totalLabel="Net à payer" statusLabels={LABELS} statusTones={TONES}
      presets={[
        { label: 'Brouillons', filters: { status: 'brouillon' } },
        { label: 'Validées', filters: { status: 'validee' } },
        { label: 'Ce mois', filters: { issueDate: datePreset('month') } }
      ]} />
  )
}

export type { DocRow }
