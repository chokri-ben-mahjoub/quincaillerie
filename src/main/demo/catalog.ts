// Catalogue de démonstration : des articles réalistes de quincaillerie (désignations, unités, prix en dinars,
// stocks et seuils). Le générateur est déterministe (graine fixe) : même demande = même catalogue.

export interface DemoArticle {
  designation: string
  category: string
  unit: string
  salePrice: number // dinars, multiple de 0,050
  purchasePrice: number
  stock: number
  minStock: number
}

// ---------- Outils de base ----------
export function rng(seed: number): () => number {
  let a = seed >>> 0 // mulberry32
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const round05 = (n: number) => Math.max(0.2, Math.round(n / 0.05) * 0.05)
const fix3 = (n: number) => Math.round(n * 1000) / 1000
const fr = (n: number) => String(n).replace('.', ',') // 4.5 -> « 4,5 »

type Item = { name: string; price: number; unit?: string }
const it = (name: string, price: number, unit?: string): Item => ({ name, price, unit })

const BRANDS_TOOLS = ['Stanley', 'Facom', 'Bosch', 'Wera', 'Irwin', 'Tolsen']
const BRANDS_POWER = ['Bosch', 'Makita', 'DeWalt', 'Black+Decker', 'Einhell', 'Ryobi']
const BRANDS_ELEC = ['Schneider', 'Legrand', 'ABB', 'Hager']
const BRANDS_SANI = ['Grohe', 'Hansgrohe', 'Ideal Standard', 'Roca', 'Damixa']
const BRANDS_LOCK = ['Abus', 'Master Lock', 'Yale', 'Mul-T-Lock', 'Iseo']
const BRANDS_PAINT = ['Alpha', 'Sicap', 'Jotun', 'Dulux', 'Sika']
const COLORS_PAINT = ['Blanc', 'Ivoire', 'Beige', 'Gris clair', 'Gris anthracite', 'Jaune', 'Bleu ciel', 'Vert', 'Rouge', 'Noir']

// ---------- Familles de produits ----------
function visserie(): Item[] {
  const out: Item[] = []
  for (const d of [3, 3.5, 4, 4.5, 5, 6]) for (const l of [16, 20, 25, 30, 35, 40, 50, 60, 70, 80, 100]) {
    if (l < d * 4) continue
    out.push(it(`Vis à bois tête fraisée ${fr(d)}x${l} mm (boîte de 200)`, 2.2 + d * 0.5 + l * 0.055, 'boîte'))
    out.push(it(`Vis à bois inox A2 ${fr(d)}x${l} mm (boîte de 100)`, 4.5 + d * 0.9 + l * 0.12, 'boîte'))
  }
  for (const d of [4.2, 4.8, 5.5, 6.3]) for (const l of [16, 19, 25, 32, 38, 50, 65, 80])
    out.push(it(`Vis autoforeuse tête hexagonale ${fr(d)}x${l} mm (boîte de 100)`, 3.5 + d * 0.8 + l * 0.07, 'boîte'))
  for (const d of [3.5, 3.9, 4.2]) for (const l of [25, 35, 45, 55])
    out.push(it(`Vis à placo phosphatée ${fr(d)}x${l} mm (boîte de 500)`, 5 + d * 0.6 + l * 0.08, 'boîte'))
  for (const mat of ['zinguée 8.8', 'inox A2']) for (const d of [6, 8, 10, 12, 14, 16]) for (const l of [20, 30, 40, 50, 60, 80, 100, 120]) {
    if (l < d * 2) continue
    out.push(it(`Boulon tête hexagonale M${d}x${l} ${mat} (boîte de 50)`, (mat === 'inox A2' ? 2.2 : 1) * (4 + d * 0.9 + l * 0.09), 'boîte'))
  }
  for (const t of ['hexagonal zingué', 'hexagonal inox A2', 'à freins nylstop', 'borgne', 'à oreilles']) for (const d of [4, 5, 6, 8, 10, 12, 14, 16, 20])
    out.push(it(`Écrou ${t} M${d} (boîte de 100)`, (t.includes('inox') ? 2 : 1) * (1.8 + d * 0.55), 'boîte'))
  for (const t of ['plate', 'large', 'éventail', 'Grower']) for (const d of [4, 5, 6, 8, 10, 12, 14, 16, 20])
    out.push(it(`Rondelle ${t} M${d} (boîte de 200)`, 1.5 + d * 0.4, 'boîte'))
  for (const mat of ['zinguée', 'inox A2']) for (const d of [6, 8, 10, 12, 14, 16])
    out.push(it(`Tige filetée M${d} ${mat} (longueur 1 m)`, (mat === 'inox A2' ? 2.4 : 1) * (1.8 + d * 0.65), 'pièce'))
  for (const d of [5, 6, 8, 10, 12, 14]) for (const l of [25, 30, 40, 50, 60, 70, 80, 100]) {
    out.push(it(`Cheville nylon Ø${d}x${l} mm (boîte de 100)`, 2.5 + d * 0.35 + l * 0.04, 'boîte'))
    if (d >= 6) out.push(it(`Cheville à expansion métal M${d}x${l} (boîte de 25)`, 6 + d * 0.9 + l * 0.08, 'boîte'))
  }
  for (const d of [3, 3.2, 4, 4.8]) for (const l of [6, 8, 10, 12, 16, 20, 25])
    out.push(it(`Rivet aveugle alu ${fr(d)}x${l} mm (boîte de 100)`, 2.8 + d * 0.5 + l * 0.08, 'boîte'))
  for (const t of ['pointe tête plate', 'à béton acier', 'de charpentier', 'tête homme']) for (const l of [20, 25, 30, 40, 50, 60, 70, 80, 100, 120])
    out.push(it(`Clou ${t} ${l} mm`, 3.2 + l * 0.04 + (t === 'à béton acier' ? 1.5 : 0), 'kg'))
  for (const d of [6, 8, 10]) for (const l of [60, 80, 100, 120, 150])
    out.push(it(`Tire-fond tête hexagonale ${d}x${l} mm (boîte de 25)`, 5 + d * 0.8 + l * 0.07, 'boîte'))
  return out
}

function plomberie(): Item[] {
  const out: Item[] = []
  const pvc = [32, 40, 50, 63, 75, 90, 110, 125, 160]
  for (const d of pvc) {
    out.push(it(`Tube PVC évacuation Ø${d} mm (barre de 4 m)`, 2.2 + d * 0.21, 'pièce'))
    out.push(it(`Tube PVC pression PN10 Ø${d} mm (barre de 6 m)`, 4 + d * 0.38, 'pièce'))
    for (const t of ['Coude 87°30', 'Coude 45°', 'Té 87°30', 'Manchon', 'Réduction mâle-femelle', 'Bouchon femelle', 'Culotte 45°', 'Collier de fixation'])
      out.push(it(`${t} PVC Ø${d} mm`, 0.8 + d * 0.055 * (t.startsWith('Té') || t.startsWith('Culotte') ? 1.4 : 1)))
  }
  for (const d of [20, 25, 32, 40, 50, 63]) {
    out.push(it(`Tube PPR PN20 Ø${d} mm (barre de 4 m)`, 3.5 + d * 0.3, 'pièce'))
    for (const t of ['Coude 90° PPR', 'Coude 45° PPR', 'Té PPR', 'Manchon PPR', 'Réduction PPR', 'Robinet d’arrêt PPR', 'Raccord union PPR', 'Bouchon PPR'])
      out.push(it(`${t} Ø${d} mm`, 0.7 + d * 0.06 * (t.startsWith('Robinet') ? 4 : 1)))
  }
  for (const t of ['à bille', 'à tournant sphérique', 'équerre', 'de purge', 'à boisseau']) for (const d of ['1/2"', '3/4"', '1"', '1 1/4"', '1 1/2"'])
    out.push(it(`Robinet d’arrêt ${t} ${d}`, 3.5 + ['1/2"', '3/4"', '1"', '1 1/4"', '1 1/2"'].indexOf(d) * 3.2))
  for (const t of ['Mamelon', 'Réduction', 'Té', 'Coude', 'Manchon', 'Raccord union', 'Bouchon']) for (const d of ['1/2"', '3/4"', '1"', '1 1/4"', '1 1/2"', '2"'])
    out.push(it(`${t} laiton filetage ${d}`, 1.6 + ['1/2"', '3/4"', '1"', '1 1/4"', '1 1/2"', '2"'].indexOf(d) * 2.1))
  for (const l of [30, 40, 50, 60, 80, 100, 150]) for (const t of ['F/F', 'M/F'])
    out.push(it(`Flexible inox tressé ${t} 1/2" longueur ${l} cm`, 3.4 + l * 0.07))
  for (const d of [20, 25, 32, 40]) for (const t of ['Raccord PE à compression', 'Coude PE à compression', 'Té PE à compression', 'Manchon PE'])
    out.push(it(`${t} Ø${d} mm`, 2 + d * 0.28))
  for (const l of [25, 50, 100]) for (const d of [20, 25, 32])
    out.push(it(`Tuyau PEHD PN10 Ø${d} mm (couronne ${l} m)`, (3 + d * 0.22) * l * 0.4, 'rouleau'))
  for (const t of ['Joint fibre', 'Joint caoutchouc', 'Rondelle de robinet']) for (const d of ['1/2"', '3/4"', '1"'])
    out.push(it(`${t} ${d} (sachet de 10)`, 0.9 + ['1/2"', '3/4"', '1"'].indexOf(d) * 0.4, 'lot'))
  out.push(it('Ruban téflon PTFE 12 mm x 12 m', 0.6, 'rouleau'), it('Filasse + pâte à joint 100 g', 4.2), it('Colle PVC 250 ml', 5.8), it('Décapant PVC 250 ml', 5.2))
  return out
}

function sanitaire(): Item[] {
  const out: Item[] = []
  for (const b of BRANDS_SANI) {
    for (const t of ['lavabo', 'évier', 'douche', 'baignoire', 'bidet']) for (const f of ['chrome', 'noir mat', 'inox brossé'])
      out.push(it(`Mitigeur ${t} ${b} finition ${f}`, 65 + BRANDS_SANI.indexOf(b) * 22 + ['lavabo', 'évier', 'douche', 'baignoire', 'bidet'].indexOf(t) * 14 + (f === 'chrome' ? 0 : 30)))
    for (const t of ['Pack WC sortie horizontale', 'Pack WC sortie verticale', 'Cuvette WC suspendue', 'Lavabo céramique 60 cm', 'Vasque à poser 45 cm', 'Receveur de douche 90x90', 'Colonne de douche thermostatique', 'Pomme de douche', 'Barre de douche 70 cm'])
      out.push(it(`${t} ${b}`, 90 + BRANDS_SANI.indexOf(b) * 35 + t.length * 3.5))
  }
  for (const t of ['Siphon lavabo', 'Siphon évier 2 bacs', 'Bonde de douche', 'Bonde de lavabo clic-clac', 'Tuyau de vidange flexible', 'Abattant WC', 'Réservoir de chasse complet', 'Mécanisme de chasse double', 'Flotteur de réservoir', 'Joint de WC'])
    for (const q of ['standard', 'renforcé', 'premium']) out.push(it(`${t} ${q}`, 6 + t.length * 0.9 + ['standard', 'renforcé', 'premium'].indexOf(q) * 9))
  return out
}

function electricite(): Item[] {
  const out: Item[] = []
  const colors = ['bleu', 'rouge', 'noir', 'vert/jaune', 'marron', 'gris']
  for (const s of [1.5, 2.5, 4, 6, 10, 16]) for (const c of colors) {
    out.push(it(`Câble H07V-U ${fr(s)} mm² ${c} (rouleau de 100 m)`, 28 * s + 20, 'rouleau'))
    out.push(it(`Fil souple H07V-K ${fr(s)} mm² ${c} (rouleau de 100 m)`, 32 * s + 24, 'rouleau'))
  }
  for (const n of [2, 3, 4, 5]) for (const s of [0.75, 1, 1.5, 2.5, 4])
    out.push(it(`Câble souple H05VV-F ${n}G${fr(s)} mm² (rouleau de 50 m)`, 14 * s * n + 15, 'rouleau'))
  for (const b of BRANDS_ELEC) for (const a of [6, 10, 16, 20, 25, 32, 40, 50, 63]) for (const p of ['1P', '1P+N', '2P', '3P', '4P']) {
    out.push(it(`Disjoncteur ${b} ${a} A ${p} courbe C`, (7 + a * 0.55) * (p === '1P' ? 1 : p === '1P+N' || p === '2P' ? 1.7 : p === '3P' ? 2.6 : 3.4) * (1 + BRANDS_ELEC.indexOf(b) * 0.12)))
  }
  for (const b of BRANDS_ELEC) for (const a of [25, 40, 63]) for (const ma of [30, 300])
    out.push(it(`Interrupteur différentiel ${b} ${a} A ${ma} mA`, 48 + a * 0.9 + (ma === 300 ? 8 : 0) + BRANDS_ELEC.indexOf(b) * 7))
  for (const b of ['Legrand Mosaic', 'Schneider Odace', 'Hager Kallysta']) for (const c of ['blanc', 'ivoire', 'anthracite']) for (const t of
    ['Prise 2P+T 16 A', 'Prise 2P+T double', 'Interrupteur simple', 'Interrupteur va-et-vient', 'Interrupteur double', 'Bouton poussoir', 'Prise TV/SAT', 'Prise RJ45 cat. 6', 'Variateur 300 W', 'Interrupteur volet roulant'])
    out.push(it(`${t} ${b} ${c}`, 2.8 + t.length * 0.32 + (c === 'anthracite' ? 1.5 : 0) + (b.startsWith('Schneider') ? 0.6 : 0)))
  for (const t of ['Gaine ICTA', 'Gaine annelée TPC', 'Tube IRL']) for (const d of [16, 20, 25, 32, 40, 50])
    out.push(it(`${t} Ø${d} mm (couronne de 50 m)`, 14 + d * 0.65, 'rouleau'))
  for (const w of [16, 25, 32, 40, 60]) for (const h of [16, 25, 40])
    out.push(it(`Goulotte PVC ${w}x${h} mm (longueur 2 m)`, 1.9 + w * 0.09 + h * 0.05, 'pièce'))
  for (const l of [1.5, 3, 5, 10, 20, 30, 50]) for (const n of [3, 4, 5, 6])
    out.push(it(`Rallonge électrique ${fr(l)} m ${n} prises avec interrupteur`, 7 + l * 1.7 + n * 1.5))
  for (const n of [4, 8, 12, 18, 24, 36]) for (const t of ['encastré', 'apparent']) for (const b of BRANDS_ELEC)
    out.push(it(`Coffret électrique ${b} ${n} modules ${t}`, 22 + n * 4.5 + (t === 'encastré' ? 8 : 0) + BRANDS_ELEC.indexOf(b) * 6))
  for (const n of [2, 3, 5, 8]) out.push(it(`Borne Wago ${n} entrées (boîte de 50)`, 12 + n * 3.5, 'boîte'))
  for (const s of [1.5, 2.5, 4, 6, 10]) out.push(it(`Cosses à sertir isolées ${fr(s)} mm² (sachet de 100)`, 5 + s * 1.2, 'lot'))
  return out
}

function eclairage(): Item[] {
  const out: Item[] = []
  for (const w of [3, 5, 7, 9, 12, 15, 18, 24]) for (const c of ['E27', 'E14', 'GU10', 'B22']) for (const [t, k] of [['blanc chaud', 2700], ['blanc neutre', 4000], ['blanc froid', 6500]] as const)
    out.push(it(`Ampoule LED ${w} W ${c} ${t} ${k} K`, 1.8 + w * 0.42 + (c === 'GU10' ? 0.6 : 0)))
  for (const w of [10, 20, 30, 50, 100, 150, 200]) for (const k of ['blanc froid 6500 K', 'blanc chaud 3000 K']) for (const o of ['simple', 'avec détecteur de mouvement'])
    out.push(it(`Projecteur LED ${w} W IP65 ${k} ${o}`, 12 + w * 0.55 + (o.startsWith('avec') ? 14 : 0)))
  for (const w of [9, 12, 18, 24, 36, 48]) for (const f of ['rond', 'carré']) for (const m of ['encastré', 'en saillie'])
    out.push(it(`Plafonnier LED ${f} ${w} W ${m}`, 9 + w * 0.8 + (m === 'en saillie' ? 5 : 0)))
  for (const l of [60, 90, 120, 150]) for (const t of ['blanc chaud', 'blanc froid']) out.push(it(`Réglette LED tube T8 ${l} cm ${t}`, 8 + l * 0.14))
  for (const m of [5, 10, 20]) for (const c of ['blanc chaud', 'blanc froid', 'RVB']) out.push(it(`Ruban LED 12 V ${m} m ${c} IP20`, 9 + m * 2.6 + (c === 'RVB' ? 8 : 0), 'rouleau'))
  for (const t of ['Applique murale extérieure', 'Lanterne de jardin', 'Hublot étanche', 'Lampe de poche rechargeable', 'Lampe frontale LED', 'Baladeuse de chantier', 'Lampe solaire de jardin'])
    for (const v of ['modèle standard', 'modèle renforcé', 'modèle design']) out.push(it(`${t} ${v}`, 12 + t.length * 1.6 + ['modèle standard', 'modèle renforcé', 'modèle design'].indexOf(v) * 14))
  return out
}

function peinture(): Item[] {
  const out: Item[] = []
  const types: [string, number][] = [['acrylique mate intérieur', 3.4], ['acrylique satinée intérieur', 4.1], ['vinylique murs et plafonds', 3.0], ['glycéro brillante', 6.2],
    ['façade pliolite', 4.8], ['antirouille', 5.4], ['laque satinée boiseries', 6.8], ['peinture sol époxy', 8.5]]
  for (const [t, base] of types) for (const c of COLORS_PAINT) for (const v of [1, 2.5, 5, 10, 20]) {
    if ((c === 'Rouge' || c === 'Vert' || c === 'Jaune' || c === 'Bleu ciel') && v === 20) continue
    out.push(it(`Peinture ${t} ${c} ${fr(v)} L`, base * v * (v >= 10 ? 0.82 : 1) + 2, 'pièce'))
  }
  for (const w of [20, 30, 40, 50, 60, 80, 100]) for (const q of ['standard', 'soie', 'professionnel'])
    out.push(it(`Pinceau plat ${w} mm ${q}`, 0.9 + w * 0.045 * (q === 'professionnel' ? 2 : q === 'soie' ? 1.4 : 1)))
  for (const l of [110, 180, 250]) for (const p of ['polyamide 12 mm', 'laine 18 mm', 'microfibre 14 mm', 'mousse laque'])
    out.push(it(`Rouleau ${l} mm ${p}`, 1.6 + l * 0.022))
  for (const t of ['Enduit de rebouchage', 'Enduit de lissage', 'Enduit de finition', 'Sous-couche universelle', 'Sous-couche façade', 'Fixateur de fond', 'Peinture plafond blanc mat', 'Vernis incolore satiné', 'Lasure bois chêne', 'Lasure bois acajou']) for (const v of [1, 5, 15, 25])
    out.push(it(`${t} ${v} ${v >= 15 ? 'kg' : 'L'}`, 3 + t.length * 0.22 + v * 3.1, 'pièce'))
  for (const w of [19, 25, 30, 38, 50]) out.push(it(`Ruban de masquage ${w} mm x 50 m`, 1 + w * 0.07, 'rouleau'))
  for (const g of [60, 80, 100, 120, 150, 180, 240]) out.push(it(`Papier abrasif grain ${g} (feuille)`, 0.35 + g * 0.002))
  for (const b of BRANDS_PAINT) for (const t of ['Diluant', 'White-spirit', 'Décapant peinture'] ) for (const v of [1, 5])
    out.push(it(`${t} ${b} ${v} L`, 4.5 + v * 2.2 + BRANDS_PAINT.indexOf(b) * 0.6))
  return out
}

function outillageMain(): Item[] {
  const out: Item[] = []
  const bf = (b: string) => 1 + BRANDS_TOOLS.indexOf(b) * 0.18
  for (const b of BRANDS_TOOLS) {
    for (const [t, sizes] of [['plat', [3, 4, 5.5, 6.5, 8]], ['cruciforme PH', [0, 1, 2, 3]], ['Torx T', [10, 15, 20, 25, 30]]] as const)
      for (const s of sizes) out.push(it(`Tournevis ${t}${t.includes('PH') ? s : t === 'plat' ? ' ' + fr(s) + ' mm' : s} ${b}`, (3.5 + s * 0.35) * bf(b)))
    for (const mm of [6, 7, 8, 10, 11, 12, 13, 14, 15, 17, 19, 22, 24, 27, 30, 32]) for (const t of ['Clé plate', 'Clé à œil', 'Clé mixte'])
      out.push(it(`${t} ${mm} mm ${b}`, (3.2 + mm * 0.48) * bf(b) * (t === 'Clé mixte' ? 1.15 : 1)))
    for (const l of [150, 200, 250, 300, 380]) out.push(it(`Clé à molette ${l} mm ${b}`, (9 + l * 0.07) * bf(b)))
    for (const t of ['Pince universelle', 'Pince coupante diagonale', 'Pince multiprise', 'Pince à bec demi-rond', 'Pince à dénuder', 'Pince à riveter', 'Pince étau', 'Pince à sertir'])
      for (const l of [160, 200, 250]) out.push(it(`${t} ${l} mm ${b}`, (8 + l * 0.06 + t.length * 0.3) * bf(b)))
    for (const [t, g] of [['Marteau de menuisier', [200, 300, 400, 500]], ['Marteau massette', [800, 1000, 1500, 2000]], ['Marteau arrache-clou', [450, 570, 680]]] as const)
      for (const w of g) out.push(it(`${t} ${w} g ${b}`, (6 + w * 0.012) * bf(b)))
    for (const l of [3, 5, 8, 10]) out.push(it(`Mètre ruban ${l} m ${b}`, (4 + l * 1.4) * bf(b)))
    for (const l of [40, 60, 80, 100, 120]) out.push(it(`Niveau à bulle ${l} cm ${b}`, (7 + l * 0.25) * bf(b)))
  }
  for (const w of [6, 8, 10, 12, 16, 20, 25, 32]) { out.push(it(`Ciseau à bois ${w} mm`, 3.2 + w * 0.35)); out.push(it(`Burin plat ${w * 5} mm`, 4 + w * 0.5)) }
  for (const l of [300, 350, 400, 450, 500, 550]) out.push(it(`Égoïne denture fine ${l} mm`, 6 + l * 0.022))
  for (const [t, p] of [['Scie à métaux', 14], ['Scie à guichet', 11], ['Scie à chantourner', 16], ['Serre-joint à vis 150 mm', 9], ['Serre-joint à vis 300 mm', 14], ['Étau d’établi 100 mm', 48], ['Étau d’établi 150 mm', 79],
    ['Cutter à lame sécable 18 mm', 3.5], ['Cutter professionnel 25 mm', 6.8], ['Râpe plate demi-douce', 7.4], ['Lime ronde bâtarde', 6.2], ['Maillet caoutchouc 450 g', 8.5], ['Équerre de maçon 40 cm', 9.8], ['Cordeau à tracer 30 m', 6.5],
    ['Coffret douilles et cliquet 24 pièces', 42], ['Coffret douilles et cliquet 46 pièces', 78], ['Coffret clés mixtes 12 pièces', 55], ['Jeu de clés Allen 9 pièces', 8.2], ['Jeu de clés Torx 9 pièces', 9.5], ['Tournevis testeur de tension', 2.2]] as [string, number][])
    out.push(it(t, p))
  return out
}

function electroportatif(): Item[] {
  const out: Item[] = []
  const bf = (b: string) => 1 + BRANDS_POWER.indexOf(b) * 0.16
  for (const b of BRANDS_POWER) {
    for (const v of [12, 18, 20]) for (const t of ['Perceuse-visseuse', 'Perceuse à percussion sans fil']) for (const ah of [1.5, 2, 4])
      out.push(it(`${t} ${b} ${v} V ${fr(ah)} Ah (2 batteries)`, (95 + v * 6 + ah * 22 + (t.includes('percussion') ? 40 : 0)) * bf(b)))
    for (const d of [115, 125, 180, 230]) for (const w of [750, 850, 1100, 1400, 2000]) {
      if ((d <= 125 && w > 1100) || (d >= 180 && w < 1100)) continue
      out.push(it(`Meuleuse d’angle ${b} Ø${d} mm ${w} W`, (70 + d * 0.5 + w * 0.045) * bf(b)))
    }
    for (const w of [650, 800, 900, 1100]) out.push(it(`Perforateur SDS+ ${b} ${w} W`, (130 + w * 0.22) * bf(b)))
    for (const w of [500, 650, 800]) out.push(it(`Scie sauteuse ${b} ${w} W`, (85 + w * 0.12) * bf(b)))
    for (const w of [1200, 1400, 1600, 1900]) out.push(it(`Scie circulaire ${b} ${w} W Ø190 mm`, (140 + w * 0.12) * bf(b)))
    for (const w of [200, 250, 300]) out.push(it(`Ponceuse orbitale ${b} ${w} W`, (75 + w * 0.15) * bf(b)))
    for (const w of [1500, 1800, 2000]) out.push(it(`Décapeur thermique ${b} ${w} W`, (55 + w * 0.025) * bf(b)))
    for (const ah of [2, 4, 5]) out.push(it(`Batterie ${b} 18 V ${ah} Ah`, (60 + ah * 28) * bf(b)))
  }
  for (const d of [4, 5, 6, 8, 10, 12, 14, 16]) for (const l of [100, 150, 200, 260, 300, 400]) {
    if (d >= 12 && l < 150) continue
    out.push(it(`Foret béton SDS+ Ø${d}x${l} mm`, 3.5 + d * 0.9 + l * 0.035))
  }
  for (const d of [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 8, 9, 10, 11, 12, 13]) out.push(it(`Foret métal HSS Ø${fr(d)} mm`, 0.9 + d * 0.65))
  for (const d of [3, 4, 5, 6, 8, 10, 12]) out.push(it(`Foret à bois hélicoïdal Ø${d} mm`, 1 + d * 0.5))
  for (const d of [115, 125, 180, 230]) for (const t of ['Disque à tronçonner métal', 'Disque à tronçonner inox', 'Disque diamant béton', 'Disque diamant carrelage', 'Disque à lamelles grain 60', 'Disque à poncer grain 120'])
    out.push(it(`${t} Ø${d} mm`, 1.4 + d * 0.045 * (t.includes('diamant') ? 5 : 1)))
  for (const z of [24, 40, 48, 60]) for (const d of [160, 190, 210]) out.push(it(`Lame de scie circulaire Ø${d} mm ${z} dents`, 11 + z * 0.55 + d * 0.06))
  for (const t of ['Lames scie sauteuse bois (lot de 5)', 'Lames scie sauteuse métal (lot de 5)', 'Coffret embouts de vissage 32 pièces', 'Coffret forets métal 19 pièces', 'Coffret forets béton 5 pièces', 'Rallonge d’embout magnétique 150 mm'])
    for (const q of ['standard', 'professionnel']) out.push(it(`${t} ${q}`, 8 + t.length * 0.6 + (q === 'professionnel' ? 14 : 0), 'lot'))
  return out
}

function serrurerie(): Item[] {
  const out: Item[] = []
  for (const b of BRANDS_LOCK) {
    for (const w of [20, 30, 40, 50, 60, 70]) for (const m of ['laiton', 'acier trempé'])
      out.push(it(`Cadenas ${m} ${w} mm ${b}`, (4.5 + w * 0.42) * (m === 'acier trempé' ? 1.35 : 1) * (1 + BRANDS_LOCK.indexOf(b) * 0.2)))
    for (const t of ['Serrure encastrable à larder 3 points', 'Serrure de sûreté 5 points', 'Cylindre européen 30x30', 'Cylindre européen 30x40', 'Cylindre européen 40x40', 'Cylindre européen 40x50', 'Verrou de porte 100 mm', 'Verrou de porte 150 mm', 'Verrou de sûreté à clé'])
      out.push(it(`${t} ${b}`, (14 + t.length * 1.4) * (1 + BRANDS_LOCK.indexOf(b) * 0.2)))
  }
  for (const l of [60, 80, 100, 120, 150]) for (const w of [30, 40, 50]) {
    out.push(it(`Charnière acier zingué ${l}x${w} mm (paire)`, 1.8 + l * 0.04 + w * 0.03, 'paire'))
    out.push(it(`Paumelle de porte laiton ${l}x${w} mm (paire)`, 2.6 + l * 0.06 + w * 0.04, 'paire'))
  }
  for (const l of [20, 30, 40, 60, 80, 100, 120]) for (const t of ['Équerre d’assemblage acier', 'Équerre renforcée', 'Plaque d’assemblage plate'])
    out.push(it(`${t} ${l} mm`, 0.5 + l * 0.04))
  for (const t of ['Poignée de porte béquille alu', 'Poignée de porte béquille inox', 'Poignée de meuble chrome 128 mm', 'Poignée de meuble noire 160 mm', 'Bouton de meuble porcelaine', 'Ferme-porte hydraulique', 'Butoir de porte', 'Judas optique', 'Chaîne de sûreté', 'Entrebâilleur', 'Boîte aux lettres métal', 'Loqueteau magnétique'])
    for (const q of ['standard', 'premium']) out.push(it(`${t} ${q}`, 3 + t.length * 0.9 + (q === 'premium' ? 11 : 0)))
  for (const d of [2, 3, 4, 5, 6, 8]) out.push(it(`Chaîne acier galvanisé Ø${d} mm`, 2.2 + d * 1.9, 'm'))
  for (const d of [30, 40, 50, 75, 100]) for (const t of ['Roulette pivotante', 'Roulette fixe', 'Roulette avec frein']) out.push(it(`${t} Ø${d} mm`, 2.5 + d * 0.16 + (t.includes('frein') ? 2.5 : 0)))
  for (const l of [10, 14, 18, 22]) out.push(it(`Cornière acier perforée ${l} mm (barre 2 m)`, 5 + l * 0.9, 'pièce'))
  return out
}

function jardin(): Item[] {
  const out: Item[] = []
  for (const d of ['1/2"', '5/8"', '3/4"']) for (const l of [15, 25, 50]) for (const t of ['tuyau d’arrosage armé', 'tuyau d’arrosage tressé'])
    out.push(it(`Tuyau ${t.replace('tuyau d’', '')} ${d} ${l} m`, (0.9 + ['1/2"', '5/8"', '3/4"'].indexOf(d) * 0.4) * l * (t.includes('tressé') ? 1.3 : 1), 'rouleau'))
  for (const t of ['Raccord rapide', 'Raccord robinet 3/4"', 'Pistolet d’arrosage multijet', 'Lance d’arrosage', 'Arroseur oscillant', 'Arroseur canon', 'Programmateur d’arrosage', 'Dévidoir mural', 'Goutte-à-goutte (kit 25 m)', 'Micro-asperseur'])
    for (const q of ['standard', 'renforcé', 'professionnel']) out.push(it(`${t} ${q}`, 3 + t.length * 0.8 + ['standard', 'renforcé', 'professionnel'].indexOf(q) * 8))
  for (const t of ['Sécateur', 'Cisaille à haie', 'Râteau à feuilles', 'Râteau de jardin', 'Bêche', 'Pelle ronde', 'Fourche à bêcher', 'Houe', 'Transplantoir', 'Serfouette', 'Scie d’élagage', 'Échenilloir'])
    for (const q of ['acier', 'acier renforcé', 'inox']) out.push(it(`${t} ${q}`, 6 + t.length * 1.1 + ['acier', 'acier renforcé', 'inox'].indexOf(q) * 9))
  for (const v of [1, 2, 5, 8, 12, 16]) out.push(it(`Pulvérisateur à pression ${v} L`, 6 + v * 3.2))
  for (const v of [8, 10, 12]) out.push(it(`Arrosoir plastique ${v} L`, 3 + v * 0.6))
  for (const h of [1, 1.2, 1.5, 2]) for (const m of ['galvanisé', 'plastifié vert']) out.push(it(`Grillage soudé ${m} hauteur ${fr(h)} m (rouleau 25 m)`, 55 * h * (m.startsWith('plast') ? 1.3 : 1), 'rouleau'))
  for (const h of [1.2, 1.5, 1.75, 2]) out.push(it(`Piquet de clôture acier hauteur ${fr(h)} m`, 6 + h * 3.5))
  for (const v of [65, 80, 100]) out.push(it(`Brouette de chantier ${v} L`, 95 + v * 0.8))
  return out
}

function maconnerie(): Item[] {
  const out: Item[] = []
  for (const [t, p, u] of [['Ciment CPJ 45 (sac de 50 kg)', 15.5, 'sac'], ['Ciment blanc (sac de 25 kg)', 22, 'sac'], ['Plâtre de construction (sac de 25 kg)', 6.8, 'sac'], ['Chaux hydraulique (sac de 25 kg)', 9.5, 'sac'],
    ['Sable fin de maçonnerie (sac de 40 kg)', 3.8, 'sac'], ['Gravier 8/15 (sac de 40 kg)', 4.2, 'sac'], ['Mortier colle gris (sac de 25 kg)', 11.5, 'sac'], ['Enduit monocouche (sac de 25 kg)', 17.5, 'sac'], ['Chape liquide (sac de 25 kg)', 13.5, 'sac']] as [string, number, string][])
    out.push(it(t, p, u))
  for (const t of ['Colle carrelage C1', 'Colle carrelage C2 flexible', 'Colle carrelage grand format']) out.push(it(`${t} (sac de 25 kg)`, 12 + t.length * 0.3, 'sac'))
  for (const c of ['blanc', 'gris', 'beige', 'anthracite', 'marron']) for (const k of [2, 5]) out.push(it(`Joint carrelage ${c} (sac de ${k} kg)`, 3.5 + k * 2.2, 'sac'))
  for (const mm of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) out.push(it(`Croisillons carrelage ${fr(mm)} mm (sachet de 200)`, 1.2 + mm * 0.18, 'lot'))
  for (const d of [6, 8, 10, 12, 14, 16, 20]) { out.push(it(`Fer à béton HA Ø${d} mm (barre de 12 m)`, 3.2 * d * 0.9 + 2, 'pièce')); out.push(it(`Fer rond lisse Ø${d} mm (barre de 6 m)`, 2.2 * d * 0.7 + 1, 'pièce')) }
  for (const t of ['Treillis soudé ST25 (panneau 2,4x6 m)', 'Treillis soudé ST10 (panneau 2,4x6 m)']) out.push(it(t, 98))
  for (const d of [1, 1.4, 1.8, 2.2]) out.push(it(`Fil de fer recuit Ø${fr(d)} mm`, 3.6 + d * 0.5, 'kg'))
  for (const t of ['Truelle', 'Taloche éponge', 'Taloche plastique', 'Platoir inox', 'Spatule à enduire', 'Auge de maçon', 'Seau de maçon 12 L', 'Fil à plomb', 'Règle de maçon 2 m', 'Couteau à enduire', 'Pelle de chantier'])
    for (const q of ['standard', 'professionnelle']) out.push(it(`${t} ${q}`, 3.5 + t.length * 0.7 + (q === 'professionnelle' ? 8 : 0)))
  for (const [t, p] of [['Brique rouge 8 trous 30x20x10', 0.62], ['Brique rouge 12 trous 30x20x15', 0.95], ['Parpaing creux 20x20x40', 1.45], ['Parpaing plein 10x20x40', 1.2], ['Hourdis béton 16', 2.4], ['Bordure de trottoir béton', 7.5]] as [string, number][])
    out.push(it(t, p))
  return out
}

function securite(): Item[] {
  const out: Item[] = []
  for (const t of ['Gants de manutention coton', 'Gants nitrile enduit', 'Gants cuir de soudeur', 'Gants anti-coupure niveau 5', 'Gants latex ménage']) for (const s of [8, 9, 10, 11])
    out.push(it(`${t} taille ${s} (paire)`, 1.8 + t.length * 0.25 + (s > 9 ? 0.3 : 0), 'paire'))
  for (const p of [38, 39, 40, 41, 42, 43, 44, 45, 46]) for (const t of ['Chaussures de sécurité S1P', 'Chaussures de sécurité S3 montantes', 'Bottes de sécurité S5'])
    out.push(it(`${t} pointure ${p}`, 48 + t.length * 1.4 + (t.includes('S3') ? 20 : 0), 'paire'))
  for (const t of ['Casque de chantier', 'Casque de chantier avec jugulaire', 'Lunettes de protection incolores', 'Lunettes de protection teintées', 'Lunettes masque étanches', 'Casque antibruit', 'Bouchons d’oreilles (boîte de 50)', 'Masque FFP1 (boîte de 20)', 'Masque FFP2 (boîte de 20)', 'Masque FFP3 avec soupape', 'Demi-masque à cartouches', 'Gilet haute visibilité', 'Combinaison de travail jetable', 'Salopette de travail', 'Genouillères', 'Harnais antichute', 'Longe de sécurité 1,5 m', 'Extincteur poudre 6 kg', 'Extincteur CO2 2 kg', 'Trousse de premiers secours'])
    for (const q of ['standard', 'confort']) out.push(it(`${t} ${q}`, 3 + t.length * 1.3 + (q === 'confort' ? 6 : 0)))
  for (const c of ['jaune', 'orange']) for (const l of [50, 100, 200]) out.push(it(`Ruban de signalisation ${c} ${l} m`, 3 + l * 0.04, 'rouleau'))
  return out
}

function colles(): Item[] {
  const out: Item[] = []
  for (const c of ['transparent', 'blanc', 'gris', 'noir', 'brun']) for (const t of ['Silicone sanitaire', 'Silicone neutre menuiserie', 'Silicone haute température', 'Mastic acrylique', 'Mastic polyuréthane PU40', 'Mastic MS polymère'])
    out.push(it(`${t} ${c} (cartouche 310 ml)`, 3.2 + t.length * 0.22 + (c === 'transparent' ? 0 : 0.2)))
  for (const t of ['Colle contact néoprène', 'Colle bois D3', 'Colle bois D4 extérieur', 'Colle PVC rigide', 'Colle polyuréthane', 'Colle cyanoacrylate (super glue)', 'Colle époxy bi-composant', 'Colle de montage "tout fixer"', 'Colle à parquet', 'Colle polystyrène', 'Résine de scellement chimique'])
    for (const v of ['50 ml', '125 ml', '250 ml', '500 ml', '1 kg']) out.push(it(`${t} ${v}`, 1.8 + t.length * 0.2 + ['50 ml', '125 ml', '250 ml', '500 ml', '1 kg'].indexOf(v) * 3.4))
  for (const t of ['Mousse expansive manuelle 750 ml', 'Mousse expansive pistolable 750 ml', 'Mousse coupe-feu 750 ml', 'Nettoyant pour mousse 500 ml', 'Pistolet pour mousse expansive', 'Pistolet à cartouche standard', 'Pistolet à cartouche professionnel'])
    out.push(it(t, 5 + t.length * 0.5))
  for (const w of [19, 25, 38, 48, 50]) for (const t of ['Ruban adhésif d’emballage', 'Ruban toilé gris', 'Ruban double face', 'Ruban d’étanchéité aluminium', 'Ruban isolant PVC'])
    out.push(it(`${t} ${w} mm x ${t.includes('isolant') ? 10 : 25} m`, 0.8 + w * 0.09 + t.length * 0.05, 'rouleau'))
  for (const t of ['Dégrippant multifonction 400 ml', 'Graisse au lithium 400 ml', 'Huile de coupe 1 L', 'Lubrifiant silicone 400 ml', 'Nettoyant contact électrique 250 ml', 'Bombe de peinture noire 400 ml', 'Bombe de peinture blanche 400 ml', 'Bombe de peinture aluminium 400 ml', 'Bombe antirouille 400 ml'])
    for (const q of ['standard', 'professionnel']) out.push(it(`${t} ${q}`, 4 + t.length * 0.3 + (q === 'professionnel' ? 3 : 0)))
  return out
}

// ---------- Assemblage ----------
const DEFS: { key: string; category: string; unit: string; weight: number; stock: [number, number]; make: () => Item[] }[] = [
  { key: 'visserie', category: 'Visserie', unit: 'boîte', weight: 0.17, stock: [8, 160], make: visserie },
  { key: 'plomberie', category: 'Plomberie', unit: 'pièce', weight: 0.13, stock: [4, 90], make: plomberie },
  { key: 'sanitaire', category: 'Sanitaire', unit: 'pièce', weight: 0.05, stock: [1, 18], make: sanitaire },
  { key: 'electricite', category: 'Électricité', unit: 'pièce', weight: 0.14, stock: [3, 80], make: electricite },
  { key: 'eclairage', category: 'Éclairage', unit: 'pièce', weight: 0.06, stock: [6, 120], make: eclairage },
  { key: 'peinture', category: 'Peinture', unit: 'pièce', weight: 0.09, stock: [3, 60], make: peinture },
  { key: 'outillage', category: 'Outillage', unit: 'pièce', weight: 0.09, stock: [2, 40], make: outillageMain },
  { key: 'electroportatif', category: 'Outillage électroportatif', unit: 'pièce', weight: 0.06, stock: [1, 25], make: electroportatif },
  { key: 'serrurerie', category: 'Quincaillerie générale', unit: 'pièce', weight: 0.08, stock: [2, 50], make: serrurerie },
  { key: 'jardin', category: 'Jardin & arrosage', unit: 'pièce', weight: 0.05, stock: [2, 40], make: jardin },
  { key: 'maconnerie', category: 'Maçonnerie & carrelage', unit: 'pièce', weight: 0.04, stock: [10, 300], make: maconnerie },
  { key: 'securite', category: 'Sécurité & EPI', unit: 'pièce', weight: 0.02, stock: [3, 60], make: securite },
  { key: 'colles', category: 'Colles & mastics', unit: 'pièce', weight: 0.02, stock: [5, 100], make: colles }
]

/** Mélange déterministe (Fisher-Yates avec graine). */
function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/** Nombre total d'articles distincts que le générateur peut produire. */
export function catalogCapacity(): number {
  return DEFS.reduce((s, d) => s + new Set(d.make().map((x) => x.name)).size, 0)
}

/**
 * Construit `count` articles répartis entre les familles selon leur poids (visserie, électricité, plomberie…).
 * Les désignations sont uniques ; si une famille est épuisée, les autres complètent.
 */
export function buildCatalog(count: number, seed = 20260101): DemoArticle[] {
  const rand = rng(seed)
  const pools = DEFS.map((d) => {
    const seen = new Set<string>()
    const items = d.make().filter((x) => !seen.has(x.name) && seen.add(x.name))
    return { def: d, items: shuffle(items, rand), taken: 0 }
  })

  // Quota proportionnel, puis complément tour à tour tant qu'il manque des articles.
  for (const p of pools) p.taken = Math.min(p.items.length, Math.round(count * p.def.weight))
  let total = pools.reduce((s, p) => s + p.taken, 0)
  while (total < count && pools.some((p) => p.taken < p.items.length)) {
    for (const p of pools) if (total < count && p.taken < p.items.length) { p.taken++; total++ }
  }
  while (total > count) { const p = pools.reduce((a, b) => (b.taken > a.taken ? b : a)); p.taken--; total-- }

  const out: DemoArticle[] = []
  for (const p of pools) {
    for (const item of p.items.slice(0, p.taken)) {
      const unit = item.unit ?? p.def.unit
      const sale = round05(item.price * (0.92 + rand() * 0.16)) // petite variation de prix
      const margin = 1.12 + rand() * 0.33 // marge de 12 à 45 %
      const purchase = fix3(Math.max(0.1, Math.round((sale / margin) * 100) / 100))
      const [lo, hi] = p.def.stock
      // Répartition réaliste : 5 % en rupture, 12 % en stock bas, le reste confortable.
      const r = rand()
      const minStock = Math.max(1, Math.round(lo + (hi - lo) * 0.12))
      let stock = Math.round(lo + (hi - lo) * rand() ** 1.4)
      if (r < 0.05) stock = 0
      else if (r < 0.17) stock = Math.max(1, Math.round(minStock * (0.3 + rand() * 0.7)))
      else stock = Math.max(stock, minStock + 1)
      out.push({ designation: item.name, category: p.def.category, unit, salePrice: fix3(sale), purchasePrice: purchase, stock, minStock })
    }
  }
  return shuffle(out, rand)
}
