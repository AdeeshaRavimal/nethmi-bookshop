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

  it('initializes schema to CURRENT_SCHEMA_VERSION 14 with supplier_payments, cheques, and sales_returns tables', () => {
    const versionRow = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number };
    expect(versionRow.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(versionRow.version).toBe(14);

    const supPayTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='supplier_payments'").get();
    expect(supPayTable).toBeDefined();

    const chequesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cheques'").get();
    expect(chequesTable).toBeDefined();

    const returnsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sales_returns'").get();
    expect(returnsTable).toBeDefined();
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

  it('records supplier_invoice_no on GRN and calculates batch margins correctly', () => {
    const sInfo = db.prepare(`
      INSERT INTO suppliers (name, phone) VALUES (?, ?)
    `).run('Richard Trading', '0771234567');
    const supplierId = Number(sInfo.lastInsertRowid);

    const grnInfo = db.prepare(`
      INSERT INTO grn_headers (grn_number, supplier_id, supplier_invoice_no, received_date, payment_type, status, total_amount, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('GRN-20261116-001', supplierId, 'INV-88941', '2026-11-16', 'CASH', 'PAID', 6000, 'Batch of Atlas pens and books');
    const grnId = Number(grnInfo.lastInsertRowid);

    // Insert items
    db.prepare(`
      INSERT INTO grn_items (grn_id, barcode, title, received_qty, unit_cost, selling_price, total_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(grnId, 'ITEM-PEN-01', 'Atlas Chooty Blue Pen', 50, 40, 60, 2000);

    db.prepare(`
      INSERT INTO grn_items (grn_id, barcode, title, received_qty, unit_cost, selling_price, total_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(grnId, 'ITEM-CR-80', 'CR 80pg Single Rule Book', 20, 200, 280, 4000);

    // Verify header retrieval with invoice no
    const header = db.prepare(`
      SELECT g.*, s.name AS supplier_name
      FROM grn_headers g
      LEFT JOIN suppliers s ON s.id = g.supplier_id
      WHERE g.id = ?
    `).get(grnId) as any;

    expect(header.grn_number).toBe('GRN-20261116-001');
    expect(header.supplier_invoice_no).toBe('INV-88941');
    expect(header.supplier_name).toBe('Richard Trading');
    expect(header.total_amount).toBe(6000);

    // Verify items and profit margins
    const items = db.prepare('SELECT * FROM grn_items WHERE grn_id = ? ORDER BY id ASC').all(grnId) as any[];
    expect(items).toHaveLength(2);

    // Item 1: cost 40, sell 60 -> profit 20, margin 33.33%
    const item1 = items[0];
    const profit1 = item1.selling_price - item1.unit_cost;
    const marginPct1 = Math.round((profit1 / item1.selling_price) * 1000) / 10;
    expect(profit1).toBe(20);
    expect(marginPct1).toBe(33.3);

    // Item 2: cost 200, sell 280 -> profit 80, margin 28.57%
    const item2 = items[1];
    const profit2 = item2.selling_price - item2.unit_cost;
    const marginPct2 = Math.round((profit2 / item2.selling_price) * 1000) / 10;
    expect(profit2).toBe(80);
    expect(marginPct2).toBe(28.6);

    // Total retail value: 50 * 60 + 20 * 280 = 3000 + 5600 = 8600
    const totalRetail = items.reduce((sum, it) => sum + (it.received_qty * it.selling_price), 0);
    expect(totalRetail).toBe(8600);
    const overallProfit = totalRetail - header.total_amount;
    expect(overallProfit).toBe(2600); // 8600 - 6000 = 2600
  });
});
