import { ipcMain } from 'electron'
import { getDb } from '../db'
import { currentUser } from './auth'
import type { MovementInput, Result, StockMovement } from '@shared/types'

// Même enveloppe { ok, data } que le module Articles.
function handle<T>(channel: string, fn: (...args: any[]) => T): void {
  ipcMain.handle(channel, (_e, ...args): Result<T> => {
    try {
      return { ok: true, data: fn(...args) }
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) }
    }
  })
}

// Les types qui sortent du stock ne peuvent être saisis qu'avec direction "out" (et inversement).
const FORCED_DIRECTION: Record<string, 'in' | 'out' | undefined> = {
  perte: 'out', retour_fournisseur: 'out', retour_client: 'in', ajustement: undefined
}

function listMovements(articleId?: number, limit = 300): StockMovement[] {
  const rows = getDb().prepare(`
    SELECT m.id, m.article_id, a.barcode, a.designation, a.unit, m.type, m.quantity, m.note, m.created_at
    FROM stock_movements m JOIN articles a ON a.id = m.article_id
    WHERE (? IS NULL OR m.article_id = ?)
    ORDER BY m.id DESC LIMIT ?`).all(articleId ?? null, articleId ?? null, limit) as any[]
  return rows.map((r) => ({
    id: r.id, articleId: r.article_id, barcode: r.barcode, designation: r.designation, unit: r.unit,
    type: r.type, quantity: r.quantity, note: r.note, createdAt: r.created_at
  }))
}

function addMovement(m: MovementInput): void {
  const db = getDb()
  if (!(m.quantity > 0)) throw new Error('La quantité doit être supérieure à zéro.')
  const forced = FORCED_DIRECTION[m.type]
  if (forced && forced !== m.direction) throw new Error('Sens incompatible avec ce type de mouvement.')
  const signed = m.direction === 'out' ? -m.quantity : m.quantity

  // Vérification du stock et insertion dans la même transaction.
  db.transaction(() => {
    const art = db.prepare('SELECT stock, purchase_price FROM articles WHERE id = ? AND active = 1').get(m.articleId) as
      { stock: number; purchase_price: number } | undefined
    if (!art) throw new Error('Article introuvable.')
    if (art.stock + signed < 0) throw new Error(`Stock insuffisant (disponible : ${art.stock}).`)
    db.prepare(`INSERT INTO stock_movements(article_id, type, quantity, unit_cost, note, user_id) VALUES (?,?,?,?,?,?)`)
      .run(m.articleId, m.type, signed, art.purchase_price, m.note.trim() || null, currentUser()?.id ?? null)
  })()
}

export function registerStockHandlers(): void {
  handle('stock:movements', (articleId?: number) => listMovements(articleId))
  handle('stock:add', (m: MovementInput) => addMovement(m))
}
