import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initPragmasAndSchema } from '../../electron/database';
import { executeCheckout } from '../../electron/checkout';

describe('Credit Customer & Billing System', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initPragmasAndSchema(db);

    // Seed sample product
    db.prepare(`
      INSERT INTO inventory (id, barcode, title, category, cost_price, selling_price, quantity)
      VALUES (1, 'BK-001', 'CR Book 120 Pages', 'BOOK', 150, 250, 50)
    `).run();

    db.prepare(`
      INSERT INTO stock_batches (product_id, received_date, initial_qty, remaining_qty, unit_cost, selling_price)
      VALUES (1, '2026-11-15', 50, 50, 150, 250)
    `).run();
  });

  it('creates and retrieves a credit customer', () => {
    const res = db.prepare(`
      INSERT INTO credit_customers (name, phone, address, credit_limit, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run('Nimal Perera', '0771234567', 'Avissawella', 5000, 'Regular customer');

    const customerId = Number(res.lastInsertRowid);
    expect(customerId).toBeGreaterThan(0);

    const customer = db.prepare('SELECT * FROM credit_customers WHERE id = ?').get(customerId) as any;
    expect(customer.name).toBe('Nimal Perera');
    expect(customer.credit_limit).toBe(5000);
    expect(customer.total_outstanding).toBe(0);
  });

  it('executes a credit checkout and updates customer outstanding balance', () => {
    // 1. Create customer
    const custRes = db.prepare(`
      INSERT INTO credit_customers (name, phone, credit_limit)
      VALUES (?, ?, ?)
    `).run('Sunil Fernando', '0719876543', 10000);
    const customerId = Number(custRes.lastInsertRowid);

    // 2. Perform credit checkout for 2 items @ Rs. 250 each = Rs. 500
    const checkoutResult = executeCheckout(db, {
      requestId: 'req-credit-test-1',
      paymentType: 'CREDIT',
      customerId,
      items: [
        {
          id: 1,
          barcode: 'BK-001',
          title: 'CR Book 120 Pages',
          quantity: 2,
          cost_price: 150,
          selling_price: 250,
        },
      ],
    });

    expect(checkoutResult.saleId).toBeDefined();
    expect(checkoutResult.totalAmount).toBe(500);

    // 3. Verify customer outstanding balance updated
    const customer = db.prepare('SELECT total_outstanding FROM credit_customers WHERE id = ?').get(customerId) as any;
    expect(customer.total_outstanding).toBe(500);

    // 4. Verify credit payment record was inserted
    const payment = db.prepare('SELECT * FROM credit_payments WHERE customer_id = ?').get(customerId) as any;
    expect(payment.amount).toBe(500);
    expect(payment.payment_type).toBe('SALE');
    expect(payment.sale_id).toBe(checkoutResult.saleId);

    // 5. Verify stock was deducted
    const inv = db.prepare('SELECT quantity FROM inventory WHERE id = 1').get() as any;
    expect(inv.quantity).toBe(48);
  });

  it('records customer payment and reduces outstanding debt', () => {
    // 1. Create customer with 2000 initial debt
    const custRes = db.prepare(`
      INSERT INTO credit_customers (name, phone, total_outstanding)
      VALUES (?, ?, ?)
    `).run('Kamal Sirisena', '0751122334', 2000);
    const customerId = Number(custRes.lastInsertRowid);

    // 2. Customer pays 1500
    const paymentAmount = 1500;
    db.prepare(`
      INSERT INTO credit_payments (customer_id, amount, payment_type, notes)
      VALUES (?, ?, 'PAYMENT', 'Cash settlement')
    `).run(customerId, paymentAmount);

    db.prepare(`
      UPDATE credit_customers SET total_outstanding = total_outstanding - ? WHERE id = ?
    `).run(paymentAmount, customerId);

    // 3. Check remaining balance is 500
    const customer = db.prepare('SELECT total_outstanding FROM credit_customers WHERE id = ?').get(customerId) as any;
    expect(customer.total_outstanding).toBe(500);
  });
});
