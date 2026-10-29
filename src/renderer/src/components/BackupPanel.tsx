import { useCallback, useEffect, useState } from 'react'
import { DatabaseBackup, History, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { BackupConfig, BackupInfo } from '@shared/types'

const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${Math.max(Math.round(b / 1024), 1)} Ko`)
const fmtDate = (iso: string) => new Date(iso).toLocaleString('fr-FR')

/** Sauvegarde manuelle, liste des copies et restauration (Paramètres > Sauvegarde). `reloadKey` force la relecture après un changement de dossier. */
export default function BackupPanel({ reloadKey }: { reloadKey: string }) {
  const [config, setConfig] = useState<BackupConfig | null>(null)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [toRestore, setToRestore] = useState<BackupInfo | null>(null)

  const load = useCallback(async () => {
    const [c, l] = await Promise.all([window.api.backup.config(), window.api.backup.list()])
    if (c.ok) setConfig(c.data)
    if (l.ok) setBackups(l.data); else setMessage(l.error)
  }, [])
  useEffect(() => { load() }, [load, reloadKey])

  async function backupNow() {
    setBusy(true)
    const r = await window.api.backup.now()
    setBusy(false)
    setMessage(r.ok ? `Sauvegarde créée : ${r.data}` : r.error)
    load()
  }
  async function restore() {
    if (!toRestore) return
    const r = await window.api.backup.restore(toRestore.name) // en cas de succès, l'application redémarre
    setToRestore(null)
    if (!r.ok) setMessage(r.error)
  }

  return (
    <section className="rounded-lg border bg-card shadow-soft">
      <div className="flex items-center justify-between border-b p-5">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><History className="h-4 w-4" />Sauvegardes disponibles</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Dossier : <span className="font-mono text-[13px]">{config?.dir}</span> — dernière sauvegarde : <b>{config?.last ? fmtDate(config.last) : 'jamais'}</b>
          </p>
        </div>
        <Button onClick={backupNow} disabled={busy}><DatabaseBackup className="h-4 w-4" />{busy ? 'Sauvegarde…' : 'Sauvegarder maintenant'}</Button>
      </div>
      {message && <p className="border-b bg-muted px-5 py-2 text-sm">{message}</p>}
      <table className="w-full text-sm">
        <tbody>
          {backups.map((b, i) => (
            <tr key={b.name} className="border-b last:border-0 hover:bg-muted/50">
              <td className="px-5 py-3 font-mono text-[13px]">{b.name}{i === 0 && <Badge tone="success" className="ml-2">Récente</Badge>}</td>
              <td className="px-4 py-3 text-muted-foreground">{fmtDate(b.createdAt)}</td>
              <td className="tnum px-4 py-3 text-muted-foreground">{fmtSize(b.size)}</td>
              <td className="px-5 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setToRestore(b)}><RotateCcw className="h-4 w-4" />Restaurer</Button></td>
            </tr>
          ))}
          {!backups.length && <tr><td className="py-12 text-center text-muted-foreground">Aucune sauvegarde dans ce dossier.</td></tr>}
        </tbody>
      </table>

      <Dialog open={!!toRestore} onOpenChange={(o) => !o && setToRestore(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Restaurer cette sauvegarde ?</DialogTitle>
          <DialogDescription>
            Les données actuelles seront remplacées par celles du {toRestore && fmtDate(toRestore.createdAt)}. L’état actuel est d’abord sauvegardé, puis l’application redémarre.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setToRestore(null)}>Annuler</Button>
            <Button variant="destructive" onClick={restore}>Restaurer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
