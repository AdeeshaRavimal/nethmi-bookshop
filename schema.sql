-- ============================================================
--  Nethmi Bookshop – Reference Schema
--  Keep this file in sync with electron/database.ts
--  CURRENT_SCHEMA_VERSION = 2
-- ============================================================

-- 1. Suppliers Master Table
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    notes TEXT,
    is_synced BOOLEAN DEFAULT 0
);

-- 2. Inventory (Books & Stationery)
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT UNIQUE,            -- ISBN or short retail code
    title TEXT NOT NULL,
    category TEXT DEFAULT 'BOOK',   -- 'BOOK', 'STATIONERY', etc.
    cost_price REAL NOT NULL,       -- Purchase wholesale cost
    selling_price REAL NOT NULL,    -- Retail shelf price
    discount_percent REAL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER DEFAULT 3, -- Low-stock alert threshold
    supplier_id INTEGER REFERENCES suppliers(id),
    is_synced BOOLEAN DEFAULT 0
);

-- 3. Sales Header
CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_no TEXT UNIQUE NOT NULL,
    total_amount REAL NOT NULL,
    total_cost REAL NOT NULL,
    gross_profit REAL NOT NULL,     -- total_amount - total_cost
    payment_type TEXT DEFAULT 'CASH', -- 'CASH', 'CARD', 'ONLINE'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_synced BOOLEAN DEFAULT 0
);

-- 4. Sale Line Items
CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    product_id INTEGER NOT NULL REFERENCES inventory(id),
    quantity INTEGER NOT NULL,
    unit_cost REAL NOT NULL,
    unit_price REAL NOT NULL,
    discount_percent REAL DEFAULT 0,
    original_price REAL NOT NULL,
    is_synced BOOLEAN DEFAULT 0,
    FOREIGN KEY(sale_id) REFERENCES sales(id),
    FOREIGN KEY(product_id) REFERENCES inventory(id)
);

-- 5. Shop Fixtures & Assets
CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_name TEXT NOT NULL,       -- 'Racks', 'Printer', 'Counter'
    cost_value REAL NOT NULL,
    purchase_date DATE,
    condition TEXT DEFAULT 'GOOD',  -- 'EXCELLENT', 'GOOD', 'REPAIR'
    is_synced BOOLEAN DEFAULT 0
);

-- 6. Bills, Rent & Liabilities
--    *** Table name is `bills` — matches electron/database.ts ***
--    (previously mislabelled `liabilities_bills` in older drafts — that name is WRONG)
CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_type TEXT NOT NULL,        -- 'ELECTRICITY', 'RENT', 'SUPPLIER_DEBT'
    title TEXT NOT NULL,            -- 'CEB Bill Sept', 'Distributor Due'
    amount REAL NOT NULL,
    due_date DATE,
    status TEXT DEFAULT 'PENDING',  -- 'PENDING', 'PAID'
    paid_date DATE,
    supplier_id INTEGER REFERENCES suppliers(id),
    is_synced BOOLEAN DEFAULT 0
);

-- 7. Application Settings (key-value store)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- 8. Schema Version Tracking
--    The `version` row is inserted/updated by runMigrations() in database.ts.
--    Increment CURRENT_SCHEMA_VERSION in database.ts whenever you add a migration.
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);

-- Fast Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON inventory(barcode);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_bills_due ON bills(due_date);
