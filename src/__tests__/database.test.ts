import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  initPragmasAndSchema,
  runMigrations,
  CURRENT_SCHEMA_VERSION,
} from '../../electron/database';

describe('Database Schema & Migration Engine', () => {
  let memDb: Database.Database;

  beforeEach(() => {
    // Create a pristine in-memory SQLite instance for each test
    memDb = new Database(':memory:');
  });

  afterEach(() => memDb.close());

  it('initializes base tables and pragmas successfully', () => {
    initPragmasAndSchema(memDb);

    // Verify all expected core tables exist
    const tables = memDb
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain('inventory');
    expect(tables).toContain('sales');
    expect(tables).toContain('sale_items');
    expect(tables).toContain('suppliers');
    expect(tables).toContain('bills');
    expect(tables).toContain('assets');
    expect(tables).toContain('settings');
    expect(tables).toContain('schema_version');
  });

  it('records the CURRENT_SCHEMA_VERSION in schema_version table', () => {
    initPragmasAndSchema(memDb);

    const versionRow = memDb
      .prepare('SELECT version FROM schema_version LIMIT 1')
      .get() as { version: number };

    expect(versionRow).toBeDefined();
    expect(versionRow.version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('is idempotent when runMigrations is called multiple times', () => {
    initPragmasAndSchema(memDb);

    // Run again
    expect(() => runMigrations(memDb)).not.toThrow();
    expect(() => runMigrations(memDb)).not.toThrow();

    const countRow = memDb
      .prepare('SELECT COUNT(*) as count FROM schema_version')
      .get() as { count: number };

    // Must still have exactly one row
    expect(countRow.count).toBe(1);
  });

  it('migrates a legacy v1 database to v2 by adding missing columns', () => {
    // Simulate legacy v1 database: bills has no supplier_id, inventory has no reorder_level
    memDb.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (1);

      CREATE TABLE suppliers (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE bills (id INTEGER PRIMARY KEY, title TEXT, amount REAL);
      CREATE TABLE inventory (id INTEGER PRIMARY KEY, barcode TEXT, title TEXT);
    `);

    // Other legacy tables needed by the receipt-snapshot migration.
    memDb.exec(`
      CREATE TABLE sales (id INTEGER PRIMARY KEY);
      CREATE TABLE sale_items (id INTEGER PRIMARY KEY, product_id INTEGER);
    `);
    // Run migration engine
    runMigrations(memDb);

    // Check schema_version updated to CURRENT_SCHEMA_VERSION
    const row = memDb.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number };
    expect(row.version).toBe(CURRENT_SCHEMA_VERSION);

    // Verify new columns exist by inserting data into them
    expect(() => {
      memDb.prepare('INSERT INTO bills (title, amount, supplier_id) VALUES (?, ?, ?)').run('Paper invoice', 5000, null);
    }).not.toThrow();

    expect(() => {
      memDb.prepare('INSERT INTO inventory (barcode, title, reorder_level) VALUES (?, ?, ?)').run('99999', 'Notebook', 10);
    }).not.toThrow();
  });

  it('safely migrates a legacy v14 database with credit_payments missing payment_date during initPragmasAndSchema', () => {
    // Simulate legacy v14 database: credit_payments has NO payment_date column
    memDb.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (14);

      CREATE TABLE credit_customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        total_outstanding REAL DEFAULT 0,
        credit_limit REAL DEFAULT 0,
        notes TEXT DEFAULT ''
      );

      CREATE TABLE credit_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES credit_customers(id),
        sale_id INTEGER,
        amount REAL NOT NULL,
        payment_type TEXT DEFAULT 'PAYMENT',
        notes TEXT DEFAULT '',
        created_at DATETIME DEFAULT '2026-11-15 10:30:00'
      );
    `);

    // Must not throw "SqliteError: no such column: payment_date"
    expect(() => initPragmasAndSchema(memDb)).not.toThrow();

    const cols = (memDb.prepare("PRAGMA table_info('credit_payments')").all() as Array<{ name: string }>).map(c => c.name);
    expect(cols).toContain('payment_date');

    const versionRow = memDb.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number };
    expect(versionRow.version).toBe(CURRENT_SCHEMA_VERSION);
  });
});
