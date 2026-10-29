import { BrowserWindow, dialog, ipcMain } from 'electron'
import * as XLSX from 'xlsx'
import { getDb } from '../db'
import { getSettings } from '../settings'
import { fromMillimes, toMillimes } from '@shared/money'
import type { Article, ArticleInput, Category, ImportReport, Result } from '@shared/types'

// Enveloppe chaque appel : on renvoie { ok, data } ou { ok:false, error } au lieu de lever une exception.
function handle<T>(channel: string, fn: (...args: any[]) => T): void {
  ipcMain.handle(channel, (_e, ...args): Result<T> => {
    try {
      return { ok: true, data: fn(...args) }
    } catch (err: any) {
      return { ok: false, error: friendlyError(err) }
    }
  })
}

function friendlyError(err: any): string {
  const msg = String(err?.message ?? err)
  if (msg.includes('UNIQUE') && msg.includes('articles.barcode')) return 'Ce code-barres existe déjà.'
  if (msg.includes('UNIQUE') && msg.includes('categories.name')) return 'Cette catégorie existe déjà.'
  return msg
}

const SELECT_ARTICLES = `
  SELECT a.id, a.barcode, a.designation, a.category_id, c.name AS category_name, a.unit,
         a.purchase_price, a.sale_price, a.stock, a.min_stock
  FROM articles a LEFT JOIN categories c ON c.id = a.category_id
  WHERE a.active = 1`

const mapArticle = (r: any): Article => ({
  id: r.id,
  barcode: r.barcode,
  designation: r.designation,
  categoryId: r.category_id,
  categoryName: r.category_name,
  unit: r.unit,
  purchasePrice: fromMillimes(r.purchase_price),
  salePrice: fromMillimes(r.sale_price),
  stock: r.stock,
  minStock: r.min_stock
})

/** Écrit le stock de départ sous forme de mouvement (jamais directement dans articles.stock). */
function addInitialStock(articleId: number, qty: number, unitCost: number): void {
  if (qty > 0) {
    getDb()
      .prepare(`INSERT INTO stock_movements(article_id, type, quantity, unit_cost, note)
                VALUES (?, 'initial', ?, ?, 'Stock initial')`)
      .run(articleId, qty, unitCost)
  }
}

function createArticle(a: ArticleInput): Article {
  const db = getDb()
  const id = db.transaction(() => {
    const r = db
      .prepare(`INSERT INTO articles(barcode, designation, category_id, unit, purchase_price, sale_price, min_stock)
                VALUES (?,?,?,?,?,?,?)`)
      .run(a.barcode.trim(), a.designation.trim(), a.categoryId, a.unit, toMillimes(a.purchasePrice),
           toMillimes(a.salePrice), a.minStock)
    addInitialStock(Number(r.lastInsertRowid), a.initialStock ?? 0, toMillimes(a.purchasePrice))
    return Number(r.lastInsertRowid)
  })()
  return mapArticle(db.prepare(SELECT_ARTICLES + ' AND a.id = ?').get(id))
}

function updateArticle(id: number, a: ArticleInput): Article {
  const db = getDb()
  // Le stock n'est volontairement pas modifiable ici (uniquement via les mouvements).
  db.prepare(`UPDATE articles SET barcode=?, designation=?, category_id=?, unit=?, purchase_price=?,
              sale_price=?, min_stock=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(a.barcode.trim(), a.designation.trim(), a.categoryId, a.unit, toMillimes(a.purchasePrice),
         toMillimes(a.salePrice), a.minStock, id)
  return mapArticle(db.prepare(SELECT_ARTICLES + ' AND a.id = ?').get(id))
}

// ---------- Import Excel ----------

// Retire accents/espaces/casse pour reconnaître "Désignation", "designation", "DESIGNATION "...
const norm = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

const COLUMN_ALIASES: Record<string, string[]> = {
  barcode: ['codebarres', 'codebarre', 'code', 'barcode', 'ean', 'reference'],
  designation: ['designation', 'libelle', 'nom', 'article', 'produit'],
  category: ['categorie', 'famille'],
  unit: ['unite', 'unit'],
  purchasePrice: ['prixachat', 'achat', 'pa', 'prixdachat'],
  salePrice: ['prixvente', 'vente', 'pv', 'prix'],
  stock: ['stock', 'quantite', 'qte'],
  minStock: ['stockmin', 'seuil', 'stockminimum', 'seuilalerte']
}

const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function importExcel(filePath: string): ImportReport {
  const db = getDb()
  const book = XLSX.readFile(filePath)
  const sheet = book.Sheets[book.SheetNames[0]] // première feuille uniquement
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const report: ImportReport = { created: 0, updated: 0, errors: [] }

  const findCategory = db.prepare('SELECT id FROM categories WHERE name = ?')
  const addCategory = db.prepare('INSERT INTO categories(name) VALUES (?)')
  const findArticle = db.prepare('SELECT id FROM articles WHERE barcode = ?')

  // Tout l'import dans une seule transaction : un fichier cassé ne laisse pas de base à moitié remplie.
  db.transaction(() => {
    rows.forEach((raw, i) => {
      const line = i + 2 // ligne 1 = en-têtes
      // Réindexe la ligne avec des clés logiques (barcode, designation, ...).
      const row: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(raw)) {
        const field = Object.keys(COLUMN_ALIASES).find((f) => COLUMN_ALIASES[f].includes(norm(key)))
        if (field) row[field] = value
      }
      const barcode = String(row.barcode ?? '').trim()
      const designation = String(row.designation ?? '').trim()
      if (!barcode || !designation) {
        report.errors.push({ line, message: 'Code-barres ou désignation manquant' })
        return
      }
      const catName = String(row.category ?? '').trim()
      let categoryId: number | null = null
      if (catName) {
        const found = findCategory.get(catName) as { id: number } | undefined
        categoryId = found ? found.id : Number(addCategory.run(catName).lastInsertRowid)
      }
      const data: ArticleInput = {
        barcode,
        designation,
        categoryId,
        unit: String(row.unit ?? '').trim() || getSettings().stock_default_unit,
        purchasePrice: num(row.purchasePrice),
        salePrice: num(row.salePrice),
        // colonne vide : seuil par défaut des paramètres (Paramètres > Stock)
        minStock: String(row.minStock ?? '').trim() === '' ? Number(getSettings().stock_default_min) : num(row.minStock),
        initialStock: num(row.stock)
      }
      const existing = findArticle.get(barcode) as { id: number } | undefined
      if (existing) {
        updateArticle(existing.id, data) // le stock du fichier est ignoré pour un article existant
        report.updated++
      } else {
        createArticle(data)
        report.created++
      }
    })
  })()
  return report
}

export function registerArticleHandlers(): void {
  handle('articles:list', () => (getDb().prepare(SELECT_ARTICLES + ' ORDER BY a.designation COLLATE NOCASE').all() as any[]).map(mapArticle))
  handle('articles:create', (a: ArticleInput) => createArticle(a))
  handle('articles:update', (id: number, a: ArticleInput) => updateArticle(id, a))
  // Suppression logique : l'historique des ventes/mouvements reste cohérent.
  handle('articles:delete', (id: number) => {
    getDb().prepare(`UPDATE articles SET active = 0, barcode = barcode || '#del' || id WHERE id = ?`).run(id)
  })
  handle('categories:list', () => getDb().prepare('SELECT id, name FROM categories ORDER BY name').all() as Category[])
  handle('categories:stats', () => getDb().prepare(`
    SELECT c.id, c.name, (SELECT COUNT(*) FROM articles a WHERE a.category_id = c.id AND a.active = 1) AS count
    FROM categories c ORDER BY c.name`).all() as { id: number; name: string; count: number }[])
  handle('categories:update', (id: number, name: string) => {
    if (!name.trim()) throw new Error('Le nom est obligatoire.')
    getDb().prepare('UPDATE categories SET name = ? WHERE id = ?').run(name.trim(), id)
  })
  // Les articles de la catégorie supprimée passent « sans catégorie » (clé étrangère ON DELETE SET NULL).
  handle('categories:delete', (id: number) => { getDb().prepare('DELETE FROM categories WHERE id = ?').run(id) })
  handle('categories:create', (name: string) => {
    const r = getDb().prepare('INSERT INTO categories(name) VALUES (?)').run(name.trim())
    return { id: Number(r.lastInsertRowid), name: name.trim() } as Category
  })

  // Le dialogue de fichier s'ouvre côté principal ; null = l'utilisateur a annulé.
  ipcMain.handle('articles:import', async (e): Promise<Result<ImportReport | null>> => {
    try {
      const win = BrowserWindow.fromWebContents(e.sender)!
      const pick = await dialog.showOpenDialog(win, {
        title: 'Importer des articles',
        filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'xls', 'csv'] }],
        properties: ['openFile']
      })
      if (pick.canceled) return { ok: true, data: null }
      return { ok: true, data: importExcel(pick.filePaths[0]) }
    } catch (err: any) {
      return { ok: false, error: friendlyError(err) }
    }
  })
}
