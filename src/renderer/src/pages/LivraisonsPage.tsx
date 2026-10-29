import { PackageCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { datePreset } from '@/components/DataGrid'
import { DELIVERY_LABELS } from '@shared/invoice'
import DocumentListPage from './DocumentListPage'

const TONES = { brouillon: 'warning', valide: 'neutral', livre: 'success' } as const

/** Bons de livraison remis aux clients (A4, même modèle que facture et devis). Sans effet sur le stock. */
export default function LivraisonsPage() {
  return (
    <DocumentListPage kind="bon_livraison" title="Bons de livraison" subtitle="Marchandises remises à vos clients, avec signature de réception." newLabel="Nouveau bon de livraison"
      api={window.api.deliveries as any} partyLabel="Client" totalLabel="Total TTC" statusLabels={DELIVERY_LABELS} statusTones={TONES}
      presets={[
        { label: 'Brouillons', filters: { status: 'brouillon' } },
        { label: 'Validés', filters: { status: 'valide' } },
        { label: 'Livrés', filters: { status: 'livre' } },
        { label: 'Ce mois', filters: { issueDate: datePreset('month') } }
      ]}
      extraActions={(n, run) => n.status === 'valide' && (
        <Button size="sm" variant="outline" onClick={() => run(window.api.deliveries.setDelivered(n.id), 'Bon de livraison marqué livré.')}><PackageCheck className="h-4 w-4" />Marquer livré</Button>
      )} />
  )
}
