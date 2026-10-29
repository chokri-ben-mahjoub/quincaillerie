import { cn, formatMoney } from '@/lib/utils'

/** Part du plafond de crédit utilisée par un client (barre colorée : vert < 60 %, orange < 90 %, rouge au-delà). */
export function CreditMeter({ balance, limit, compact = false }: { balance: number; limit: number; compact?: boolean }) {
  if (limit <= 0) {
    return <span className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>{balance > 0 ? 'Dette sans plafond' : 'Pas de crédit'}</span>
  }
  const pct = Math.max(0, (balance / limit) * 100)
  const tone = pct >= 90 ? 'bg-destructive' : pct >= 60 ? 'bg-warning' : 'bg-success'
  return (
    <div className={compact ? 'min-w-[8rem]' : 'min-w-[11rem]'}>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="tnum mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{Math.round(pct)} % utilisé</span>
        <span>reste {formatMoney(Math.max(limit - balance, 0))}</span>
      </div>
    </div>
  )
}
