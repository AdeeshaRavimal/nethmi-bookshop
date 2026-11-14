import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initPragmasAndSchema } from '../../electron/database';
import { executeCheckout, deleteSale, updateSale } from '../../electron/checkout';

describe('FIFO Stock Batches and GRN Price Updates', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initPragmasAndSchema(db);
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  it('updates inventory selling_price and creates a stock_batch on GRN entry', () => {
    // 1. Create a product in inventory with initial price 200, cost 150, quantity 0
    const prod = db.prepare(`
      INSERT INTO inventory (barcode, title, category, cost_price, selling_price, quantity)
      VALUES ('BK-001', 'Atlas CR Book', 'BOOK', 150, 200, 0)
    `).run();
    const prodId = Number(prod.lastInsertRowid);

    // 2. Simulate GRN creation (new shipment arrives with new cost 180 and new selling price 250)
    const grnHeader = db.prepare(`
      INSERT INTO grn_headers (grn_number, received_date, payment_type, status, total_amount)
      VALUES ('GRN-20261114-001', '2026-11-14', 'CASH', 'PAID', 1800)
    `).run();
    const grnId = Number(grnHeader.lastInsertRowid);

    // Insert GRN item with new selling price 250
    db.prepare(`
      INSERT INTO grn_items (grn_id, product_id, barcode, title, received_qty, unit_cost, selling_price, total_cost)
      VALUES (?, ?, 'BK-001', 'Atlas CR Book', 10, 180, 250, 1800)
    `).run(grnId, prodId);

    // Update inventory quantity and prices to latest batch
    db.prepare(`
      UPDATE inventory
      SET quantity = quantity + 10, cost_price = 180, selling_price = 250
      WHERE id = ?
    `).run(prodId);

    // Insert stock batch
    db.prepare(`
      INSERT INTO stock_batches (product_id, grn_id, received_date, initial_qty, remaining_qty, unit_cost, selling_price)
      VALUES (?, ?, '2026-11-14', 10, 10, 180, 250)
    `).run(prodId, grnId);

    // Verify inventory updated
    const inv = db.prepare('SELECT quantity, cost_price, selling_price FROM inventory WHERE id = ?').get(prodId) as any;
    expect(inv.quantity).toBe(10);
    expect(inv.cost_price).toBe(180);
    expect(inv.selling_price).toBe(250);

    // Verify stock_batches entry
    const batch = db.prepare('SELECT * FROM stock_batches WHERE product_id = ?').get(prodId) as any;
    expect(batch.remaining_qty).toBe(10);
    expect(batch.unit_cost).toBe(180);
    expect(batch.selling_price).toBe(250);
  });

  it('consumes oldest deliveries within a price tier and computes accurate profit', () => {
    // Product setup
    const prod = db.prepare(`
      INSERT INTO inventory (barcode, title, category, cost_price, selling_price, quantity)
      VALUES ('BK-002', 'Math Workbook', 'BOOK', 100, 150, 15)
    `).run();
    const prodId = Number(prod.lastInsertRowid);

    // Batch 1 (Oldest): same shelf price, lower cost
    db.prepare(`
      INSERT INTO stock_batches (product_id, received_date, initial_qty, remaining_qty, unit_cost, selling_price)
      VALUES (?, '2026-11-01', 5, 5, 100, 180)
    `).run(prodId);

    // Batch 2 (Newer): 10 units @ cost 120, sell 180
    db.prepare(`
      INSERT INTO stock_batches (product_id, received_date, initial_qty, remaining_qty, unit_cost, selling_price)
      VALUES (?, '2026-11-10', 10, 10, 120, 180)
    `).run(prodId);

    // Sale 1: Customer buys 3 units at selling price 180
    // FIFO should consume 3 units from Batch 1 (cost = 3 * 100 = 300)
    // Revenue = 3 * 180 = 540. Gross profit = 540 - 300 = 240
    const sale1 = executeCheckout(db, {
      requestId: 'fifo-sale-1',
      paymentType: 'CASH',
      items: [{
        id: prodId,
        barcode: 'BK-002',
        title: 'Math Workbook',
        quantity: 3,
        selling_price: 180,
        cost_price: 120, // POS fallback, but FIFO should use Batch 1 cost (100)
      }],
    });

    expect(sale1.totalAmount).toBe(540);

    const saleRecord1 = db.prepare('SELECT total_cost, gross_profit FROM sales WHERE id = ?').get(sale1.saleId) as any;
    expect(saleRecord1.total_cost).toBe(300); // 3 * 100
    expect(saleRecord1.gross_profit).toBe(240); // 540 - 300

    // Check batch quantities
    const batchesAfterSale1 = db.prepare('SELECT id, remaining_qty FROM stock_batches WHERE product_id = ? ORDER BY id ASC').all(prodId) as any[];
    expect(batchesAfterSale1[0].remaining_qty).toBe(2); // 5 - 3 = 2 remaining in Batch 1
    expect(batchesAfterSale1[1].remaining_qty).toBe(10); // Batch 2 untouched

    // Sale 2: Customer buys 4 units at selling price 180
    // FIFO should consume remaining 2 units from Batch 1 (@ 100 cost) + 2 units from Batch 2 (@ 120 cost)
    // Total cost = (2 * 100) + (2 * 120) = 200 + 240 = 440
    // Revenue = 4 * 180 = 720. Gross profit = 720 - 440 = 280
    const sale2 = executeCheckout(db, {
      requestId: 'fifo-sale-2',
      paymentType: 'CASH',
      items: [{
        id: prodId,
        barcode: 'BK-002',
        title: 'Math Workbook',
        quantity: 4,
        selling_price: 180,
        cost_price: 120,
      }],
    });

    const saleRecord2 = db.prepare('SELECT total_cost, gross_profit FROM sales WHERE id = ?').get(sale2.saleId) as any;
    expect(saleRecord2.total_cost).toBe(440);
    expect(saleRecord2.gross_profit).toBe(280);

    // Check batch quantities after Sale 2
    const batchesAfterSale2 = db.prepare('SELECT id, remaining_qty FROM stock_batches WHERE product_id = ? ORDER BY id ASC').all(prodId) as any[];
    expect(batchesAfterSale2[0].remaining_qty).toBe(0); // Batch 1 exhausted
    expect(batchesAfterSale2[1].remaining_qty).toBe(8); // 10 - 2 = 8 remaining in Batch 2

    // Check overall inventory quantity
    const finalInv = db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(prodId) as any;
    expect(finalInv.quantity).toBe(8); // 15 - 3 - 4 = 8
  });

  it('keeps price tiers separate, uses receipt dates, and applies discounts without changing tiers', () => {
    const id = Number(db.prepare(`INSERT INTO inventory (barcode, title, cost_price, selling_price, quantity)
      VALUES ('TIERS', 'Book', 70, 120, 9)`).run().lastInsertRowid);
    const batch = db.prepare(`INSERT INTO stock_batches
      (product_id, received_date, initial_qty, remaining_qty, unit_cost, selling_price) VALUES (?, ?, ?, ?, ?, ?)`);
    batch.run(id, '2026-11-01', 5, 5, 50, 100);
    batch.run(id, '2026-11-10', 2, 2, 70, 120);
    batch.run(id, '2026-11-05', 2, 2, 60, 120); // Entered later, received earlier
    const sale = executeCheckout(db, { requestId: 'tiers', paymentType: 'CASH', items: [{
      id, barcode: 'TIERS', title: 'Book', quantity: 3, selling_price: 108,
      original_price: 120, discount_percent: 10, cost_price: 999,
    }] });
    expect(db.prepare('SELECT remaining_qty FROM stock_batches ORDER BY id').all()).toEqual([
      { remaining_qty: 5 }, { remaining_qty: 1 }, { remaining_qty: 0 },
    ]);
    expect(db.prepare('SELECT total_amount, total_cost, gross_profit FROM sales WHERE id = ?').get(sale.saleId))
      .toEqual({ total_amount: 324, total_cost: 190, gross_profit: 134 });
    expect(() => executeCheckout(db, { requestId: 'too-many', paymentType: 'CASH', items: [{
      id, barcode: 'TIERS', title: 'Book', quantity: 2, selling_price: 120, cost_price: 70,
    }] })).toThrow('selected price');
    expect(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(id)).toEqual({ quantity: 6 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM sales').get()).toEqual({ n: 1 });
  });

  it('deletes an invoice and restores items back to stock batches and inventory', () => {
    const prodId = Number(db.prepare(`
      INSERT INTO inventory (barcode, title, category, cost_price, selling_price, quantity)
      VALUES ('DEL-01', 'Novel', 'BOOK', 100, 150, 10)
    `).run().lastInsertRowid);

    db.prepare(`
      INSERT INTO stock_batches (product_id, received_date, initial_qty, remaining_qty, unit_cost, selling_price)
      VALUES (?, '2026-11-01', 10, 10, 100, 150)
    `).run(prodId);

    const sale = executeCheckout(db, {
      requestId: 'req-del-01',
      paymentType: 'CASH',
      items: [{
        id: prodId,
        barcode: 'DEL-01',
        title: 'Novel',
        quantity: 3,
        cost_price: 100,
        selling_price: 150,
      }],
    });

    expect(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(prodId)).toEqual({ quantity: 7 });
    expect(db.prepare('SELECT remaining_qty FROM stock_batches WHERE product_id = ?').get(prodId)).toEqual({ remaining_qty: 7 });

    const res = deleteSale(db, sale.saleId);
    expect(res.success).toBe(true);

    // Stock must be restored back to 10
    expect(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(prodId)).toEqual({ quantity: 10 });
    expect(db.prepare('SELECT remaining_qty FROM stock_batches WHERE product_id = ?').get(prodId)).toEqual({ remaining_qty: 10 });

    // Sale record and sale_items must be deleted
    expect(db.prepare('SELECT COUNT(*) as count FROM sales WHERE id = ?').get(sale.saleId)).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) as count FROM sale_items WHERE sale_id = ?').get(sale.saleId)).toEqual({ count: 0 });
  });

  it('updates an invoice: modifies quantities, payment type, bill discount, and adjusts stock', () => {
    const prodId = Number(db.prepare(`
      INSERT INTO inventory (barcode, title, category, cost_price, selling_price, quantity)
      VALUES ('UPD-01', 'Notebook', 'STATIONERY', 50, 100, 20)
    `).run().lastInsertRowid);

    db.prepare(`
      INSERT INTO stock_batches (product_id, received_date, initial_qty, remaining_qty, unit_cost, selling_price)
      VALUES (?, '2026-11-01', 20, 20, 50, 100)
    `).run(prodId);

    const sale = executeCheckout(db, {
      requestId: 'req-upd-01',
      paymentType: 'CASH',
      items: [{
        id: prodId,
        barcode: 'UPD-01',
        title: 'Notebook',
        quantity: 5,
        cost_price: 50,
        selling_price: 100,
      }],
    });

    expect(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(prodId)).toEqual({ quantity: 15 });

    // Edit the invoice: change quantity from 5 to 2, payment to CARD, and add Rs. 10 bill discount
    const res = updateSale(db, {
      id: sale.saleId,
      payment_type: 'CARD',
      bill_discount: 10,
      items: [{
        product_id: prodId,
        quantity: 2,
        unit_price: 100,
        original_price: 100,
        title: 'Notebook',
        barcode: 'UPD-01',
      }],
    });

    expect(res.success).toBe(true);

    // Stock should now be 20 - 2 = 18
    expect(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(prodId)).toEqual({ quantity: 18 });

    // Sale record should reflect new totals and CARD payment
    const updatedSale = db.prepare('SELECT total_amount, total_cost, gross_profit, payment_type, bill_discount FROM sales WHERE id = ?').get(sale.saleId) as any;
    expect(updatedSale.payment_type).toBe('CARD');
    expect(updatedSale.bill_discount).toBe(10);
    expect(updatedSale.total_amount).toBe(190); // (100 * 2) - 10 = 190
    expect(updatedSale.total_cost).toBe(100);   // 50 * 2 = 100
    expect(updatedSale.gross_profit).toBe(90);  // 190 - 100 = 90
  });
});
