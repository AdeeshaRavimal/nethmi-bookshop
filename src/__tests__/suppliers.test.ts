import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  initPragmasAndSchema,
  CURRENT_SCHEMA_VERSION,
} from '../../electron/database';

describe('Supplier Payables & Payments Ledger', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initPragmasAndSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('initializes schema to CURRENT_SCHEMA_VERSION 13 with supplier_payments table', () => {
    const versionRow = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number };
    expect(versionRow.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(versionRow.version).toBe(13);

    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='supplier_payments'").get();
    expect(table).toBeDefined();
  });

  it('tracks supplier debt and payments accurately', () => {
    // 1. Create a supplier
    const info = db.prepare(`
      INSERT INTO suppliers (name, phone, contact_person, address)
      VALUES (?, ?, ?, ?)
    `).run('Atlas Axillia', '0112345678', 'Sunil Perera', 'Peliyagoda');
    const supplierId = Number(info.lastInsertRowid);

    // 2. Add two GRNs: one CASH (Rs. 10,000), one CREDIT (Rs. 25,000)
    db.prepare(`
      INSERT INTO grn_headers (grn_number, supplier_id, received_date, payment_type, status, total_amount)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('GRN-001', supplierId, '2026-11-10', 'CASH', 'PAID', 10000);

    const creditGrn = db.prepare(`
      INSERT INTO grn_headers (grn_number, supplier_id, received_date, payment_type, status, total_amount)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('GRN-002', supplierId, '2026-11-12', 'CREDIT', 'PENDING', 25000);
    const grnId = Number(creditGrn.lastInsertRowid);

    // Initial check: Total Purchases = 35000, Outstanding Debt = 25000
    const check1 = db.prepare(`
      SELECT 
        s.*,
        COALESCE(grn_totals.total_purchases, 0) AS total_purchases,
        COALESCE(grn_totals.credit_purchases, 0) AS credit_purchases,
        COALESCE(payments.total_paid, 0) AS total_paid,
        MAX(0, ROUND(COALESCE(grn_totals.credit_purchases, 0) - COALESCE(payments.total_paid, 0), 2)) AS total_outstanding
      FROM suppliers s
      LEFT JOIN (
        SELECT 
          supplier_id,
          SUM(total_amount) AS total_purchases,
          SUM(CASE WHEN payment_type = 'CREDIT' THEN total_amount ELSE 0 END) AS credit_purchases
        FROM grn_headers
        GROUP BY supplier_id
      ) grn_totals ON s.id = grn_totals.supplier_id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) AS total_paid FROM supplier_payments GROUP BY supplier_id
      ) payments ON s.id = payments.supplier_id
      WHERE s.id = ?
    `).get(supplierId) as any;

    expect(check1.total_purchases).toBe(35000);
    expect(check1.credit_purchases).toBe(25000);
    expect(check1.total_paid).toBe(0);
    expect(check1.total_outstanding).toBe(25000);

    // 3. Make partial payment of Rs. 15,000 via Cheque
    db.prepare(`
      INSERT INTO supplier_payments (supplier_id, grn_id, amount, payment_method, reference_no, payment_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(supplierId, grnId, 15000, 'CHEQUE', 'CHQ-88219 Commercial Bank', '2026-11-15', new Date().toISOString());

    const check2 = db.prepare(`
      SELECT 
        MAX(0, ROUND(COALESCE(grn_totals.credit_purchases, 0) - COALESCE(payments.total_paid, 0), 2)) AS total_outstanding,
        COALESCE(payments.total_paid, 0) AS total_paid
      FROM suppliers s
      LEFT JOIN (
        SELECT supplier_id, SUM(CASE WHEN payment_type = 'CREDIT' THEN total_amount ELSE 0 END) AS credit_purchases
        FROM grn_headers GROUP BY supplier_id
      ) grn_totals ON s.id = grn_totals.supplier_id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) AS total_paid FROM supplier_payments GROUP BY supplier_id
      ) payments ON s.id = payments.supplier_id
      WHERE s.id = ?
    `).get(supplierId) as any;

    expect(check2.total_paid).toBe(15000);
    expect(check2.total_outstanding).toBe(10000); // 25000 - 15000 = 10000 remaining

    // 4. Pay remaining Rs. 10,000 and settle GRN
    db.prepare(`
      INSERT INTO supplier_payments (supplier_id, grn_id, amount, payment_method, reference_no, payment_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(supplierId, grnId, 10000, 'CASH', 'Cash receipt #90', '2026-11-16', new Date().toISOString());

    // Check if GRN total is settled
    const totalPaidForGrn = (db.prepare('SELECT SUM(amount) as paid FROM supplier_payments WHERE grn_id = ?').get(grnId) as any).paid;
    expect(totalPaidForGrn).toBe(25000);

    // Final debt check
    const check3 = db.prepare(`
      SELECT 
        MAX(0, ROUND(COALESCE(grn_totals.credit_purchases, 0) - COALESCE(payments.total_paid, 0), 2)) AS total_outstanding,
        COALESCE(payments.total_paid, 0) AS total_paid
      FROM suppliers s
      LEFT JOIN (
        SELECT supplier_id, SUM(CASE WHEN payment_type = 'CREDIT' THEN total_amount ELSE 0 END) AS credit_purchases
        FROM grn_headers GROUP BY supplier_id
      ) grn_totals ON s.id = grn_totals.supplier_id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) AS total_paid FROM supplier_payments GROUP BY supplier_id
      ) payments ON s.id = payments.supplier_id
      WHERE s.id = ?
    `).get(supplierId) as any;

    expect(check3.total_paid).toBe(25000);
    expect(check3.total_outstanding).toBe(0); // Fully clear!
  });
});
