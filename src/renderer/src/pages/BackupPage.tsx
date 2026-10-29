import { useCallback, useEffect, useState } from 'react'
import { DatabaseBackup, FolderOpen, History, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import type { BackupConfig, BackupInfo } from '@shared/types'

const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${Math.max(Math.round(b / 1024), 1)} Ko`)
const fmtDate = (iso: string) => new Date(iso).toLocaleString('fr-FR')

export default function BackupPage() {
  const [config, setConfig] = useState<BackupConfig | null>(null)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [toRestore, setToRestore] = useState<BackupInfo | null>(null)

  const load = useCallback(async () => {
    const [c, l] = await Promise.all([window.api.backup.config(), window.api.backup.list()])
    if (c.ok) setConfig(c.data)
    if (l.ok) setBackups(l.data)
  }, [])
  useEffect(() => { load() }, [load])

  async function backupNow() {
    setBusy(true)
    const r = await window.api.backup.now()
    setBusy(false)
    setMessage(r.ok ? `Sauvegarde créée : ${r.data}` : r.error)
    load()
  }
  async function chooseDir() {
    const r = await window.api.backup.chooseDir()
    if (r.ok && r.data) load()
  }
  async function saveKeep(n: number) {
    await window.api.backup.setKeep(n)
    load()
  }
  async function restore() {
    if (!toRestore) return
    const r = await window.api.backup.restore(toRestore.name) // en cas de succès, l'application redémarre
    setToRestore(null)
    if (!r.ok) setMessage(r.error)
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sauvegarde</h1>
          <p className="text-muted-foreground">Une sauvegarde automatique est faite chaque jour. Conservez aussi une copie sur une clé USB.</p>
        </div>
        <Button onClick={backupNow} disabled={busy}><DatabaseBackup className="h-4 w-4" />{busy ? 'Sauvegarde…' : 'Sauvegarder maintenant'}</Button>
      </header>

      {message && <p className="rounded-md bg-muted px-3 py-2 text-sm">{message}</p>}

      {config && (
        <section className="grid grid-cols-[1fr_auto_auto] items-end gap-6 rounded-lg border bg-card p-5 shadow-soft">
          <div>
            <Label>Dossier de sauvegarde</Label>
            <div className="flex gap-2">
              <Input readOnly value={config.dir} className="font-mono text-[13px]" />
              <Button variant="outline" onClick={chooseDir}><FolderOpen className="h-4 w-4" />Changer</Button>
            </div>
          </div>
          <div className="w-40">
            <Label>Copies conservées</Label>
            <Input type="number" min={1} max={365} defaultValue={config.keep} onBlur={(e) => saveKeep(parseInt(e.target.value, 10) || 14)} />
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground">Dernière sauvegarde</div>
            <div className="font-semibold">{config.last ? fmtDate(config.last) : 'Jamais'}</div>
          </div>
        </section>
      )}

      <section className="rounded-lg border bg-card shadow-soft">
        <div className="flex items-center gap-2 border-b p-4 font-semibold"><History className="h-4 w-4" />Sauvegardes disponibles</div>
        <table className="w-full text-sm">
          <tbody>
            {backups.map((b, i) => (
              <tr key={b.name} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3 font-mono text-[13px]">{b.name}{i === 0 && <Badge tone="success" className="ml-2">Récente</Badge>}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(b.createdAt)}</td>
                <td className="tnum px-4 py-3 text-muted-foreground">{fmtSize(b.size)}</td>
                <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setToRestore(b)}><RotateCcw className="h-4 w-4" />Restaurer</Button></td>
              </tr>
            ))}
            {!backups.length && <tr><td className="py-16 text-center text-muted-foreground">Aucune sauvegarde pour le moment.</td></tr>}
          </tbody>
        </table>
      </section>

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
    </div>
  )
}
