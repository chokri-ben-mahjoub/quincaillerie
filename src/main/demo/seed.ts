import { getDb } from '../db'
import { buildCatalog, catalogCapacity, rng } from './catalog'
import { convertQuote, KINDS, saveDoc, validateDoc } from '../ipc/invoices'
import { toMillimes } from '@shared/money'
import type { InvoiceInput, InvoiceLine } from '@shared/invoice'
import type { DemoOptions, DemoReport, DemoStats } from '@shared/demo'

// Données de démonstration : articles, fournisseurs, clients, achats, ventes datées, règlements et documents.
// Tout est généré dans UNE transaction (tout ou rien) et rejoue les vraies règles : le stock ne bouge que par des mouvements.

const DAY = 24 * 3600 * 1000
const rnd = (): number => Math.random()
const int = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1))
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)]
const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const stamp = (d: Date) => `${dateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
const ean13 = (twelve: string): string => {
  const sum = [...twelve].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0)
  return twelve + ((10 - (sum % 10)) % 10)
}

const SUPPLIERS = [
  ['Comptoir Tunisien de Quincaillerie', '71 245 310', 'Zone industrielle Charguia, Tunis'], ['Ets Ben Salah & Fils', '74 223 876', 'Route de Tunis km 4, Sfax'],
  ['Sotuplast Plomberie', '73 364 120', 'Zone industrielle Sidi Abdelhamid, Sousse'], ['Électro Maghreb', '71 887 452', 'Avenue de la République, Tunis'],
  ['Peintures Méditerranée', '72 285 640', 'Zone industrielle Nabeul'], ['Maison du Fer et Acier', '74 460 233', 'Route de Gabès km 2, Sfax'],
  ['Outillage Pro Tunisie', '71 392 118', 'Ben Arous, Tunis'], ['Grossiste Visserie du Sahel', '73 227 905', 'Msaken, Sousse'],
  ['Éclairage Moderne', '71 701 336', 'Ariana, Tunis'], ['Sanitaire Plus', '72 431 770', 'Bizerte'],
  ['Matériaux du Centre', '77 237 412', 'Kairouan'], ['Distribution Jardin & Arrosage', '73 441 509', 'Monastir']
] as const

const FIRST = ['Mohamed', 'Ahmed', 'Ali', 'Slim', 'Karim', 'Sami', 'Walid', 'Nabil', 'Hichem', 'Fathi', 'Mourad', 'Anis', 'Riadh', 'Hedi', 'Lotfi', 'Chokri', 'Bechir', 'Tarek', 'Yassine', 'Marwen', 'Amine', 'Imed', 'Khaled', 'Nizar', 'Zied', 'Fares', 'Sofiene', 'Habib']
const LAST = ['Trabelsi', 'Ben Salah', 'Gharbi', 'Jebali', 'Mejri', 'Chaabane', 'Bouazizi', 'Hammami', 'Ayari', 'Dridi', 'Mansouri', 'Khelifi', 'Belhaj', 'Sassi', 'Ferchichi', 'Zouari', 'Mhiri', 'Cherif', 'Ben Amor', 'Karoui', 'Tlili', 'Hamdi', 'Baccouche', 'Oueslati']
const CITIES = ['Tunis', 'Sfax', 'Sousse', 'Nabeul', 'Bizerte', 'Monastir', 'Kairouan', 'Gabès', 'Ariana', 'Ben Arous', 'Mahdia', 'Gafsa']
const STREETS = ['Avenue Habib Bourguiba', 'Rue de la Liberté', 'Rue Ibn Khaldoun', 'Avenue de la République', 'Rue Farhat Hached', 'Rue du 2 Mars', 'Avenue Taieb Mhiri', 'Rue de Palestine']
const BUSINESS = ['Entreprise {n} Bâtiment', 'Société {n} Construction', 'Ets {n} & Frères', 'Menuiserie {n}', 'Plomberie {n}', 'Électricité {n}', 'Atelier {n} Métal']

/** Les 45 clients de démo sont toujours les mêmes (graine fixe) : régénérer ne crée jamais de doublons. */
function clientRows(): { name: string; phone: string; address: string; limit: number }[] {
  const r = rng(4242)
  const p = <T,>(a: T[]): T => a[Math.floor(r() * a.length)]
  const n = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
  const rows: { name: string; phone: string; address: string; limit: number }[] = []
  const used = new Set<string>()
  while (rows.length < 45) {
    const last = p(LAST)
    const name = r() < 0.35 ? p(BUSINESS).replace('{n}', last) : `${p(FIRST)} ${last}`
    if (used.has(name)) continue
    used.add(name)
    rows.push({
      name, phone: `${p(['98', '97', '99', '55', '52', '22', '23', '20', '71', '73', '74'])} ${n(100, 999)} ${n(100, 999)}`,
      address: `${n(1, 120)} ${p(STREETS)}, ${p(CITIES)}`,
      limit: r() < 0.4 ? 0 : p([300, 500, 1000, 1500, 2000, 3000, 5000]) // 40 % sans crédit
    })
  }
  return rows
}

// ---------- Quantités réalistes selon l'unité ----------
function saleQty(unit: string, priceDt: number): number {
  switch (unit) {
    case 'kg': return int(1, 20) / 2
    case 'm': return int(1, 30)
    case 'sac': return int(1, 10)
    case 'boîte': return int(1, 4)
    case 'rouleau': case 'paire': return int(1, 2)
    case 'lot': return int(1, 3)
    default: return priceDt < 3 ? int(1, 8) : priceDt < 20 ? int(1, 4) : int(1, 2)
  }
}
const purchaseQty = (unit: string): number => (unit === 'sac' ? int(20, 100) : unit === 'kg' || unit === 'm' ? int(20, 200) : unit === 'rouleau' ? int(3, 20) : int(10, 96))

interface Art { id: number; designation: string; unit: string; sale: number; cost: number; stock: number; weight: number }

export function demoStats(): DemoStats {
  const c = (sql: string) => (getDb().prepare(sql).get() as { n: number }).n
  return {
    articles: c('SELECT COUNT(*) AS n FROM articles WHERE active = 1'), clients: c('SELECT COUNT(*) AS n FROM clients WHERE active = 1'),
    suppliers: c('SELECT COUNT(*) AS n FROM suppliers WHERE active = 1'), sales: c('SELECT COUNT(*) AS n FROM sales'),
    purchases: c('SELECT COUNT(*) AS n FROM purchases'), invoices: c('SELECT COUNT(*) AS n FROM invoices'), quotes: c('SELECT COUNT(*) AS n FROM quotes'),
    orders: c('SELECT COUNT(*) AS n FROM purchase_orders'), deliveries: c('SELECT COUNT(*) AS n FROM delivery_notes'),
    movements: c('SELECT COUNT(*) AS n FROM stock_movements')
  }
}

export function generateDemo(opts: DemoOptions): DemoReport {
  const db = getDb()
  const t0 = Date.now()
  const report: DemoReport = { articles: 0, suppliers: 0, clients: 0, purchases: 0, sales: 0, clientPayments: 0, invoices: 0, quotes: 0, orders: 0, deliveries: 0, ms: 0 }
  const now = new Date()
  const initialDate = stamp(new Date(now.getTime() - 120 * DAY))

  db.transaction(() => {
    // ---------- 1. Articles (désignations réalistes, codes-barres EAN-13, stock initial par mouvement) ----------
    if (opts.articles > 0) {
      const existing = new Set((db.prepare('SELECT designation FROM articles').all() as { designation: string }[]).map((r) => r.designation))
      const want = Math.min(opts.articles, 3000)
      const cap = catalogCapacity()
      let n = want, fresh = buildCatalog(n).filter((a) => !existing.has(a.designation))
      while (fresh.length < want && n < cap) { n = Math.min(cap, n + (want - fresh.length)); fresh = buildCatalog(n).filter((a) => !existing.has(a.designation)) }
      fresh = fresh.slice(0, want)

      const catId = new Map<string, number>()
      for (const name of new Set(fresh.map((a) => a.category))) {
        db.prepare('INSERT OR IGNORE INTO categories(name) VALUES (?)').run(name)
        catId.set(name, (db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number }).id)
      }
      const last = (db.prepare(`SELECT MAX(CAST(substr(barcode, 5) AS INTEGER)) AS m FROM articles WHERE barcode LIKE '6190%' AND length(barcode) = 13`).get() as { m: number | null }).m ?? 0
      const addArt = db.prepare(`INSERT INTO articles(barcode, designation, category_id, unit, purchase_price, sale_price, min_stock, created_at, updated_at)
                                 VALUES (?,?,?,?,?,?,?,?,?)`)
      const addMove = db.prepare(`INSERT INTO stock_movements(article_id, type, quantity, unit_cost, note, created_at) VALUES (?, 'initial', ?, ?, 'Stock initial', ?)`)
      fresh.forEach((a, i) => {
        const r = addArt.run(ean13('6190' + pad(last + i + 1, 8)), a.designation, catId.get(a.category), a.unit, toMillimes(a.purchasePrice), toMillimes(a.salePrice), a.minStock, initialDate, initialDate)
        if (a.stock > 0) addMove.run(r.lastInsertRowid, a.stock, toMillimes(a.purchasePrice), initialDate)
      })
      report.articles = fresh.length
    }

    // ---------- 2. Fournisseurs et clients ----------
    if (opts.partners) {
      const addSup = db.prepare('INSERT INTO suppliers(name, phone, address) VALUES (?,?,?)')
      for (const [name, phone, address] of SUPPLIERS)
        if (!db.prepare('SELECT 1 FROM suppliers WHERE name = ?').get(name)) { addSup.run(name, phone, address); report.suppliers++ }
      const addCli = db.prepare('INSERT INTO clients(name, phone, address, credit_limit) VALUES (?,?,?,?)')
      for (const c of clientRows())
        if (!db.prepare('SELECT 1 FROM clients WHERE name = ?').get(c.name)) { addCli.run(c.name, c.phone, c.address, toMillimes(c.limit)); report.clients++ }
    }

    // Articles actifs (existants + nouveaux) : base de tous les achats, ventes et documents qui suivent.
    const arts: Art[] = (db.prepare('SELECT id, designation, unit, sale_price, purchase_price, stock FROM articles WHERE active = 1').all() as any[]).map((a) => ({
      id: a.id, designation: a.designation, unit: a.unit, sale: a.sale_price, cost: a.purchase_price, stock: a.stock,
      weight: 1 / (1 + a.sale_price / 15000) * (0.4 + rnd() * 1.2) // les articles bon marché se vendent plus souvent
    }))
    const totalWeight = arts.reduce((s, a) => s + a.weight, 0)
    const pickArt = (): Art => { let r = rnd() * totalWeight; for (const a of arts) { r -= a.weight; if (r <= 0) return a } return arts[arts.length - 1] }
    const suppliers = db.prepare('SELECT id, name, phone, address FROM suppliers WHERE active = 1').all() as { id: number; name: string; phone: string | null; address: string | null }[]
    const clients = db.prepare('SELECT id, name, phone, address, credit_limit, balance FROM clients WHERE active = 1').all() as { id: number; name: string; phone: string | null; address: string | null; credit_limit: number; balance: number }[]
    const users = (db.prepare('SELECT id FROM users WHERE active = 1').all() as { id: number }[]).map((u) => u.id)

    // ---------- 3. Achats, ventes et règlements : événements datés, rejoués dans l'ordre chronologique ----------
    type Ev = { at: Date; kind: 'purchase' | 'sale' }
    const paymentDates: Date[] = [] // règlements de dettes, traités après les ventes
    const events: Ev[] = []
    const randomDate = (days: number, hours: [number, number] = [8, 19]): Date => {
      const d = new Date(now.getTime() - rnd() * days * DAY)
      d.setHours(int(hours[0], hours[1]), int(0, 59), int(0, 59))
      return d > now ? new Date(now.getTime() - 60000) : d
    }
    if (opts.purchases && arts.length && suppliers.length) for (let i = 0; i < Math.max(8, Math.round(arts.length / 25)); i++) events.push({ at: randomDate(90), kind: 'purchase' })
    const perDay = Math.min(12, Math.max(4, 3 + arts.length / 250))
    if (opts.salesDays > 0 && arts.length) {
      const total = Math.min(1500, Math.round(opts.salesDays * perDay))
      for (let i = 0; i < total; i++) {
        const d = randomDate(opts.salesDays)
        if (d.getDay() === 0 && rnd() < 0.7) d.setDate(d.getDate() - 1) // peu de ventes le dimanche
        events.push({ at: d, kind: 'sale' })
      }
    }
    events.sort((a, b) => a.at.getTime() - b.at.getTime())

    const addPurchase = db.prepare('INSERT INTO purchases(supplier_id, reference, total, paid, created_at) VALUES (?,?,?,?,?)')
    const addPItem = db.prepare('INSERT INTO purchase_items(purchase_id, article_id, quantity, unit_cost) VALUES (?,?,?,?)')
    const addMove = db.prepare(`INSERT INTO stock_movements(article_id, type, quantity, unit_cost, ref_type, ref_id, note, user_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    const addSale = db.prepare('INSERT INTO sales(number, client_id, user_id, total, discount, paid, method, created_at) VALUES (?,?,?,?,?,?,?,?)')
    const addSItem = db.prepare('INSERT INTO sale_items(sale_id, article_id, quantity, unit_price, unit_cost) VALUES (?,?,?,?,?)')
    const addPay = db.prepare('INSERT INTO client_payments(client_id, amount, note, created_at) VALUES (?,?,?,?)')
    const setBalance = db.prepare('UPDATE clients SET balance = ? WHERE id = ?')
    const dayCount = new Map<string, number>()
    const nextNumber = (d: Date): string => {
      const key = dateKey(d)
      if (!dayCount.has(key)) dayCount.set(key, (db.prepare(`SELECT COUNT(*) AS n FROM sales WHERE date(created_at) = ?`).get(key) as { n: number }).n)
      const n = dayCount.get(key)! + 1
      dayCount.set(key, n)
      return `${key.replace(/-/g, '')}-${pad(n, 4)}`
    }
    const owing = clients.filter((c) => c.credit_limit > 0)

    for (const ev of events) {
      if (ev.kind === 'purchase') {
        const sup = pick(suppliers)
        // On réapprovisionne en priorité les articles dont le stock est bas.
        const candidates = Array.from({ length: 30 }, pickArt).sort((a, b) => a.stock - b.stock)
        const lines = [...new Map(candidates.slice(0, int(4, 14)).map((a) => [a.id, a])).values()]
          .map((a) => ({ a, qty: purchaseQty(a.unit), cost: Math.max(10, Math.round((a.cost * (0.97 + rnd() * 0.06)) / 10) * 10) }))
        const total = lines.reduce((s, l) => s + Math.round(l.qty * l.cost), 0)
        const r = rnd()
        const paid = r < 0.6 ? total : r < 0.85 ? Math.round((total * (0.4 + rnd() * 0.4)) / 1000) * 1000 : 0
        const pid = Number(addPurchase.run(sup.id, `BL-${int(1000, 9999)}`, total, paid, stamp(ev.at)).lastInsertRowid)
        for (const l of lines) {
          addPItem.run(pid, l.a.id, l.qty, l.cost)
          addMove.run(l.a.id, 'achat', l.qty, l.cost, 'purchase', pid, `Achat #${pid}`, null, stamp(ev.at))
          l.a.stock += l.qty
        }
        report.purchases++
      } else if (ev.kind === 'sale') {
        const nLines = pick([1, 1, 1, 2, 2, 2, 3, 3, 4, 5])
        const picked = new Map<number, { a: Art; qty: number }>()
        for (let k = 0; k < nLines; k++) {
          const a = pickArt()
          if (picked.has(a.id) || a.stock <= 0) continue
          const qty = Math.min(saleQty(a.unit, a.sale / 1000), a.stock)
          if (qty > 0) picked.set(a.id, { a, qty })
        }
        if (!picked.size) continue
        const lines = [...picked.values()].map(({ a, qty }) => ({ a, qty, total: Math.round(qty * a.sale) }))
        const subtotal = lines.reduce((s, l) => s + l.total, 0)
        const discount = rnd() < 0.08 ? Math.round((subtotal * int(2, 5)) / 100 / 50) * 50 : 0
        const total = subtotal - discount
        let method = rnd() < 0.62 ? 'especes' : rnd() < 0.55 ? 'carte' : rnd() < 0.55 ? 'cheque' : 'credit'
        let paid = total, due = 0, clientId: number | null = null
        if (method === 'credit') {
          const c = pick(owing.length ? owing : [null as any])
          const advance = rnd() < 0.5 ? 0 : Math.round((total * 0.2) / 1000) * 1000
          if (c && c.balance + (total - advance) <= c.credit_limit) { clientId = c.id; paid = advance; due = total - advance; c.balance += due }
          else method = 'carte'
        }
        const number = nextNumber(ev.at)
        const uid = users.length ? pick(users) : null
        const sid = Number(addSale.run(number, clientId, uid, total, discount, paid, method, stamp(ev.at)).lastInsertRowid)
        for (const l of lines) {
          addSItem.run(sid, l.a.id, l.qty, l.a.sale, l.a.cost)
          addMove.run(l.a.id, 'vente', -l.qty, l.a.cost, 'sale', sid, `Vente ${number}`, uid, stamp(ev.at))
          l.a.stock -= l.qty
        }
        if (due > 0) {
          setBalance.run(owing.find((c) => c.id === clientId)!.balance, clientId)
          const payAt = new Date(ev.at.getTime() + int(3, 25) * DAY)
          if (payAt <= now) paymentDates.push(payAt)
        }
        report.sales++
      }
    }

    // Règlements : au plus la dette en cours, dans l'ordre des dates.
    for (const at of paymentDates.sort((a, b) => a.getTime() - b.getTime())) {
      {
        // Règlement d'une dette client (au plus la dette en cours à cette date)
        const debtors = owing.filter((c) => c.balance > 0)
        if (!debtors.length) continue
        const c = pick(debtors)
        const amount = Math.min(c.balance, Math.max(10000, Math.round((c.balance * (0.4 + rnd() * 0.6)) / 5000) * 5000))
        addPay.run(c.id, amount, 'Règlement', stamp(at))
        c.balance -= amount
        setBalance.run(c.balance, c.id)
        report.clientPayments++
      }
    }

    // ---------- 4. Documents : factures, devis, bons de commande et de livraison ----------
    if (opts.documents && arts.length) {
      const addDays = (d: Date, n: number) => dateKey(new Date(d.getTime() + n * DAY))
      const lineFrom = (): InvoiceLine => {
        const a = pickArt()
        return { designation: a.designation, unit: a.unit, quantity: a.unit === 'kg' || a.unit === 'm' ? int(5, 60) : int(1, 20), unitPrice: a.sale / 1000,
          discountPct: pick([0, 0, 0, 5, 10]), tvaRate: pick([19, 19, 19, 19, 7]) }
      }
      const build = (party: { id: number; name: string; phone: string | null; address: string | null } | undefined, at: Date, kind: 'facture' | 'devis' | 'bon_commande' | 'bon_livraison'): InvoiceInput => ({
        clientId: party?.id ?? null, clientName: party?.name ?? 'Client comptoir', clientAddress: party?.address ?? '',
        clientTaxId: rnd() < 0.4 ? `${int(1000000, 1999999)}/${pick(['A', 'B', 'C'])}/M/000` : '', clientPhone: party?.phone ?? '',
        issueDate: dateKey(at), dueDate: kind === 'facture' ? addDays(at, 30) : kind === 'devis' ? addDays(at, 30) : kind === 'bon_commande' ? addDays(at, 10) : addDays(at, 2),
        paymentMethod: pick(['Espèces', 'Chèque', 'Virement', 'À crédit']), notes: '', timbre: kind === 'facture',
        lines: Array.from({ length: int(1, 8) }, lineFrom)
      })
      const batch = (n: number, kind: 'facture' | 'devis' | 'bon_commande' | 'bon_livraison', parties: any[], done: (id: number, validated: boolean) => void) => {
        const dates = Array.from({ length: n }, () => randomDate(60)).sort((a, b) => a.getTime() - b.getTime())
        for (const at of dates) {
          const id = saveDoc(KINDS[kind], null, build(parties.length ? pick(parties) : undefined, at, kind))
          const validated = rnd() < (kind === 'facture' ? 0.8 : 0.7)
          if (validated) validateDoc(KINDS[kind], id)
          done(id, validated)
        }
      }
      batch(24, 'facture', clients, () => report.invoices++)
      batch(14, 'devis', clients, (id, validated) => {
        report.quotes++
        if (!validated) return
        const r = rnd()
        if (r < 0.25) db.prepare(`UPDATE quotes SET status = 'refuse' WHERE id = ?`).run(id)
        else if (r < 0.55) db.prepare(`UPDATE quotes SET status = 'accepte' WHERE id = ?`).run(id)
        else if (r < 0.75) { convertQuote(id); report.invoices++ }
      })
      batch(8, 'bon_commande', suppliers, (id, validated) => {
        report.orders++
        if (validated && rnd() < 0.5) db.prepare(`UPDATE purchase_orders SET status = 'recu' WHERE id = ?`).run(id)
      })
      batch(10, 'bon_livraison', clients, (id, validated) => {
        report.deliveries++
        if (validated && rnd() < 0.6) db.prepare(`UPDATE delivery_notes SET status = 'livre' WHERE id = ?`).run(id)
      })
    }
  })()

  report.ms = Date.now() - t0
  return report
}
