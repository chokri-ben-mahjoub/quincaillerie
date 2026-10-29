import { Check, FileOutput, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { datePreset } from '@/components/DataGrid'
import { QUOTE_LABELS } from '@shared/invoice'
import DocumentListPage from './DocumentListPage'

const TONES = { brouillon: 'warning', valide: 'neutral', accepte: 'success', refuse: 'danger', converti: 'success' } as const

export default function DevisPage() {
  return (
    <DocumentListPage kind="devis" title="Devis" subtitle="Offres de prix convertibles en facture en un clic." newLabel="Nouveau devis"
      api={window.api.quotes as any} partyLabel="Client" totalLabel="Total TTC" statusLabels={QUOTE_LABELS} statusTones={TONES}
      presets={[
        { label: 'Brouillons', filters: { status: 'brouillon' } },
        { label: 'Envoyés', filters: { status: 'valide' } },
        { label: 'Acceptés', filters: { status: 'accepte' } },
        { label: 'Convertis', filters: { status: 'converti' } },
        { label: 'Ce mois', filters: { issueDate: datePreset('month') } }
      ]}
      extraActions={(x, run) => (
        <>
          {(x.status === 'valide' || x.status === 'accepte') && (
            <Button size="sm" onClick={() => confirm(`Convertir le devis ${x.number} en facture ? Un brouillon de facture sera créé.`) &&
              run(window.api.quotes.convert(x.id), 'Brouillon de facture créé : retrouvez-le dans Factures pour le vérifier et le valider.')}><FileOutput className="h-4 w-4" />Convertir</Button>
          )}
          {x.status === 'valide' && (
            <>
              <Button variant="ghost" size="icon" title="Marquer accepté" onClick={() => run(window.api.quotes.setStatus(x.id, 'accepte'))}><Check className="h-4 w-4 text-success" /></Button>
              <Button variant="ghost" size="icon" title="Marquer refusé" onClick={() => run(window.api.quotes.setStatus(x.id, 'refuse'))}><X className="h-4 w-4 text-destructive" /></Button>
            </>
          )}
        </>
      )} />
  )
}
