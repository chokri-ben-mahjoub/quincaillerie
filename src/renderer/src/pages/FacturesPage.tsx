import { useState } from 'react'
import { HandCoins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { datePreset } from '@/components/DataGrid'
import InvoicePaymentsDialog, { type PaymentTarget } from '@/components/InvoicePaymentsDialog'
import DocumentListPage, { type DocRow } from './DocumentListPage'

const LABELS = { brouillon: 'Brouillon', validee: 'Validée' }
const TONES = { brouillon: 'warning', validee: 'success' } as const

export default function FacturesPage() {
  const [payFor, setPayFor] = useState<PaymentTarget | null>(null)
  const [reload, setReload] = useState(0)

  return (
    <>
      <DocumentListPage kind="facture" title="Factures" subtitle="Facturation A4 avec TVA, timbre fiscal et montant en lettres." newLabel="Nouvelle facture"
        api={window.api.invoices as any} partyLabel="Client" totalLabel="Net à payer" statusLabels={LABELS} statusTones={TONES} reloadSignal={reload}
        extraActions={(r) => r.status === 'validee' && (
          <Button variant="ghost" size="icon" title="Règlements (encaisser, historique, reste à payer)" onClick={() => setPayFor(r)}>
            <HandCoins className="h-4 w-4" />
          </Button>
        )}
        presets={[
          { label: 'Brouillons', filters: { status: 'brouillon' } },
          { label: 'Validées', filters: { status: 'validee' } },
          { label: 'Ce mois', filters: { issueDate: datePreset('month') } }
        ]} />
      <InvoicePaymentsDialog invoice={payFor} onClose={() => setPayFor(null)} onChanged={() => setReload((n) => n + 1)} />
    </>
  )
}

export type { DocRow }
