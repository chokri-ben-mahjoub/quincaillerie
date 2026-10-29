import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { ScanBarcode } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn, formatMoney, formatQty, norm } from '@/lib/utils'
import type { Article } from '@shared/types'

/**
 * Recherche d'article ultra-rapide pour la saisie de documents : plusieurs mots (« vis 4x40 inox »), code-barres exact (scanner),
 * résultats classés, navigation ↑ ↓, Entrée pour choisir. Après le choix la saisie se vide et reste prête pour le suivant.
 */
interface Props {
  articles: Article[]
  onPick: (a: Article) => void
  placeholder?: string
  priceOf?: (a: Article) => number // prix affiché (HT)
  className?: string
}

export const ArticleSearchBox = forwardRef<HTMLInputElement, Props>(function ArticleSearchBox({ articles, onPick, placeholder, priceOf, className }, ref) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  // Index normalisé une seule fois (3000 articles : la frappe reste instantanée).
  const index = useMemo(() => articles.map((a) => ({ a, hay: norm(`${a.designation} ${a.barcode} ${a.categoryName ?? ''}`), name: norm(a.designation), code: a.barcode.toLowerCase() })), [articles])

  const results = useMemo(() => {
    const tokens = norm(q).split(/\s+/).filter(Boolean)
    if (!tokens.length) return []
    const raw = q.trim().toLowerCase()
    const hits = index.filter((x) => x.code === raw || tokens.every((t) => x.hay.includes(t)))
    // Classement : code-barres exact, puis désignation commençant par la saisie, puis le reste.
    const score = (x: (typeof index)[number]) => (x.code === raw ? 0 : x.name.startsWith(tokens[0]) ? 1 : x.name.includes(tokens[0]) ? 2 : 3)
    return hits.sort((p, r) => score(p) - score(r)).slice(0, 8).map((x) => x.a)
  }, [index, q])

  useEffect(() => setHi(0), [q])
  useEffect(() => {
    const close = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function pick(a: Article) {
    onPick(a)
    setQ(''); setOpen(false)
  }

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      <ScanBarcode className="absolute left-3.5 top-3.5 h-5 w-5 text-primary" />
      <Input ref={ref} value={q} placeholder={placeholder ?? 'Rechercher un article : nom, plusieurs mots ou code-barres…  (F2)'} className="h-12 pl-11 text-base"
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => q && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, results.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
          else if (e.key === 'Enter') { if (results.length) { e.preventDefault(); e.stopPropagation(); pick(results[hi] ?? results[0]) } }
          else if (e.key === 'Escape' && (q || open)) { e.preventDefault(); e.stopPropagation(); setQ(''); setOpen(false) }
        }} />
      {open && q.trim() && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border bg-card shadow-soft">
          {results.map((a, i) => (
            <button key={a.id} type="button" onMouseEnter={() => setHi(i)} onClick={() => pick(a)}
              className={cn('flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left text-sm', i === hi ? 'bg-primary/10' : 'hover:bg-muted')}>
              <span className="min-w-0">
                <span className="block truncate font-medium">{a.designation}</span>
                <span className="font-mono text-xs text-muted-foreground">{a.barcode}{a.categoryName ? ` · ${a.categoryName}` : ''}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="tnum block font-semibold">{formatMoney(priceOf ? priceOf(a) : a.salePrice)}</span>
                <span className={cn('text-xs', a.stock <= 0 ? 'text-destructive' : a.stock <= a.minStock ? 'text-warning' : 'text-muted-foreground')}>Stock {formatQty(a.stock)} {a.unit}</span>
              </span>
            </button>
          ))}
          {!results.length && <div className="px-4 py-3 text-sm text-muted-foreground">Aucun article. Appuyez sur <kbd className="rounded border bg-muted px-1.5 font-mono text-xs">Inser</kbd> pour une ligne libre.</div>}
          {results.length > 0 && <div className="border-t bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">↑ ↓ pour choisir · Entrée pour ajouter</div>}
        </div>
      )}
    </div>
  )
})
