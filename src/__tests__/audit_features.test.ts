import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initPragmasAndSchema, runMigrations, CURRENT_SCHEMA_VERSION } from '../../electron/database';
import { reconcileStock } from '../../electron/stock';

describe('Audit Features (A, B, D, E, F)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initPragmasAndSchema(db);
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('Schema v14: cheques and sales_returns tables exist with correct schema', () => {
    const versionRow = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number };
    expect(versionRow.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(versionRow.version).toBe(14);

    const chequesCols = db.prepare("PRAGMA table_info('cheques')").all() as Array<{ name: string }>;
    const chequeColNames = chequesCols.map(c => c.name);
    expect(chequeColNames).toContain('cheque_number');
    expect(chequeColNames).toContain('bank_name');
    expect(chequeColNames).toContain('due_date');
    expect(chequeColNames).toContain('status');
    expect(chequeColNames).toContain('cheque_type');

    const returnsCols = db.prepare("PRAGMA table_info('sales_returns')").all() as Array<{ name: string }>;
    const returnColNames = returnsCols.map(c => c.name);
    expect(returnColNames).toContain('return_no');
    expect(returnColNames).toContain('receipt_no');
    expect(returnColNames).toContain('refund_amount');
    expect(returnColNames).toContain('refund_method');
  });

  it('Feature A: Cheque Management & Post-Dated Due Alerts', () => {
    // 1. Create a supplier
    const supInfo = db.prepare(`
      INSERT INTO suppliers (name, phone) VALUES (?, ?)
    `).run('Sarasavi Publishers', '0112820820');
    const supId = Number(supInfo.lastInsertRowid);

    // 2. Issue a cheque due in 3 days (within 7 days alert window)
    const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const chq1Info = db.prepare(`
      INSERT INTO cheques (cheque_number, bank_name, branch, amount, cheque_type, payee_or_drawer, supplier_id, issue_date, due_date, status)
      VALUES (?, ?, ?, ?, 'ISSUED_TO_SUPPLIER', ?, ?, '2026-11-16', ?, 'PENDING')
    `).run('001234', 'Commercial Bank', 'Avissawella', 25000, 'Sarasavi Publishers', supId, in3Days);

    // 3. Issue a cheque due in 30 days (outside alert window)
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    db.prepare(`
      INSERT INTO cheques (cheque_number, bank_name, branch, amount, cheque_type, payee_or_drawer, supplier_id, issue_date, due_date, status)
      VALUES (?, ?, ?, ?, 'ISSUED_TO_SUPPLIER', ?, ?, '2026-11-16', ?, 'PENDING')
    `).run('001235', 'BOC', 'Colombo', 50000, 'Sarasavi Publishers', supId, in30Days);

    // 4. Query due alerts (due <= 7 days)
    const dueAlerts = db.prepare(`
      SELECT * FROM cheques
      WHERE status = 'PENDING' AND due_date <= date('now', '+7 days', 'localtime')
      ORDER BY due_date ASC
    `).all() as any[];

    expect(dueAlerts.length).toBe(1);
    expect(dueAlerts[0].cheque_number).toBe('001234');
    expect(dueAlerts[0].amount).toBe(25000);

    // 5. Mark cleared
    db.prepare("UPDATE cheques SET status = 'CLEARED', cleared_date = '2026-11-19' WHERE id = ?").run(chq1Info.lastInsertRowid);
    const updated = db.prepare('SELECT * FROM cheques WHERE id = ?').get(chq1Info.lastInsertRowid) as any;
    expect(updated.status).toBe('CLEARED');
    expect(updated.cleared_date).toBe('2026-11-19');

    // Due alerts now 0
    const remainingAlerts = db.prepare(`
      SELECT * FROM cheques
      WHERE status = 'PENDING' AND due_date <= date('now', '+7 days', 'localtime')
    `).all();
    expect(remainingAlerts.length).toBe(0);
  });

  it('Feature D: POS Item Returns & Stock Restocking', () => {
    // 1. Create an inventory item with stock = 10
    const invInfo = db.prepare(`
      INSERT INTO inventory (barcode, title, category, cost_price, selling_price, quantity)
      VALUES (?, ?, 'BOOK', ?, ?, ?)
    `).run('BK-001', 'Madol Doova', 300, 500, 10);
    const prodId = Number(invInfo.lastInsertRowid);
    reconcileStock(db, prodId);

    // 2. Perform a sale of 2 units (stock becomes 8)
    const saleInfo = db.prepare(`
      INSERT INTO sales (receipt_no, total_amount, total_cost, gross_profit, payment_type)
      VALUES ('REC-20261116-001', 1000, 600, 400, 'CASH')
    `).run();
    const saleId = Number(saleInfo.lastInsertRowid);

    db.prepare(`
      INSERT INTO sale_items (sale_id, product_id, barcode, title, quantity, unit_cost, unit_price, original_price)
      VALUES (?, ?, 'BK-001', 'Madol Doova', 2, 300, 500, 500)
    `).run(saleId, prodId);

    db.prepare('UPDATE inventory SET quantity = quantity - 2 WHERE id = ?').run(prodId);
    reconcileStock(db, prodId);

    expect(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(prodId)).toEqual({ quantity: 8 });

    // 3. Process return of 1 unit
    const returnNo = 'RET-100001';
    db.prepare(`
      INSERT INTO sales_returns (return_no, sale_id, receipt_no, product_id, barcode, title, quantity, unit_price, refund_amount, refund_method, reason, return_date)
      VALUES (?, ?, 'REC-20261116-001', ?, 'BK-001', 'Madol Doova', 1, 500, 500, 'CASH', 'Customer exchange', '2026-11-16')
    `).run(returnNo, saleId, prodId);

    // Stock restored
    db.prepare('UPDATE inventory SET quantity = quantity + 1 WHERE id = ?').run(prodId);
    const batch = db.prepare('SELECT id FROM stock_batches WHERE product_id = ? AND selling_price = ? ORDER BY id DESC LIMIT 1')
      .get(prodId, 500) as { id: number } | undefined;
    if (batch) {
      db.prepare('UPDATE stock_batches SET remaining_qty = remaining_qty + 1 WHERE id = ?').run(batch.id);
    }
    reconcileStock(db, prodId);

    // 4. Verify inventory quantity is restored to 9
    const itemAfter = db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(prodId) as any;
    expect(itemAfter.quantity).toBe(9);

    // 5. Verify sales return record
    const retRecord = db.prepare('SELECT * FROM sales_returns WHERE return_no = ?').get(returnNo) as any;
    expect(retRecord.quantity).toBe(1);
    expect(retRecord.refund_amount).toBe(500);
    expect(retRecord.refund_method).toBe('CASH');
  });

  it('Feature E: Cashbook Auto-Sync (Supplier cash payments & Customer credit collections)', () => {
    const today = '2026-11-16';

    // 1. Supplier Cash Payment
    const supInfo = db.prepare("INSERT INTO suppliers (name, phone) VALUES ('Atlas', '011')").run();
    db.prepare(`
      INSERT INTO supplier_payments (supplier_id, amount, payment_method, reference_no, payment_date, created_at)
      VALUES (?, 15000, 'CASH', 'VOUCHER-01', ?, '2026-11-16 10:00:00')
    `).run(supInfo.lastInsertRowid, today);

    // 2. Customer Credit Debt Collection
    const custInfo = db.prepare("INSERT INTO credit_customers (name, phone, total_outstanding) VALUES ('Kamal', '077', 10000)").run();
    db.prepare(`
      INSERT INTO credit_payments (customer_id, amount, payment_type, notes, created_at)
      VALUES (?, 5000, 'PAYMENT', 'Cash debt settlement', '2026-11-16 11:30:00')
    `).run(custInfo.lastInsertRowid);

    // 3. POS Cash Sale
    db.prepare(`
      INSERT INTO sales (receipt_no, total_amount, total_cost, gross_profit, payment_type, created_at)
      VALUES ('REC-01', 3000, 2000, 1000, 'CASH', '2026-11-16 12:00:00')
    `).run();

    // 4. Verify Cashbook queries pull both automated flows
    const supplierCash = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total_supplier_cash
      FROM supplier_payments
      WHERE payment_method = 'CASH' AND payment_date = ?
    `).get(today) as any;
    expect(supplierCash.total_supplier_cash).toBe(15000);

    const customerCash = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total_customer_cash
      FROM credit_payments
      WHERE payment_type = 'PAYMENT' AND created_at >= '2026-11-16 00:00:00' AND created_at < '2026-11-17 00:00:00'
    `).get() as any;
    expect(customerCash.total_customer_cash).toBe(5000);

    const posCash = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) AS total_pos_cash
      FROM sales
      WHERE payment_type = 'CASH' AND created_at >= '2026-11-16 00:00:00' AND created_at < '2026-11-17 00:00:00'
    `).get() as any;
    expect(posCash.total_pos_cash).toBe(3000);

    // Total In: 3000 (POS) + 5000 (Customer Debt Collected) = 8000
    // Total Out: 15000 (Supplier Cash Payment) = 15000
    // Net Flow: 8000 - 15000 = -7000
    const totalCashIn = posCash.total_pos_cash + customerCash.total_customer_cash;
    const totalCashOut = supplierCash.total_supplier_cash;
    const netCashFlow = totalCashIn - totalCashOut;

    expect(totalCashIn).toBe(8000);
    expect(totalCashOut).toBe(15000);
    expect(netCashFlow).toBe(-7000);
  });
});
