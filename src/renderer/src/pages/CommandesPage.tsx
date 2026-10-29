import { PackageCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { datePreset } from '@/components/DataGrid'
import { ORDER_LABELS } from '@shared/invoice'
import DocumentListPage from './DocumentListPage'

const TONES = { brouillon: 'warning', valide: 'neutral', recu: 'success' } as const

/** Bons de commande adressés aux fournisseurs (A4, même modèle que facture et devis). */
export default function CommandesPage() {
  return (
    <DocumentListPage kind="bon_commande" title="Bons de commande" subtitle="Commandes envoyées à vos fournisseurs." newLabel="Nouveau bon de commande"
      api={window.api.orders as any} partyLabel="Fournisseur" totalLabel="Total TTC" statusLabels={ORDER_LABELS} statusTones={TONES}
      presets={[
        { label: 'Brouillons', filters: { status: 'brouillon' } },
        { label: 'Envoyés', filters: { status: 'valide' } },
        { label: 'Reçus', filters: { status: 'recu' } },
        { label: 'Ce mois', filters: { issueDate: datePreset('month') } }
      ]}
      extraActions={(o, run) => o.status === 'valide' && (
        <Button size="sm" variant="outline" onClick={() => run(window.api.orders.setReceived(o.id), 'Bon de commande marqué reçu.')}><PackageCheck className="h-4 w-4" />Marquer reçu</Button>
      )} />
  )
}
