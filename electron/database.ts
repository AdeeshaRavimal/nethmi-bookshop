import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { replaceDatabaseFromBackup } from './restore';

// ─── Database path ────────────────────────────────────────────────────────────
const dbPath = typeof app?.getPath === 'function' 
  ? path.join(app.getPath('userData'), 'database.sqlite') 
  : ':memory:';
let db = new Database(dbPath);

// ─── Schema versioning ────────────────────────────────────────────────────────
// Bump this number every time you add a new migration below.
export const CURRENT_SCHEMA_VERSION = 16;

/**
 * Run incremental migrations to bring an existing database up to date.
 * Each migration block is guarded by `if (currentVersion < N)` so it is
 * idempotent — safe to call on every startup.
 */
export function runMigrations(instance: Database.Database) {
  instance.transaction(() => {
  // Ensure the version table exists and has exactly one row.
  instance.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
  `);

  const row = instance.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined;
  let currentVersion = row?.version ?? 0;
  if (currentVersion > CURRENT_SCHEMA_VERSION) throw new Error('Database requires a newer application version');

  // ── Migration v1 → v2: add supplier_id to bills (if missing) ───────────────
  if (currentVersion < 2) {
    try {
      instance.exec(`ALTER TABLE bills ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id);`);
    } catch {
      // Column already exists — nothing to do.
    }

    // Add reorder_level to inventory (v1 databases may not have it)
    try {
      instance.exec(`ALTER TABLE inventory ADD COLUMN reorder_level INTEGER DEFAULT 3;`);
    } catch {
      // Column already exists — nothing to do.
    }

    currentVersion = 2;
  }

  // ── Migration v2 → v3 ───────────────────────────────────────────────────────
  if (currentVersion < 3) {
    currentVersion = 3;
  }

  if (currentVersion < 4) {
    instance.transaction(() => {
      instance.exec('ALTER TABLE sales ADD COLUMN checkout_request_id TEXT;');
      instance.exec('CREATE UNIQUE INDEX idx_sales_checkout_request ON sales(checkout_request_id);');
      instance.exec('ALTER TABLE sale_items ADD COLUMN title TEXT;');
      instance.exec('ALTER TABLE sale_items ADD COLUMN barcode TEXT;');
      instance.exec(`UPDATE sale_items SET title = (SELECT title FROM inventory WHERE id = product_id),
        barcode = (SELECT barcode FROM inventory WHERE id = product_id);`);
    })();
    currentVersion = 4;
  }

  // ── Migration v4 → v5: Remove pre-seeded service items ──────────────────────
  if (currentVersion < 5) {
    try {
      instance.exec(`DELETE FROM inventory WHERE barcode LIKE 'SRV-%' OR category = 'SERVICE';`);
    } catch {
      // Safe fallback
    }
    currentVersion = 5;
  }

  // ── Migration v5 → v6: Add GRN (Goods Received Note) tables ─────────────────
  if (currentVersion < 6) {
    instance.exec(`
      CREATE TABLE IF NOT EXISTS grn_headers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grn_number TEXT UNIQUE NOT NULL,
        supplier_id INTEGER REFERENCES suppliers(id),
        received_date DATE NOT NULL,
        payment_type TEXT NOT NULL DEFAULT 'CASH',
        due_date DATE,
        status TEXT NOT NULL DEFAULT 'PAID',
        paid_date DATE,
        total_amount REAL NOT NULL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS grn_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grn_id INTEGER NOT NULL REFERENCES grn_headers(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES inventory(id),
        barcode TEXT NOT NULL,
        title TEXT NOT NULL,
        received_qty INTEGER NOT NULL DEFAULT 0,
        unit_cost REAL NOT NULL DEFAULT 0,
        total_cost REAL NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_grn_headers_date ON grn_headers(received_date);
      CREATE INDEX IF NOT EXISTS idx_grn_headers_status ON grn_headers(status);
      CREATE INDEX IF NOT EXISTS idx_grn_items_grn ON grn_items(grn_id);
    `);
    currentVersion = 6;
  }

  // ── Migration v6 → v7: Add bill_discount to sales table ─────────────────────
  if (currentVersion < 7) {
    try {
      instance.exec('ALTER TABLE sales ADD COLUMN bill_discount REAL DEFAULT 0;');
    } catch {
      // Column might already exist
    }
    currentVersion = 7;
  }

  // ── Migration v7 → v8: FIFO stock batches + selling_price on grn_items ───────
  if (currentVersion < 8) {
    // Add selling_price to grn_items so each GRN line can carry its own retail price
    try {
      instance.exec('ALTER TABLE grn_items ADD COLUMN selling_price REAL NOT NULL DEFAULT 0;');
    } catch {
      // Already exists in fresh databases
    }

    // Create FIFO stock batch ledger
    instance.exec(`
      CREATE TABLE IF NOT EXISTS stock_batches (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id      INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        grn_id          INTEGER REFERENCES grn_headers(id) ON DELETE SET NULL,
        received_date   DATE NOT NULL,
        initial_qty     INTEGER NOT NULL DEFAULT 0,
        remaining_qty   INTEGER NOT NULL DEFAULT 0,
        unit_cost       REAL NOT NULL DEFAULT 0,
        selling_price   REAL NOT NULL DEFAULT 0,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_stock_batches_product ON stock_batches(product_id, remaining_qty);
      CREATE INDEX IF NOT EXISTS idx_stock_batches_grn ON stock_batches(grn_id);
    `);

    currentVersion = 8;
  }

  // ── Migration v8 → v9: Cashbook entries ─────────────────────────────────────
  if (currentVersion < 9) {
    instance.exec(`
      CREATE TABLE IF NOT EXISTS cashbook_entries (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_date      TEXT NOT NULL,
        entry_time      TEXT,
        type            TEXT NOT NULL,
        category        TEXT NOT NULL,
        amount          REAL NOT NULL,
        description     TEXT NOT NULL,
        reference_no    TEXT,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_cashbook_date ON cashbook_entries(entry_date);
    `);
    currentVersion = 9;
  }

  // ── Migration v9 → v10: Credit customers + credit_payments ─────────────────
  if (currentVersion < 10) {
    instance.exec(`
      CREATE TABLE IF NOT EXISTS credit_customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT DEFAULT '',
        address TEXT DEFAULT '',
        credit_limit REAL DEFAULT 0,
        total_outstanding REAL DEFAULT 0,
        notes TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS credit_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES credit_customers(id),
        sale_id INTEGER REFERENCES sales(id),
        amount REAL NOT NULL,
        payment_type TEXT DEFAULT 'PAYMENT',
        notes TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_credit_payments_customer ON credit_payments(customer_id);
      CREATE INDEX IF NOT EXISTS idx_credit_payments_sale ON credit_payments(sale_id);
    `);
    currentVersion = 10;
  }

  // ── Migration v10 → v11: Add customer_id to sales ───────────────────────────
  if (currentVersion < 11) {
    try {
      instance.exec('ALTER TABLE sales ADD COLUMN customer_id INTEGER REFERENCES credit_customers(id);');
    } catch {
      // Column might already exist in fresh databases
    }
    currentVersion = 11;
  }

  // ── Migration v11 → v12: Add loyalty points to customers + points earned on sales ──
  if (currentVersion < 12) {
    try {
      instance.exec('ALTER TABLE credit_customers ADD COLUMN loyalty_points INTEGER DEFAULT 0;');
    } catch {
      // column already exists
    }
    try {
      instance.exec('ALTER TABLE sales ADD COLUMN points_earned INTEGER DEFAULT 0;');
    } catch {
      // column already exists
    }
    try {
      instance.exec('ALTER TABLE sales ADD COLUMN points_redeemed INTEGER DEFAULT 0;');
    } catch {
      // column already exists
    }
    currentVersion = 12;
  }

  // ── Migration v12 → v13: Supplier Payables & Payments Ledger ─────────────────
  if (currentVersion < 13) {
    try {
      instance.exec('ALTER TABLE suppliers ADD COLUMN contact_person TEXT;');
    } catch {}
    try {
      instance.exec('ALTER TABLE suppliers ADD COLUMN address TEXT;');
    } catch {}
    try {
      instance.exec('ALTER TABLE suppliers ADD COLUMN email TEXT;');
    } catch {}
    try {
      instance.exec('ALTER TABLE suppliers ADD COLUMN created_at TEXT;');
    } catch {}
    try {
      instance.exec('ALTER TABLE grn_headers ADD COLUMN supplier_invoice_no TEXT;');
    } catch {}

    instance.exec(`
      CREATE TABLE IF NOT EXISTS supplier_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        grn_id INTEGER REFERENCES grn_headers(id),
        amount REAL NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'CASH',
        reference_no TEXT,
        payment_date TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_payments_date ON supplier_payments(payment_date);
    `);
    currentVersion = 13;
  }

  // ── Migration v13 → v14: Cheque Management & Sales Returns ───────────────────
  if (currentVersion < 14) {
    instance.exec(`
      CREATE TABLE IF NOT EXISTS cheques (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cheque_number TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        branch TEXT DEFAULT '',
        amount REAL NOT NULL,
        cheque_type TEXT NOT NULL DEFAULT 'ISSUED_TO_SUPPLIER',
        payee_or_drawer TEXT NOT NULL,
        supplier_id INTEGER REFERENCES suppliers(id),
        customer_id INTEGER REFERENCES credit_customers(id),
        issue_date DATE NOT NULL,
        due_date DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        cleared_date DATE,
        notes TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_cheques_due_date ON cheques(due_date);
      CREATE INDEX IF NOT EXISTS idx_cheques_status ON cheques(status);
      CREATE INDEX IF NOT EXISTS idx_cheques_type ON cheques(cheque_type);

      CREATE TABLE IF NOT EXISTS sales_returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        return_no TEXT UNIQUE NOT NULL,
        sale_id INTEGER REFERENCES sales(id),
        receipt_no TEXT NOT NULL,
        product_id INTEGER REFERENCES inventory(id),
        barcode TEXT NOT NULL,
        title TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        refund_amount REAL NOT NULL,
        refund_method TEXT NOT NULL DEFAULT 'CASH',
        reason TEXT NOT NULL,
        return_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sales_returns_sale ON sales_returns(sale_id);
      CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON sales_returns(return_date);
    `);
    currentVersion = 14;
  }

  // ── Migration v14 → v15: Add payment_date to credit_payments ─────────────────
  if (currentVersion < 15) {
    try {
      instance.exec('ALTER TABLE credit_payments ADD COLUMN payment_date TEXT;');
      instance.exec("UPDATE credit_payments SET payment_date = SUBSTR(created_at, 1, 10) WHERE payment_date IS NULL;");
    } catch {}
    currentVersion = 15;
  }

  // ── Migration v15 → v16: Performance composite indexes ───────────────────────
  if (currentVersion < 16) {
    try {
      instance.exec(`
        CREATE INDEX IF NOT EXISTS idx_sales_pay_created ON sales(payment_type, created_at);
        CREATE INDEX IF NOT EXISTS idx_sales_receipt ON sales(receipt_no);
        CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
        CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
        CREATE INDEX IF NOT EXISTS idx_credit_payments_date ON credit_payments(payment_date);
        CREATE INDEX IF NOT EXISTS idx_supplier_payments_date ON supplier_payments(payment_date);
        CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
      `);
    } catch {}
    currentVersion = 16;
  }

  // Persist the version so we don't re-run migrations next time.
  if (row === undefined) {
    instance.prepare('INSERT INTO schema_version (version) VALUES (?)').run(CURRENT_SCHEMA_VERSION);
  } else {
    instance.prepare('UPDATE schema_version SET version = ?').run(CURRENT_SCHEMA_VERSION);
  }
  })();
}

// ─── Base schema (CREATE TABLE IF NOT EXISTS — always safe to run) ────────────
export function initPragmasAndSchema(instance: Database.Database) {
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');

  // Base schema — every table uses IF NOT EXISTS so this is always safe.
  instance.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      contact_person TEXT,
      address TEXT,
      email TEXT,
      notes TEXT,
      created_at TEXT,
      is_synced BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'BOOK',
      cost_price REAL NOT NULL,
      selling_price REAL NOT NULL,
      discount_percent REAL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 0,
      reorder_level INTEGER DEFAULT 3,
      supplier_id INTEGER REFERENCES suppliers(id),
      is_synced BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_no TEXT UNIQUE NOT NULL,
      total_amount REAL NOT NULL,
      total_cost REAL NOT NULL,
      gross_profit REAL NOT NULL,
      payment_type TEXT DEFAULT 'CASH',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      bill_discount REAL DEFAULT 0,
      is_synced BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_cost REAL NOT NULL,
      unit_price REAL NOT NULL,
      discount_percent REAL DEFAULT 0,
      original_price REAL NOT NULL,
      is_synced BOOLEAN DEFAULT 0,
      FOREIGN KEY(sale_id) REFERENCES sales(id),
      FOREIGN KEY(product_id) REFERENCES inventory(id)
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_name TEXT NOT NULL,
      cost_value REAL NOT NULL,
      purchase_date DATE,
      condition TEXT DEFAULT 'GOOD',
      is_synced BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_type TEXT NOT NULL,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      due_date DATE,
      status TEXT DEFAULT 'PENDING',
      paid_date DATE,
      supplier_id INTEGER REFERENCES suppliers(id),
      is_synced BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON inventory(barcode);
    CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
    CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_pay_created ON sales(payment_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_receipt ON sales(receipt_no);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_bills_due ON bills(due_date);

    CREATE TABLE IF NOT EXISTS grn_headers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grn_number TEXT UNIQUE NOT NULL,
      supplier_id INTEGER REFERENCES suppliers(id),
      supplier_invoice_no TEXT,
      received_date DATE NOT NULL,
      payment_type TEXT NOT NULL DEFAULT 'CASH',
      due_date DATE,
      status TEXT NOT NULL DEFAULT 'PAID',
      paid_date DATE,
      total_amount REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supplier_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      grn_id INTEGER REFERENCES grn_headers(id),
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'CASH',
      reference_no TEXT,
      payment_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_payments_date ON supplier_payments(payment_date);

    CREATE TABLE IF NOT EXISTS grn_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grn_id INTEGER NOT NULL REFERENCES grn_headers(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES inventory(id),
      barcode TEXT NOT NULL,
      title TEXT NOT NULL,
      received_qty INTEGER NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      selling_price REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_grn_headers_date ON grn_headers(received_date);
    CREATE INDEX IF NOT EXISTS idx_grn_headers_status ON grn_headers(status);
    CREATE INDEX IF NOT EXISTS idx_grn_items_grn ON grn_items(grn_id);

    CREATE TABLE IF NOT EXISTS stock_batches (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id      INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
      grn_id          INTEGER REFERENCES grn_headers(id) ON DELETE SET NULL,
      received_date   DATE NOT NULL,
      initial_qty     INTEGER NOT NULL DEFAULT 0,
      remaining_qty   INTEGER NOT NULL DEFAULT 0,
      unit_cost       REAL NOT NULL DEFAULT 0,
      selling_price   REAL NOT NULL DEFAULT 0,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_stock_batches_product ON stock_batches(product_id, remaining_qty);
    CREATE INDEX IF NOT EXISTS idx_stock_batches_grn ON stock_batches(grn_id);

    CREATE TABLE IF NOT EXISTS cashbook_entries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date      TEXT NOT NULL,
      entry_time      TEXT,
      type            TEXT NOT NULL,
      category        TEXT NOT NULL,
      amount          REAL NOT NULL,
      description     TEXT NOT NULL,
      reference_no    TEXT,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cashbook_date ON cashbook_entries(entry_date);

    CREATE TABLE IF NOT EXISTS credit_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      credit_limit REAL DEFAULT 0,
      total_outstanding REAL DEFAULT 0,
      loyalty_points INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS credit_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES credit_customers(id),
      sale_id INTEGER REFERENCES sales(id),
      amount REAL NOT NULL,
      payment_type TEXT DEFAULT 'PAYMENT',
      notes TEXT DEFAULT '',
      payment_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_credit_payments_customer ON credit_payments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_credit_payments_sale ON credit_payments(sale_id);
    CREATE INDEX IF NOT EXISTS idx_credit_payments_date ON credit_payments(payment_date);

    CREATE TABLE IF NOT EXISTS cheques (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cheque_number TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      branch TEXT DEFAULT '',
      amount REAL NOT NULL,
      cheque_type TEXT NOT NULL DEFAULT 'ISSUED_TO_SUPPLIER',
      payee_or_drawer TEXT NOT NULL,
      supplier_id INTEGER REFERENCES suppliers(id),
      customer_id INTEGER REFERENCES credit_customers(id),
      issue_date DATE NOT NULL,
      due_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      cleared_date DATE,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cheques_due_date ON cheques(due_date);
    CREATE INDEX IF NOT EXISTS idx_cheques_status ON cheques(status);
    CREATE INDEX IF NOT EXISTS idx_cheques_type ON cheques(cheque_type);

    CREATE TABLE IF NOT EXISTS sales_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_no TEXT UNIQUE NOT NULL,
      sale_id INTEGER REFERENCES sales(id),
      receipt_no TEXT NOT NULL,
      product_id INTEGER REFERENCES inventory(id),
      barcode TEXT NOT NULL,
      title TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      refund_amount REAL NOT NULL,
      refund_method TEXT NOT NULL DEFAULT 'CASH',
      reason TEXT NOT NULL,
      return_date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sales_returns_sale ON sales_returns(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON sales_returns(return_date);
  `);

  // Run incremental migrations after the base schema is in place.
  runMigrations(instance);
}

initPragmasAndSchema(db);

// ─── Exports ──────────────────────────────────────────────────────────────────

export function getDb(): Database.Database {
  return db;
}

export function getSetting(key: string, defaultValue: string = ''): string {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setSetting(key: string, value: string): void {
  try {
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, value);
  } catch (err) {
    console.error('Failed to save setting', err);
  }
}

export function cleanupOldBackups(folderPath: string, maxDays = 7) {
  try {
    if (!fs.existsSync(folderPath)) return;
    const now = Date.now();
    const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
      if ((file.startsWith('hiru_backup_') || file.startsWith('nethmi_backup_')) && (file.endsWith('.sqlite') || file.endsWith('.db'))) {
        const fullPath = path.join(folderPath, file);
        const stats = fs.statSync(fullPath);
        if (now - stats.mtimeMs > maxAgeMs) {
          try {
            fs.unlinkSync(fullPath);
          } catch (e) {
            console.error('Failed to remove old backup', fullPath, e);
          }
        }
      }
    }
  } catch (e) {
    console.error('Error during old backup cleanup:', e);
  }
}

export async function backupDatabase(destPath: string): Promise<void> {
  await db.backup(destPath);
}

export async function backupToFolder(folderPath: string): Promise<string> {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  const d = new Date();
  const dateStr = d.toISOString().split('T')[0];
  const timeStr = `${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
  const fileName = `hiru_backup_${dateStr}_${timeStr}.sqlite`;
  const targetPath = path.join(folderPath, fileName);

  await backupDatabase(targetPath);
  cleanupOldBackups(folderPath, 7);
  setSetting('last_backup_time', d.toISOString());
  setSetting('last_backup_file', fileName);
  return targetPath;
}

export async function restoreDatabase(sourcePath: string): Promise<void> {
  db = await replaceDatabaseFromBackup(db, dbPath, sourcePath, initPragmasAndSchema, recovered => { db = recovered; });
}

export default db;
