// Schéma SQL complet de l'application.
// Montants : INTEGER en millimes (12.500 DT = 12500). Quantités : REAL (kg, m, ...).
// Chaque évolution future = une nouvelle entrée dans MIGRATIONS (jamais de modification des anciennes).

export const MIGRATIONS: string[] = [
  /* ---------- Version 1 : schéma initial ---------- */
  `
  -- Utilisateurs et rôles (module Utilisateurs)
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    full_name     TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin','gerant','caissier')),
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE categories (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
  );

  -- Articles. "stock" est une valeur dérivée : seul le trigger trg_movement_apply la modifie.
  CREATE TABLE articles (
    id             INTEGER PRIMARY KEY,
    barcode        TEXT NOT NULL UNIQUE,
    designation    TEXT NOT NULL,
    category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    unit           TEXT NOT NULL DEFAULT 'pièce',
    purchase_price INTEGER NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
    sale_price     INTEGER NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
    stock          REAL    NOT NULL DEFAULT 0,
    min_stock      REAL    NOT NULL DEFAULT 0,
    active         INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  -- Index demandés : recherche rapide par désignation (le code-barres est déjà indexé par UNIQUE).
  CREATE INDEX idx_articles_designation ON articles(designation COLLATE NOCASE);
  CREATE INDEX idx_articles_category    ON articles(category_id);

  CREATE TABLE suppliers (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    phone      TEXT,
    address    TEXT,
    note       TEXT,
    active     INTEGER NOT NULL DEFAULT 1
  );

  -- Clients ; credit_limit = plafond de crédit autorisé, balance = montant qu'il nous doit.
  CREATE TABLE clients (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    phone        TEXT,
    address      TEXT,
    credit_limit INTEGER NOT NULL DEFAULT 0,
    balance      INTEGER NOT NULL DEFAULT 0,
    active       INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX idx_clients_name ON clients(name COLLATE NOCASE);

  -- Ventes (en-tête) et lignes. Une vente = une transaction SQL.
  CREATE TABLE sales (
    id          INTEGER PRIMARY KEY,
    number      TEXT NOT NULL UNIQUE,
    client_id   INTEGER REFERENCES clients(id),
    user_id     INTEGER REFERENCES users(id),
    total       INTEGER NOT NULL,
    discount    INTEGER NOT NULL DEFAULT 0,
    paid        INTEGER NOT NULL DEFAULT 0,
    method      TEXT NOT NULL DEFAULT 'especes' CHECK (method IN ('especes','carte','cheque','credit')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_sales_date ON sales(created_at);

  CREATE TABLE sale_items (
    id         INTEGER PRIMARY KEY,
    sale_id    INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    article_id INTEGER NOT NULL REFERENCES articles(id),
    quantity   REAL    NOT NULL CHECK (quantity > 0),
    unit_price INTEGER NOT NULL,
    unit_cost  INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);

  -- Achats fournisseurs
  CREATE TABLE purchases (
    id          INTEGER PRIMARY KEY,
    supplier_id INTEGER REFERENCES suppliers(id),
    reference   TEXT,
    total       INTEGER NOT NULL,
    paid        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE purchase_items (
    id          INTEGER PRIMARY KEY,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    article_id  INTEGER NOT NULL REFERENCES articles(id),
    quantity    REAL    NOT NULL CHECK (quantity > 0),
    unit_cost   INTEGER NOT NULL
  );

  -- Règlements de dettes clients
  CREATE TABLE client_payments (
    id         INTEGER PRIMARY KEY,
    client_id  INTEGER NOT NULL REFERENCES clients(id),
    amount     INTEGER NOT NULL CHECK (amount > 0),
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  -- Journal des mouvements de stock : SEULE source de vérité du stock.
  -- quantity est signée : + entrée, - sortie.
  CREATE TABLE stock_movements (
    id         INTEGER PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES articles(id),
    type       TEXT NOT NULL CHECK (type IN
               ('initial','achat','vente','retour_client','retour_fournisseur','ajustement','perte')),
    quantity   REAL NOT NULL CHECK (quantity <> 0),
    unit_cost  INTEGER,
    ref_type   TEXT,          -- 'sale' | 'purchase' | NULL
    ref_id     INTEGER,
    note       TEXT,
    user_id    INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_movements_article ON stock_movements(article_id, created_at);

  -- Applique chaque mouvement au stock de l'article (unique point de modification du stock).
  CREATE TRIGGER trg_movement_apply AFTER INSERT ON stock_movements
  BEGIN
    UPDATE articles SET stock = stock + NEW.quantity WHERE id = NEW.article_id;
  END;

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
  INSERT INTO settings(key, value) VALUES
    ('shop_name', 'Ma Quincaillerie'), ('currency', 'DT'), ('backup_keep', '14');

  INSERT INTO categories(name) VALUES
    ('Outillage'), ('Plomberie'), ('Électricité'), ('Peinture'), ('Visserie'), ('Quincaillerie générale');
  `,

  /* ---------- Version 2 : règlements fournisseurs ---------- */
  `
  CREATE TABLE supplier_payments (
    id          INTEGER PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    amount      INTEGER NOT NULL CHECK (amount > 0),
    note        TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_purchases_supplier ON purchases(supplier_id);
  `
]
