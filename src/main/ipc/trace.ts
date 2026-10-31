import { ipcMain } from 'electron'
import { getDb } from '../db'
import { currentUser } from './auth'
import { fromMillimes } from '@shared/money'
import { auditLabel } from '@shared/trace'
import type { Result } from '@shared/types'
import type {
  ArticleEvent, AuditEntry, Lot, LotDetail, LotEvent, PendingReception, ReceiveInput, TrackedArticle, TrackingMode
} from '@shared/trace'

// Même enveloppe { ok, data } que les autres modules.
function handle<T>(channel: string, fn: (...args: any[]) => T): void {
  ipcMain.handle(channel, (_e, ...args): Result<T> => {
    try {
      return { ok: true, data: fn(...args) }
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) }
    }
  })
}

const EPS = 0.0005
const round3 = (n: number) => Math.round(n * 1000) / 1000

// ---------- Articles suivis ----------
const SELECT_TRACKED = `
  SELECT a.id, a.barcode, a.designation, a.unit, c.name AS category_name, a.tracking, a.tracking_since, a.stock,
         COALESCE((SELECT SUM(quantity_left) FROM lots WHERE article_id = a.id AND quantity_left > ${EPS}), 0) AS in_lots,
         (SELECT COUNT(*) FROM lots WHERE article_id = a.id AND quantity_left > ${EPS}) AS lot_count
  FROM articles a LEFT JOIN categories c ON c.id = a.category_id
  WHERE a.active = 1`

function mapTracked(r: any): TrackedArticle {
  const inLots = round3(r.in_lots)
  return {
    id: r.id, barcode: r.barcode, designation: r.designation, unit: r.unit, categoryName: r.category_name,
    tracking: r.tracking, trackingSince: r.tracking_since, stock: r.stock, inLots,
    unidentified: r.tracking === 'aucun' ? 0 : Math.max(0, round3(r.stock - inLots)), lotCount: r.lot_count
  }
}

function setTracking(articleId: number, mode: TrackingMode): void {
  if (!['aucun', 'lot', 'serie'].includes(mode)) throw new Error('Mode de suivi invalide.')
  const db = getDb()
  const a = db.prepare('SELECT tracking FROM articles WHERE id = ? AND active = 1').get(articleId) as { tracking: TrackingMode } | undefined
  if (!a) throw new Error('Article introuvable.')
  if (a.tracking === mode) return
  // Changer de mode alors que des lots existent mélangerait lots et numéros de série : on l'interdit.
  const used = (db.prepare(`SELECT COUNT(*) AS n FROM lots WHERE article_id = ? AND quantity_left > ${EPS}`).get(articleId) as any).n
  if (used > 0) throw new Error('Cet article a encore des lots en stock : impossible de changer son mode de suivi.')
  const existing = (db.prepare('SELECT COUNT(*) AS n FROM lots WHERE article_id = ?').get(articleId) as any).n
  if (existing > 0 && mode !== 'aucun' && a.tracking !== 'aucun') throw new Error('Des lots existent déjà pour cet article : son mode ne peut plus passer de « lot » à « série » (ou l’inverse).')
  db.prepare(`UPDATE articles SET tracking = ?, tracking_since = CASE WHEN ? = 'aucun' THEN NULL ELSE datetime('now','localtime') END,
              updated_at = datetime('now','localtime') WHERE id = ?`).run(mode, mode, articleId)
}

// ---------- Lots ----------
const SELECT_LOTS = `
  SELECT l.id, l.article_id, a.barcode, a.designation, a.unit, l.code, l.kind, s.name AS supplier_name, l.purchase_id,
         p.reference AS purchase_ref, l.expiry_date, l.quantity_in, l.quantity_left, l.note, u.full_name AS user_name, l.created_at
  FROM lots l JOIN articles a ON a.id = l.article_id
  LEFT JOIN suppliers s ON s.id = l.supplier_id LEFT JOIN purchases p ON p.id = l.purchase_id LEFT JOIN users u ON u.id = l.user_id`

const mapLot = (r: any): Lot => ({
  id: r.id, articleId: r.article_id, barcode: r.barcode, designation: r.designation, unit: r.unit, code: r.code, kind: r.kind,
  supplierName: r.supplier_name, purchaseId: r.purchase_id, purchaseRef: r.purchase_ref ?? (r.purchase_id ? `Achat #${r.purchase_id}` : null),
  expiryDate: r.expiry_date, quantityIn: r.quantity_in, quantityLeft: Math.max(0, round3(r.quantity_left)), note: r.note,
  userName: r.user_name, createdAt: r.created_at
})

function getLot(id: number): LotDetail {
  const db = getDb()
  const r = db.prepare(SELECT_LOTS + ' WHERE l.id = ?').get(id)
  if (!r) throw new Error('Lot introuvable.')
  const events = (db.prepare(`
    SELECT lm.id, COALESCE(m.created_at, lm.created_at) AS date, lm.quantity, m.type, lm.note, lm.movement_id,
           CASE m.ref_type WHEN 'sale' THEN 'Vente ' || sa.number
                           WHEN 'purchase' THEN COALESCE('Achat ' || p.reference, 'Achat #' || p.id) END AS doc_label,
           CASE m.ref_type WHEN 'sale' THEN c.name WHEN 'purchase' THEN sp.name END AS party,
           u.full_name AS user_name
    FROM lot_movements lm
    LEFT JOIN stock_movements m ON m.id = lm.movement_id
    LEFT JOIN sales sa ON m.ref_type = 'sale' AND sa.id = m.ref_id
    LEFT JOIN clients c ON c.id = sa.client_id
    LEFT JOIN purchases p ON m.ref_type = 'purchase' AND p.id = m.ref_id
    LEFT JOIN suppliers sp ON sp.id = p.supplier_id
    LEFT JOIN users u ON u.id = COALESCE(lm.user_id, m.user_id)
    WHERE lm.lot_id = ? ORDER BY lm.id`).all(id) as any[])
    .map((e): LotEvent => ({
      id: e.id, date: e.date, quantity: e.quantity, type: e.type ?? null, docLabel: e.doc_label, party: e.party,
      userName: e.user_name, note: e.note, movementId: e.movement_id,
      reassignable: e.quantity < 0 && e.movement_id !== null
    }))
  return { ...mapLot(r), events }
}

/** Saisie de lots / n° de série : à réception d'un achat, ou pour identifier un stock déjà présent. */
function receive(input: ReceiveInput): number {
  const db = getDb()
  return db.transaction(() => {
    const a = db.prepare('SELECT id, tracking, stock FROM articles WHERE id = ? AND active = 1').get(input.articleId) as any
    if (!a) throw new Error('Article introuvable.')
    if (a.tracking === 'aucun') throw new Error('Cet article n’est pas suivi : choisissez d’abord son mode de suivi.')
    const serial = a.tracking === 'serie'

    // Nettoyage : codes non vides, sans doublon ; un n° de série vaut toujours 1 unité.
    const seen = new Set<string>()
    const entries = input.entries.map((e) => {
      const code = String(e.code ?? '').trim()
      if (!code) throw new Error('Chaque lot doit avoir un code.')
      const key = code.toLowerCase()
      if (seen.has(key)) throw new Error(`Le code « ${code} » est saisi deux fois.`)
      seen.add(key)
      const quantity = serial ? 1 : Number(e.quantity)
      if (!(quantity > 0)) throw new Error(`Quantité invalide pour le lot « ${code} ».`)
      const expiry = e.expiryDate ? String(e.expiryDate).slice(0, 10) : null
      if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) throw new Error(`Date limite invalide pour « ${code} ».`)
      return { code, quantity, expiry }
    })
    if (!entries.length) throw new Error('Saisissez au moins un lot ou un numéro de série.')
    const total = entries.reduce((s, e) => s + e.quantity, 0)

    const exists = db.prepare('SELECT 1 FROM lots WHERE article_id = ? AND code = ?')
    for (const e of entries) if (exists.get(a.id, e.code)) throw new Error(`Le ${serial ? 'numéro de série' : 'lot'} « ${e.code} » existe déjà pour cet article.`)

    let supplierId: number | null = null
    let movementId: number | null = null
    if (input.purchaseId) {
      const p = db.prepare('SELECT id, supplier_id FROM purchases WHERE id = ?').get(input.purchaseId) as any
      if (!p) throw new Error('Achat introuvable.')
      const bought = (db.prepare('SELECT COALESCE(SUM(quantity), 0) AS q FROM purchase_items WHERE purchase_id = ? AND article_id = ?').get(p.id, a.id) as any).q
      if (!(bought > 0)) throw new Error('Cet article ne fait pas partie de cet achat.')
      const done = (db.prepare('SELECT COALESCE(SUM(quantity_in), 0) AS q FROM lots WHERE purchase_id = ? AND article_id = ?').get(p.id, a.id) as any).q
      if (total > bought - done + EPS) throw new Error(`Cet achat ne compte plus que ${round3(bought - done)} unité(s) à identifier.`)
      supplierId = p.supplier_id
      movementId = (db.prepare(`SELECT id FROM stock_movements WHERE ref_type = 'purchase' AND ref_id = ? AND article_id = ? AND type = 'achat' ORDER BY id LIMIT 1`)
        .get(p.id, a.id) as any)?.id ?? null
    }

    // Règle d'or : les lots ne peuvent jamais contenir plus que le stock réel.
    const inLots = (db.prepare(`SELECT COALESCE(SUM(quantity_left), 0) AS q FROM lots WHERE article_id = ? AND quantity_left > ${EPS}`).get(a.id) as any).q
    const free = round3(a.stock - inLots)
    if (total > free + EPS) throw new Error(`Seulement ${Math.max(0, free)} unité(s) de stock restent à identifier pour cet article.`)

    const uid = currentUser()?.id ?? null
    const note = input.note?.trim() || null
    const addLot = db.prepare(`INSERT INTO lots(article_id, code, kind, supplier_id, purchase_id, expiry_date, quantity_in, note, user_id)
                               VALUES (?,?,?,?,?,?,?,?,?)`)
    // L'entrée dans le lot passe par son journal (le trigger renseigne quantity_left).
    const addEvent = db.prepare('INSERT INTO lot_movements(lot_id, movement_id, quantity, note, user_id) VALUES (?,?,?,?,?)')
    for (const e of entries) {
      const lotId = Number(addLot.run(a.id, e.code, a.tracking, supplierId, input.purchaseId ?? null, e.expiry, e.quantity, note, uid).lastInsertRowid)
      addEvent.run(lotId, movementId, e.quantity, movementId ? 'Réception' : 'Identification du stock existant', uid)
    }
    return entries.length
  })()
}

/**
 * Corrige le lot d'une sortie (ex. le caissier a vendu le n° de série X, pas celui choisi automatiquement).
 * Rien n'est effacé : on ajoute une contre-écriture sur l'ancien lot et une sortie sur le nouveau.
 */
function reassign(lotMovementId: number, newLotId: number): void {
  const db = getDb()
  db.transaction(() => {
    const ev = db.prepare('SELECT lm.*, l.article_id FROM lot_movements lm JOIN lots l ON l.id = lm.lot_id WHERE lm.id = ?').get(lotMovementId) as any
    if (!ev || !(ev.quantity < 0) || ev.movement_id === null) throw new Error('Seule une sortie peut être réaffectée.')
    // Déjà corrigée ? (la quantité nette de ce mouvement sur ce lot doit encore couvrir la sortie)
    const net = (db.prepare('SELECT COALESCE(SUM(quantity), 0) AS q FROM lot_movements WHERE lot_id = ? AND movement_id = ?').get(ev.lot_id, ev.movement_id) as any).q
    const qty = -ev.quantity
    if (-net < qty - EPS) throw new Error('Cette sortie a déjà été corrigée ou retournée.')
    const target = db.prepare('SELECT id, article_id, code, quantity_left FROM lots WHERE id = ?').get(newLotId) as any
    if (!target || target.id === ev.lot_id) throw new Error('Choisissez un autre lot.')
    if (target.article_id !== ev.article_id) throw new Error('Le lot choisi concerne un autre article.')
    if (target.quantity_left < qty - EPS) throw new Error(`Le lot « ${target.code} » n’a pas assez de stock (${round3(target.quantity_left)}).`)
    const uid = currentUser()?.id ?? null
    const add = db.prepare('INSERT INTO lot_movements(lot_id, movement_id, quantity, note, user_id) VALUES (?,?,?,?,?)')
    add.run(ev.lot_id, ev.movement_id, qty, `Correction : réaffecté au lot ${target.code}`, uid)
    add.run(target.id, ev.movement_id, -qty, 'Correction d’affectation', uid)
  })()
}

function pending(): PendingReception[] {
  return (getDb().prepare(`
    SELECT pi.purchase_id, p.reference, p.created_at, sp.name AS supplier_name, a.id AS article_id, a.barcode, a.designation, a.unit,
           a.tracking, SUM(pi.quantity) AS quantity,
           COALESCE((SELECT SUM(quantity_in) FROM lots WHERE purchase_id = pi.purchase_id AND article_id = pi.article_id), 0) AS identified
    FROM purchase_items pi
    JOIN purchases p ON p.id = pi.purchase_id
    JOIN articles a ON a.id = pi.article_id AND a.tracking <> 'aucun' AND a.active = 1
    LEFT JOIN suppliers sp ON sp.id = p.supplier_id
    WHERE p.created_at >= COALESCE(a.tracking_since, '9999')
    GROUP BY pi.purchase_id, pi.article_id
    HAVING identified < quantity - ${EPS}
    ORDER BY p.id DESC LIMIT 500`).all() as any[]).map((r) => ({
    purchaseId: r.purchase_id, purchaseRef: r.reference, purchaseDate: r.created_at, supplierName: r.supplier_name,
    articleId: r.article_id, barcode: r.barcode, designation: r.designation, unit: r.unit, tracking: r.tracking,
    quantity: r.quantity, identified: round3(r.identified)
  }))
}

// ---------- Historique complet d'un article ----------
function history(articleId: number): ArticleEvent[] {
  return (getDb().prepare(`
    SELECT h.*, u.full_name AS user_name,
           CASE h.ref_type WHEN 'sale' THEN 'Vente ' || sa.number
                           WHEN 'purchase' THEN COALESCE('Achat ' || p.reference, 'Achat #' || p.id) END AS doc_label,
           CASE h.ref_type WHEN 'sale' THEN c.name WHEN 'purchase' THEN sp.name END AS party,
           (SELECT group_concat(l.code, ', ') FROM lot_movements lm JOIN lots l ON l.id = lm.lot_id WHERE lm.movement_id = h.id) AS lots
    FROM (SELECT m.*, SUM(m.quantity) OVER (ORDER BY m.id) AS balance FROM stock_movements m WHERE m.article_id = ?) h
    LEFT JOIN users u ON u.id = h.user_id
    LEFT JOIN sales sa ON h.ref_type = 'sale' AND sa.id = h.ref_id
    LEFT JOIN clients c ON c.id = sa.client_id
    LEFT JOIN purchases p ON h.ref_type = 'purchase' AND p.id = h.ref_id
    LEFT JOIN suppliers sp ON sp.id = p.supplier_id
    ORDER BY h.id DESC`).all(articleId) as any[]).map((r) => ({
    id: r.id, date: r.created_at, type: r.type, quantity: r.quantity, balance: round3(r.balance),
    unitCost: r.unit_cost === null ? null : fromMillimes(r.unit_cost), docLabel: r.doc_label, party: r.party,
    userName: r.user_name, note: r.note, lots: r.lots
  }))
}

// ---------- Journal d'audit (lecture réservée à l'administrateur) ----------
function auditList(from: string, to: string): AuditEntry[] {
  return (getDb().prepare(`
    SELECT * FROM audit_log WHERE date(created_at) BETWEEN ? AND ? ORDER BY id DESC LIMIT 20000`).all(from, to) as any[]).map((r) => ({
    id: r.id, date: r.created_at, userName: r.user_name || '—', channel: r.channel, action: auditLabel(r.channel),
    details: r.details, result: r.result, ok: !!r.ok, error: r.error
  }))
}

export function registerTraceHandlers(): void {
  const db = () => getDb()
  handle('trace:articles', () => (db().prepare(SELECT_TRACKED + ' ORDER BY a.designation COLLATE NOCASE').all() as any[]).map(mapTracked))
  handle('trace:setTracking', (articleId: number, mode: TrackingMode) => setTracking(articleId, mode))
  handle('trace:lots', () => (db().prepare(SELECT_LOTS + ' ORDER BY l.id DESC LIMIT 20000').all() as any[]).map(mapLot))
  handle('trace:lot', (id: number) => getLot(id))
  handle('trace:pending', () => pending())
  handle('trace:receive', (input: ReceiveInput) => receive(input))
  handle('trace:reassign', (lotMovementId: number, newLotId: number) => reassign(lotMovementId, newLotId))
  handle('trace:history', (articleId: number) => history(articleId))
  handle('audit:list', (from: string, to: string) => auditList(from, to))
}
