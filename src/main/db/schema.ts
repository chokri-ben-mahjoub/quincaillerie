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
  `,

  /* ---------- Version 3 : factures A4 ---------- */
  `
  -- Compteur de numérotation continue : un numéro n'est attribué qu'à la validation, donc jamais de trou.
  CREATE TABLE doc_counters (
    doc_type TEXT    NOT NULL,
    year     INTEGER NOT NULL,
    last     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (doc_type, year)
  );

  CREATE TABLE invoices (
    id             INTEGER PRIMARY KEY,
    number         TEXT UNIQUE,                       -- NULL tant que brouillon
    status         TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','validee')),
    client_id      INTEGER REFERENCES clients(id),
    client_name    TEXT NOT NULL DEFAULT '',          -- copie figée des infos client
    client_address TEXT NOT NULL DEFAULT '',
    client_tax_id  TEXT NOT NULL DEFAULT '',
    client_phone   TEXT NOT NULL DEFAULT '',
    issue_date     TEXT NOT NULL,
    due_date       TEXT,
    payment_method TEXT NOT NULL DEFAULT 'Espèces',
    notes          TEXT NOT NULL DEFAULT '',
    timbre_amount  INTEGER NOT NULL DEFAULT 0,        -- millimes (0 = pas de timbre)
    total_ttc      INTEGER NOT NULL DEFAULT 0,        -- millimes, pour les listes
    validated_at   TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_invoices_date ON invoices(issue_date);

  CREATE TABLE invoice_items (
    id           INTEGER PRIMARY KEY,
    invoice_id   INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,
    designation  TEXT NOT NULL,
    unit         TEXT NOT NULL DEFAULT 'pièce',
    quantity     REAL NOT NULL CHECK (quantity > 0),
    unit_price   INTEGER NOT NULL,                    -- millimes HT
    discount_pct REAL NOT NULL DEFAULT 0,
    tva_rate     REAL NOT NULL DEFAULT 19
  );
  CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

  -- Facture validée = non modifiable : la base elle-même refuse toute modification ou suppression.
  CREATE TRIGGER trg_invoice_locked_update BEFORE UPDATE ON invoices WHEN OLD.status = 'validee'
  BEGIN SELECT RAISE(ABORT, 'Facture validée : modification impossible.'); END;
  CREATE TRIGGER trg_invoice_locked_delete BEFORE DELETE ON invoices WHEN OLD.status = 'validee'
  BEGIN SELECT RAISE(ABORT, 'Facture validée : suppression impossible.'); END;
  CREATE TRIGGER trg_items_locked_insert BEFORE INSERT ON invoice_items
  WHEN (SELECT status FROM invoices WHERE id = NEW.invoice_id) = 'validee'
  BEGIN SELECT RAISE(ABORT, 'Facture validée : modification impossible.'); END;
  CREATE TRIGGER trg_items_locked_update BEFORE UPDATE ON invoice_items
  WHEN (SELECT status FROM invoices WHERE id = OLD.invoice_id) = 'validee'
  BEGIN SELECT RAISE(ABORT, 'Facture validée : modification impossible.'); END;
  CREATE TRIGGER trg_items_locked_delete BEFORE DELETE ON invoice_items
  WHEN (SELECT status FROM invoices WHERE id = OLD.invoice_id) = 'validee'
  BEGIN SELECT RAISE(ABORT, 'Facture validée : modification impossible.'); END;

  -- Valeurs par défaut de la société (modifiables dans l'écran « Infos société »).
  INSERT OR IGNORE INTO settings(key, value) VALUES
    ('company_tva', '19'), ('company_timbre', '1000');
  `,

  /* ---------- Version 4 : devis (convertibles en facture) ---------- */
  `
  CREATE TABLE quotes (
    id                   INTEGER PRIMARY KEY,
    number               TEXT UNIQUE,                  -- DV-AAAA-0001, attribué à la validation
    status               TEXT NOT NULL DEFAULT 'brouillon'
                         CHECK (status IN ('brouillon','valide','accepte','refuse','converti')),
    client_id            INTEGER REFERENCES clients(id),
    client_name          TEXT NOT NULL DEFAULT '',
    client_address       TEXT NOT NULL DEFAULT '',
    client_tax_id        TEXT NOT NULL DEFAULT '',
    client_phone         TEXT NOT NULL DEFAULT '',
    issue_date           TEXT NOT NULL,
    due_date             TEXT,                          -- date de validité de l'offre
    payment_method       TEXT NOT NULL DEFAULT 'Espèces',
    notes                TEXT NOT NULL DEFAULT '',
    timbre_amount        INTEGER NOT NULL DEFAULT 0,
    total_ttc            INTEGER NOT NULL DEFAULT 0,
    validated_at         TEXT,
    converted_invoice_id INTEGER REFERENCES invoices(id),
    created_at           TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_quotes_date ON quotes(issue_date);

  CREATE TABLE quote_items (
    id           INTEGER PRIMARY KEY,
    quote_id     INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,
    designation  TEXT NOT NULL,
    unit         TEXT NOT NULL DEFAULT 'pièce',
    quantity     REAL NOT NULL CHECK (quantity > 0),
    unit_price   INTEGER NOT NULL,
    discount_pct REAL NOT NULL DEFAULT 0,
    tva_rate     REAL NOT NULL DEFAULT 19
  );
  CREATE INDEX idx_quote_items_quote ON quote_items(quote_id);

  -- Hors brouillon, le contenu du devis est figé ; seuls le statut et le lien vers la facture évoluent.
  CREATE TRIGGER trg_quote_locked_update BEFORE UPDATE ON quotes
  WHEN OLD.status <> 'brouillon' AND (NEW.client_name <> OLD.client_name OR NEW.issue_date <> OLD.issue_date
       OR NEW.total_ttc <> OLD.total_ttc OR NEW.number IS NOT OLD.number OR NEW.notes <> OLD.notes
       OR NEW.client_address <> OLD.client_address OR NEW.client_tax_id <> OLD.client_tax_id)
  BEGIN SELECT RAISE(ABORT, 'Devis validé : modification impossible.'); END;
  CREATE TRIGGER trg_quote_locked_delete BEFORE DELETE ON quotes WHEN OLD.status <> 'brouillon'
  BEGIN SELECT RAISE(ABORT, 'Devis validé : suppression impossible.'); END;
  CREATE TRIGGER trg_qitems_locked_insert BEFORE INSERT ON quote_items
  WHEN (SELECT status FROM quotes WHERE id = NEW.quote_id) <> 'brouillon'
  BEGIN SELECT RAISE(ABORT, 'Devis validé : modification impossible.'); END;
  CREATE TRIGGER trg_qitems_locked_update BEFORE UPDATE ON quote_items
  WHEN (SELECT status FROM quotes WHERE id = OLD.quote_id) <> 'brouillon'
  BEGIN SELECT RAISE(ABORT, 'Devis validé : modification impossible.'); END;
  CREATE TRIGGER trg_qitems_locked_delete BEFORE DELETE ON quote_items
  WHEN (SELECT status FROM quotes WHERE id = OLD.quote_id) <> 'brouillon'
  BEGIN SELECT RAISE(ABORT, 'Devis validé : modification impossible.'); END;
  `,

  /* ---------- Version 5 : bons de commande (adressés à un fournisseur) ---------- */
  `
  -- Mêmes colonnes que devis/factures pour partager le code : les colonnes client_* contiennent ici
  -- les informations du FOURNISSEUR (client_id = id du fournisseur, sans clé étrangère).
  CREATE TABLE purchase_orders (
    id             INTEGER PRIMARY KEY,
    number         TEXT UNIQUE,                  -- BC-AAAA-0001, attribué à la validation
    status         TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','valide','recu')),
    client_id      INTEGER,
    client_name    TEXT NOT NULL DEFAULT '',
    client_address TEXT NOT NULL DEFAULT '',
    client_tax_id  TEXT NOT NULL DEFAULT '',
    client_phone   TEXT NOT NULL DEFAULT '',
    issue_date     TEXT NOT NULL,
    due_date       TEXT,                         -- livraison souhaitée
    payment_method TEXT NOT NULL DEFAULT 'Espèces',
    notes          TEXT NOT NULL DEFAULT '',
    timbre_amount  INTEGER NOT NULL DEFAULT 0,
    total_ttc      INTEGER NOT NULL DEFAULT 0,
    validated_at   TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_po_date ON purchase_orders(issue_date);

  CREATE TABLE po_items (
    id           INTEGER PRIMARY KEY,
    po_id        INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,
    designation  TEXT NOT NULL,
    unit         TEXT NOT NULL DEFAULT 'pièce',
    quantity     REAL NOT NULL CHECK (quantity > 0),
    unit_price   INTEGER NOT NULL,
    discount_pct REAL NOT NULL DEFAULT 0,
    tva_rate     REAL NOT NULL DEFAULT 19
  );
  CREATE INDEX idx_po_items_po ON po_items(po_id);

  -- Hors brouillon : contenu figé (le passage à « reçu » reste possible).
  CREATE TRIGGER trg_po_locked_update BEFORE UPDATE ON purchase_orders
  WHEN OLD.status <> 'brouillon' AND (NEW.client_name <> OLD.client_name OR NEW.issue_date <> OLD.issue_date
       OR NEW.total_ttc <> OLD.total_ttc OR NEW.number IS NOT OLD.number OR NEW.notes <> OLD.notes
       OR NEW.client_address <> OLD.client_address OR NEW.client_tax_id <> OLD.client_tax_id)
  BEGIN SELECT RAISE(ABORT, 'Bon de commande validé : modification impossible.'); END;
  CREATE TRIGGER trg_po_locked_delete BEFORE DELETE ON purchase_orders WHEN OLD.status <> 'brouillon'
  BEGIN SELECT RAISE(ABORT, 'Bon de commande validé : suppression impossible.'); END;
  CREATE TRIGGER trg_poitems_locked_insert BEFORE INSERT ON po_items
  WHEN (SELECT status FROM purchase_orders WHERE id = NEW.po_id) <> 'brouillon'
  BEGIN SELECT RAISE(ABORT, 'Bon de commande validé : modification impossible.'); END;
  CREATE TRIGGER trg_poitems_locked_update BEFORE UPDATE ON po_items
  WHEN (SELECT status FROM purchase_orders WHERE id = OLD.po_id) <> 'brouillon'
  BEGIN SELECT RAISE(ABORT, 'Bon de commande validé : modification impossible.'); END;
  CREATE TRIGGER trg_poitems_locked_delete BEFORE DELETE ON po_items
  WHEN (SELECT status FROM purchase_orders WHERE id = OLD.po_id) <> 'brouillon'
  BEGIN SELECT RAISE(ABORT, 'Bon de commande validé : modification impossible.'); END;
  `,

  /* ---------- Version 6 : bons de livraison (adressés à un client) ---------- */
  `
  CREATE TABLE delivery_notes (
    id             INTEGER PRIMARY KEY,
    number         TEXT UNIQUE,                  -- BL-AAAA-0001, attribué à la validation
    status         TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','valide','livre')),
    client_id      INTEGER REFERENCES clients(id),
    client_name    TEXT NOT NULL DEFAULT '',
    client_address TEXT NOT NULL DEFAULT '',
    client_tax_id  TEXT NOT NULL DEFAULT '',
    client_phone   TEXT NOT NULL DEFAULT '',
    issue_date     TEXT NOT NULL,
    due_date       TEXT,                         -- livraison prévue
    payment_method TEXT NOT NULL DEFAULT 'Espèces',
    notes          TEXT NOT NULL DEFAULT '',
    timbre_amount  INTEGER NOT NULL DEFAULT 0,
    total_ttc      INTEGER NOT NULL DEFAULT 0,
    validated_at   TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_dn_date ON delivery_notes(issue_date);

  CREATE TABLE dn_items (
    id           INTEGER PRIMARY KEY,
    dn_id        INTEGER NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,
    designation  TEXT NOT NULL,
    unit         TEXT NOT NULL DEFAULT 'pièce',
    quantity     REAL NOT NULL CHECK (quantity > 0),
    unit_price   INTEGER NOT NULL,
    discount_pct REAL NOT NULL DEFAULT 0,
    tva_rate     REAL NOT NULL DEFAULT 19
  );
  CREATE INDEX idx_dn_items_dn ON dn_items(dn_id);

  -- Hors brouillon : contenu figé (le passage à « livré » reste possible).
  CREATE TRIGGER trg_dn_locked_update BEFORE UPDATE ON delivery_notes
  WHEN OLD.status <> 'brouillon' AND (NEW.client_name <> OLD.client_name OR NEW.issue_date <> OLD.issue_date
       OR NEW.total_ttc <> OLD.total_ttc OR NEW.number IS NOT OLD.number OR NEW.notes <> OLD.notes
       OR NEW.client_address <> OLD.client_address OR NEW.client_tax_id <> OLD.client_tax_id)
  BEGIN SELECT RAISE(ABORT, 'Bon de livraison validé : modification impossible.'); END;
  CREATE TRIGGER trg_dn_locked_delete BEFORE DELETE ON delivery_notes WHEN OLD.status <> 'brouillon'
  BEGIN SELECT RAISE(ABORT, 'Bon de livraison validé : suppression impossible.'); END;
  CREATE TRIGGER trg_dnitems_locked_insert BEFORE INSERT ON dn_items
  WHEN (SELECT status FROM delivery_notes WHERE id = NEW.dn_id) <> 'brouillon'
  BEGIN SELECT RAISE(ABORT, 'Bon de livraison validé : modification impossible.'); END;
  CREATE TRIGGER trg_dnitems_locked_update BEFORE UPDATE ON dn_items
  WHEN (SELECT status FROM delivery_notes WHERE id = OLD.dn_id) <> 'brouillon'
  BEGIN SELECT RAISE(ABORT, 'Bon de livraison validé : modification impossible.'); END;
  CREATE TRIGGER trg_dnitems_locked_delete BEFORE DELETE ON dn_items
  WHEN (SELECT status FROM delivery_notes WHERE id = OLD.dn_id) <> 'brouillon'
  BEGIN SELECT RAISE(ABORT, 'Bon de livraison validé : modification impossible.'); END;
  `,

  /* ---------- Version 7 : registre des paramètres (clés renommées, timbre en dinars) ---------- */
  `
  UPDATE settings SET key = 'tax_default_rate' WHERE key = 'company_tva';
  INSERT OR REPLACE INTO settings(key, value)
    SELECT 'tax_timbre_amount', printf('%.3f', CAST(value AS REAL) / 1000.0) FROM settings WHERE key = 'company_timbre';
  DELETE FROM settings WHERE key = 'company_timbre';
  `,

  /* ---------- Version 8 : annulation / modification des ventes ---------- */
  `
  -- Une vente n'est jamais effacée : elle passe à « annulée » (le stock est rendu par des mouvements, la dette reprise).
  ALTER TABLE sales ADD COLUMN status TEXT NOT NULL DEFAULT 'validee' CHECK (status IN ('validee','annulee'));
  ALTER TABLE sales ADD COLUMN cancelled_at TEXT;
  ALTER TABLE sales ADD COLUMN cancelled_by INTEGER REFERENCES users(id);
  ALTER TABLE sales ADD COLUMN cancel_reason TEXT;
  ALTER TABLE sales ADD COLUMN replaced_by INTEGER REFERENCES sales(id); -- vente qui remplace celle-ci après modification
  CREATE INDEX idx_sales_client ON sales(client_id);
  `,

  /* ---------- Version 9 : représentant sur les documents, règlements de factures ---------- */
  `
  -- Représentant (vendeur) imprimé sur le document ; par défaut l'utilisateur qui l'a enregistré.
  ALTER TABLE invoices        ADD COLUMN representative TEXT NOT NULL DEFAULT '';
  ALTER TABLE quotes          ADD COLUMN representative TEXT NOT NULL DEFAULT '';
  ALTER TABLE purchase_orders ADD COLUMN representative TEXT NOT NULL DEFAULT '';
  ALTER TABLE delivery_notes  ADD COLUMN representative TEXT NOT NULL DEFAULT '';

  -- Règlements d'une facture validée (plusieurs possibles : acompte, solde, chèques échelonnés…).
  CREATE TABLE invoice_payments (
    id         INTEGER PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id),
    pay_date   TEXT NOT NULL,                          -- AAAA-MM-JJ
    amount     INTEGER NOT NULL CHECK (amount > 0),    -- millimes
    method     TEXT NOT NULL DEFAULT 'Espèces',
    reference  TEXT NOT NULL DEFAULT '',               -- n° de chèque, de virement…
    user_id    INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_invoice_payments_invoice ON invoice_payments(invoice_id);

  -- Garde-fous dans la base elle-même : seulement sur facture validée, jamais au-delà du net à payer.
  CREATE TRIGGER trg_invoice_payment_check BEFORE INSERT ON invoice_payments
  BEGIN
    SELECT RAISE(ABORT, 'Seule une facture validée peut recevoir un règlement.')
      WHERE (SELECT status FROM invoices WHERE id = NEW.invoice_id) IS NOT 'validee';
    SELECT RAISE(ABORT, 'Le règlement dépasse le reste à payer.')
      WHERE (SELECT COALESCE(SUM(amount), 0) FROM invoice_payments WHERE invoice_id = NEW.invoice_id) + NEW.amount
            > (SELECT total_ttc FROM invoices WHERE id = NEW.invoice_id);
  END;
  `,

  /* ---------- Version 10 : traçabilité (lots, numéros de série, journal d'audit) ---------- */
  `
  -- Mode de suivi de l'article : aucun, par lot (quantités) ou par numéro de série (1 unité = 1 numéro).
  ALTER TABLE articles ADD COLUMN tracking TEXT NOT NULL DEFAULT 'aucun' CHECK (tracking IN ('aucun','lot','serie'));
  ALTER TABLE articles ADD COLUMN tracking_since TEXT; -- date d'activation : seuls les achats suivants sont « à identifier »

  -- Un lot (ou un numéro de série) = une quantité identifiée d'un article, avec son origine.
  -- quantity_left est dérivée : seul le trigger trg_lot_movement_apply la modifie.
  CREATE TABLE lots (
    id            INTEGER PRIMARY KEY,
    article_id    INTEGER NOT NULL REFERENCES articles(id),
    code          TEXT NOT NULL COLLATE NOCASE,
    kind          TEXT NOT NULL CHECK (kind IN ('lot','serie')),
    supplier_id   INTEGER REFERENCES suppliers(id),
    purchase_id   INTEGER REFERENCES purchases(id),
    expiry_date   TEXT,                                 -- AAAA-MM-JJ (colles, mastics, peintures…)
    quantity_in   REAL NOT NULL CHECK (quantity_in > 0),
    quantity_left REAL NOT NULL DEFAULT 0 CHECK (quantity_left > -0.0005 AND quantity_left < quantity_in + 0.0005),
    note          TEXT,
    user_id       INTEGER REFERENCES users(id),
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE (article_id, code)
  );
  CREATE INDEX idx_lots_code    ON lots(code);
  CREATE INDEX idx_lots_article ON lots(article_id, quantity_left);
  CREATE INDEX idx_lots_purchase ON lots(purchase_id, article_id);

  -- Journal des lots : chaque entrée/sortie d'un lot, rattachée au mouvement de stock qui l'a causée.
  CREATE TABLE lot_movements (
    id          INTEGER PRIMARY KEY,
    lot_id      INTEGER NOT NULL REFERENCES lots(id),
    movement_id INTEGER REFERENCES stock_movements(id), -- NULL : identification de stock existant
    quantity    REAL NOT NULL CHECK (quantity <> 0),    -- signée : + entrée, - sortie
    note        TEXT,
    user_id     INTEGER REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_lotmov_lot      ON lot_movements(lot_id);
  CREATE INDEX idx_lotmov_movement ON lot_movements(movement_id);

  CREATE TRIGGER trg_lot_movement_apply AFTER INSERT ON lot_movements
  BEGIN
    UPDATE lots SET quantity_left = quantity_left + NEW.quantity WHERE id = NEW.lot_id;
  END;
  CREATE TRIGGER trg_lot_movements_locked_update BEFORE UPDATE ON lot_movements
  BEGIN SELECT RAISE(ABORT, 'Journal des lots : modification impossible.'); END;
  CREATE TRIGGER trg_lot_movements_locked_delete BEFORE DELETE ON lot_movements
  BEGIN SELECT RAISE(ABORT, 'Journal des lots : suppression impossible.'); END;

  -- Toute sortie d'un article suivi (vente, perte, retour fournisseur, ajustement -) puise automatiquement dans ses lots :
  -- d'abord celui qui périme le plus tôt, puis le plus ancien (FEFO / FIFO). Aucun écran existant n'a besoin de changer.
  CREATE TRIGGER trg_movement_lots_out AFTER INSERT ON stock_movements
  WHEN NEW.quantity < 0 AND (SELECT tracking FROM articles WHERE id = NEW.article_id) <> 'aucun'
  BEGIN
    INSERT INTO lot_movements(lot_id, movement_id, quantity, user_id)
    SELECT id, NEW.id, -MIN(quantity_left, -NEW.quantity - before), NEW.user_id
    FROM (SELECT id, quantity_left,
                 COALESCE(SUM(quantity_left) OVER (ORDER BY expiry_date IS NULL, expiry_date, id
                                                   ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS before
          FROM lots WHERE article_id = NEW.article_id AND quantity_left > 0.0005)
    WHERE before < -NEW.quantity - 0.0005;
  END;

  -- Annulation d'une vente : la marchandise retourne dans les lots mêmes d'où elle était sortie.
  CREATE TRIGGER trg_movement_lots_return AFTER INSERT ON stock_movements
  WHEN NEW.quantity > 0 AND NEW.type = 'retour_client' AND NEW.ref_type = 'sale'
       AND (SELECT tracking FROM articles WHERE id = NEW.article_id) <> 'aucun'
  BEGIN
    INSERT INTO lot_movements(lot_id, movement_id, quantity, user_id)
    SELECT lot_id, NEW.id, MIN(net, NEW.quantity - before), NEW.user_id
    FROM (SELECT lot_id, net,
                 COALESCE(SUM(net) OVER (ORDER BY lot_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS before
          FROM (SELECT lm.lot_id, -SUM(lm.quantity) AS net
                FROM lot_movements lm JOIN stock_movements m ON m.id = lm.movement_id
                WHERE m.ref_type = 'sale' AND m.ref_id = NEW.ref_id AND m.article_id = NEW.article_id
                GROUP BY lm.lot_id HAVING net > 0.0005))
    WHERE before < NEW.quantity - 0.0005;
  END;

  -- Journal d'audit : qui a fait quoi, quand. Rempli par le processus principal, jamais modifiable ni effaçable.
  CREATE TABLE audit_log (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER,
    user_name  TEXT NOT NULL DEFAULT '',
    channel    TEXT NOT NULL,
    details    TEXT,
    result     TEXT,
    ok         INTEGER NOT NULL,
    error      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_audit_date ON audit_log(created_at);
  CREATE INDEX idx_audit_user ON audit_log(user_id, created_at);
  CREATE TRIGGER trg_audit_locked_update BEFORE UPDATE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'Journal d''audit : modification impossible.'); END;
  CREATE TRIGGER trg_audit_locked_delete BEFORE DELETE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'Journal d''audit : suppression impossible.'); END;
  `,

  /* ---------- Version 11 : profil utilisateur (photo) et préférences d'affichage ---------- */
  `
  ALTER TABLE users ADD COLUMN avatar TEXT; -- photo de profil (data URL, réduite à 256 px par l'interface)
  ALTER TABLE users ADD COLUMN prefs TEXT;  -- préférences d'affichage propres à l'utilisateur (JSON)
  `,

  /* ---------- Version 12 : dépenses du magasin (STEG, SONEDE, loyer, salaires…) ---------- */
  `
  -- Catégories de charges, modifiables dans Paramètres > Dépenses.
  CREATE TABLE expense_categories (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    recurrence TEXT NOT NULL DEFAULT 'aucune'
               CHECK (recurrence IN ('aucune','mensuelle','bimestrielle','trimestrielle','semestrielle','annuelle')),
    due_days   INTEGER NOT NULL DEFAULT 0 CHECK (due_days BETWEEN 0 AND 120), -- délai de paiement après la date de facture
    color      TEXT NOT NULL DEFAULT '#94a3b8',
    active     INTEGER NOT NULL DEFAULT 1,
    sort       INTEGER NOT NULL DEFAULT 0
  );
  INSERT INTO expense_categories(name, recurrence, color, sort) VALUES
    ('STEG (électricité, gaz)', 'bimestrielle', '#f59e0b', 1),
    ('SONEDE (eau)', 'trimestrielle', '#0ea5e9', 2),
    ('Loyer', 'mensuelle', '#8b5cf6', 3),
    ('Salaires', 'mensuelle', '#10b981', 4),
    ('CNSS', 'trimestrielle', '#14b8a6', 5),
    ('Téléphone / Internet', 'mensuelle', '#6366f1', 6),
    ('Transport / Carburant', 'aucune', '#ef4444', 7),
    ('Impôts et taxes', 'aucune', '#64748b', 8),
    ('Entretien / Réparations', 'aucune', '#a16207', 9),
    ('Fournitures', 'aucune', '#ec4899', 10),
    ('Divers', 'aucune', '#94a3b8', 11);

  CREATE TABLE expenses (
    id              INTEGER PRIMARY KEY,
    category_id     INTEGER NOT NULL REFERENCES expense_categories(id),
    label           TEXT NOT NULL,
    payee           TEXT,                       -- bénéficiaire (STEG, propriétaire, employé…)
    reference       TEXT,                       -- n° de facture
    amount          INTEGER NOT NULL CHECK (amount > 0), -- millimes
    expense_date    TEXT NOT NULL,              -- date de la facture
    due_date        TEXT,                       -- à payer avant
    status          TEXT NOT NULL DEFAULT 'a_payer' CHECK (status IN ('a_payer','payee')),
    paid_date       TEXT,
    method          TEXT,
    from_cash       INTEGER NOT NULL DEFAULT 0, -- payée avec l'argent de la caisse
    note            TEXT,
    attachment      TEXT,                       -- photo ou PDF de la facture (data URL)
    attachment_name TEXT,
    generated       INTEGER NOT NULL DEFAULT 0, -- échéance créée automatiquement (charge récurrente)
    user_id         INTEGER REFERENCES users(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    CHECK (status = 'a_payer' OR paid_date IS NOT NULL)
  );
  CREATE INDEX idx_expenses_status   ON expenses(status, due_date);
  CREATE INDEX idx_expenses_date     ON expenses(expense_date);
  CREATE INDEX idx_expenses_paid     ON expenses(paid_date);
  CREATE INDEX idx_expenses_category ON expenses(category_id);
  `
]
