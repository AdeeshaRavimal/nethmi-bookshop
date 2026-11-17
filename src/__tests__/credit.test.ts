import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initPragmasAndSchema } from '../../electron/database';
import { executeCheckout, updateSale, deleteSale } from '../../electron/checkout';

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

  it('earns loyalty points on purchases and allows redeeming points', () => {
    // 1. Create customer with 0 initial points
    const custRes = db.prepare(`
      INSERT INTO credit_customers (name, phone, loyalty_points)
      VALUES (?, ?, 0)
    `).run('Loyal Customer', '0779998877');
    const customerId = Number(custRes.lastInsertRowid);

    // 2. Buy Rs. 500 worth of items -> earns floor(500/100) = 5 points
    const res1 = executeCheckout(db, {
      requestId: 'req-loyalty-1',
      paymentType: 'CASH',
      customerId,
      items: [{ id: 1, barcode: 'BK-001', title: 'CR Book 120 Pages', quantity: 2, cost_price: 150, selling_price: 250 }],
    });
    expect(res1.totalAmount).toBe(500);

    let customer = db.prepare('SELECT loyalty_points FROM credit_customers WHERE id = ?').get(customerId) as any;
    expect(customer.loyalty_points).toBe(5);

    // 3. Buy 1 item (Rs. 250) and redeem 3 points -> Rs. 3 discount
    const res2 = executeCheckout(db, {
      requestId: 'req-loyalty-2',
      paymentType: 'CASH',
      customerId,
      pointsToRedeem: 3,
      items: [{ id: 1, barcode: 'BK-001', title: 'CR Book 120 Pages', quantity: 1, cost_price: 150, selling_price: 250 }],
    });
    expect(res2.totalAmount).toBe(247); // 250 - 3 points discount

    // Remaining points: 5 - 3 + floor(247/100) = 2 + 2 = 4 points
    customer = db.prepare('SELECT loyalty_points FROM credit_customers WHERE id = ?').get(customerId) as any;
    expect(customer.loyalty_points).toBe(4);
  });

  it('editing a credit bill keeps payment_type as CREDIT and adjusts customer balance', () => {
    // 1. Create customer
    const custRes = db.prepare(`
      INSERT INTO credit_customers (name, phone, credit_limit)
      VALUES (?, ?, ?)
    `).run('Nalaka Silva', '0778899001', 10000);
    const customerId = Number(custRes.lastInsertRowid);

    // 2. Buy 2 items @ Rs. 250 on CREDIT -> Rs. 500
    const sale = executeCheckout(db, {
      requestId: 'req-edit-credit-1',
      paymentType: 'CREDIT',
      customerId,
      items: [{ id: 1, barcode: 'BK-001', title: 'CR Book 120 Pages', quantity: 2, cost_price: 150, selling_price: 250 }],
    });

    let cust = db.prepare('SELECT total_outstanding FROM credit_customers WHERE id = ?').get(customerId) as any;
    expect(cust.total_outstanding).toBe(500);

    // 3. Edit invoice: change quantity to 3 @ Rs. 250 -> Rs. 750 (payment_type: 'CREDIT')
    const updateRes = updateSale(db, {
      id: sale.saleId,
      payment_type: 'CREDIT',
      customer_id: customerId,
      items: [{ product_id: 1, barcode: 'BK-001', title: 'CR Book 120 Pages', quantity: 3, unit_price: 250, original_price: 250 }],
    });
    expect(updateRes.success).toBe(true);

    // Verify invoice remains CREDIT
    const updatedSale = db.prepare('SELECT payment_type, total_amount FROM sales WHERE id = ?').get(sale.saleId) as any;
    expect(updatedSale.payment_type).toBe('CREDIT');
    expect(updatedSale.total_amount).toBe(750);

    // Verify customer outstanding updated to 750
    cust = db.prepare('SELECT total_outstanding FROM credit_customers WHERE id = ?').get(customerId) as any;
    expect(cust.total_outstanding).toBe(750);

    // Verify credit_payments entry updated
    const payment = db.prepare("SELECT amount FROM credit_payments WHERE sale_id = ? AND payment_type = 'SALE'").get(sale.saleId) as any;
    expect(payment.amount).toBe(750);
  });

  it('editing a credit bill to CASH removes customer outstanding credit', () => {
    // 1. Create customer
    const custRes = db.prepare(`
      INSERT INTO credit_customers (name, phone, credit_limit)
      VALUES (?, ?, ?)
    `).run('Chathura Dias', '0712233445', 10000);
    const customerId = Number(custRes.lastInsertRowid);

    // 2. Buy 2 items @ Rs. 250 on CREDIT -> Rs. 500
    const sale = executeCheckout(db, {
      requestId: 'req-switch-credit-cash-1',
      paymentType: 'CREDIT',
      customerId,
      items: [{ id: 1, barcode: 'BK-001', title: 'CR Book 120 Pages', quantity: 2, cost_price: 150, selling_price: 250 }],
    });

    let cust = db.prepare('SELECT total_outstanding FROM credit_customers WHERE id = ?').get(customerId) as any;
    expect(cust.total_outstanding).toBe(500);

    // 3. Edit bill and switch payment to CASH
    const updateRes = updateSale(db, {
      id: sale.saleId,
      payment_type: 'CASH',
      customer_id: customerId,
      items: [{ product_id: 1, barcode: 'BK-001', title: 'CR Book 120 Pages', quantity: 2, unit_price: 250, original_price: 250 }],
    });
    expect(updateRes.success).toBe(true);

    const updatedSale = db.prepare('SELECT payment_type, total_amount FROM sales WHERE id = ?').get(sale.saleId) as any;
    expect(updatedSale.payment_type).toBe('CASH');

    // Customer balance should be 0 now
    cust = db.prepare('SELECT total_outstanding FROM credit_customers WHERE id = ?').get(customerId) as any;
    expect(cust.total_outstanding).toBe(0);

    // Payment entry should be removed
    const payment = db.prepare("SELECT id FROM credit_payments WHERE sale_id = ? AND payment_type = 'SALE'").get(sale.saleId);
    expect(payment).toBeUndefined();
  });

  it('deleting a credit bill restores stock and clears customer outstanding credit', () => {
    const custRes = db.prepare(`
      INSERT INTO credit_customers (name, phone, credit_limit)
      VALUES (?, ?, ?)
    `).run('Mahesh Perera', '0761122334', 10000);
    const customerId = Number(custRes.lastInsertRowid);

    const sale = executeCheckout(db, {
      requestId: 'req-delete-credit-1',
      paymentType: 'CREDIT',
      customerId,
      items: [{ id: 1, barcode: 'BK-001', title: 'CR Book 120 Pages', quantity: 2, cost_price: 150, selling_price: 250 }],
    });

    let cust = db.prepare('SELECT total_outstanding FROM credit_customers WHERE id = ?').get(customerId) as any;
    expect(cust.total_outstanding).toBe(500);
    expect(db.prepare('SELECT quantity FROM inventory WHERE id = 1').get()).toEqual({ quantity: 48 });

    // Delete the credit sale
    const delRes = deleteSale(db, sale.saleId);
    expect(delRes.success).toBe(true);

    // Stock restored to 50
    expect(db.prepare('SELECT quantity FROM inventory WHERE id = 1').get()).toEqual({ quantity: 50 });

    // Customer debt cleared
    cust = db.prepare('SELECT total_outstanding FROM credit_customers WHERE id = ?').get(customerId) as any;
    expect(cust.total_outstanding).toBe(0);

    // Payment record removed
    expect(db.prepare("SELECT id FROM credit_payments WHERE sale_id = ?").get(sale.saleId)).toBeUndefined();
  });
});
