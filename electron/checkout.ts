import type Database from 'better-sqlite3';
import { calculateCartTotals } from '../src/utils/checkout';
import { localDateString } from '../src/utils/dates';
import { reconcileStock } from './stock';

// ─── FIFO batch deduction helper ─────────────────────────────────────────────
/**
 * Deducts `qty` units from stock_batches for a product using FIFO order.
 * Only the selected shelf-price tier is consumed. Receipt date determines
 * FIFO order within that tier; ID breaks ties on the same day.
 * Returns the weighted average cost actually consumed (for profit calculation).
 * Opening stock is added to the ledger before this function is called.
 */
export function deductFifoBatches(
  db: Database.Database,
  productId: number,
  qty: number,
  sellingPrice: number,
): number {
  type Batch = { id: number; remaining_qty: number; unit_cost: number; selling_price: number };
  const batches = db
    .prepare(`
      SELECT id, remaining_qty, unit_cost, selling_price
      FROM stock_batches
      WHERE product_id = ? AND selling_price = ? AND remaining_qty > 0
      ORDER BY received_date ASC, id ASC
    `)
    .all(productId, sellingPrice) as Batch[];
  if (batches.reduce((sum, batch) => sum + batch.remaining_qty, 0) < qty) {
    throw new Error(`Insufficient stock at the selected price (Rs. ${sellingPrice.toFixed(2)}). Refresh the item and try again.`);
  }

  let remaining = qty;
  let totalCostConsumed = 0;
  const updateBatch = db.prepare(
    'UPDATE stock_batches SET remaining_qty = remaining_qty - ? WHERE id = ?',
  );

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.remaining_qty, remaining);
    updateBatch.run(take, batch.id);
    totalCostConsumed += take * batch.unit_cost;
    remaining -= take;
  }

  return totalCostConsumed / qty;
}

export function executeCheckout(db: Database.Database, params: {
  requestId: string; paymentType: string;
  items: Array<{ id?: number; barcode: string; category?: string; title: string; quantity: number; cost_price: number; selling_price: number; discount_percent?: number; original_price?: number }>;
  billDiscount?: number;
  customerId?: number;
}) {
  if (typeof params.requestId !== 'string' || !params.requestId.trim() || params.requestId.length > 128) throw new Error('Missing checkout request ID');
  return db.transaction(() => {
    const existing = db.prepare('SELECT id AS saleId, receipt_no AS receiptNo, total_amount AS totalAmount, COALESCE(bill_discount, 0) AS billDiscount FROM sales WHERE checkout_request_id = ?').get(params.requestId);
    if (existing) return existing as { saleId: number; receiptNo: string; totalAmount: number; billDiscount: number };
    if (!['CASH', 'CARD', 'CREDIT'].includes(params.paymentType) || !Array.isArray(params.items) || !params.items.length) throw new Error('Invalid checkout');
    for (const item of params.items) {
      if (!item.title?.trim() || !Number.isInteger(item.quantity) || item.quantity <= 0 ||
          !Number.isFinite(item.selling_price) || item.selling_price < 0 || !Number.isFinite(item.cost_price) || item.cost_price < 0 ||
          (item.original_price !== undefined && (!Number.isFinite(item.original_price) || item.original_price < 0)) ||
          (item.discount_percent !== undefined && (!Number.isFinite(item.discount_percent) || item.discount_percent < 0 || item.discount_percent > 100))) throw new Error('Invalid checkout item');
    }
    const totals = calculateCartTotals(params.items);
    const rawDiscount = Number(params.billDiscount);
    const billDiscount = Number.isFinite(rawDiscount) && rawDiscount > 0
      ? Math.min(totals.totalAmount, Math.round(rawDiscount * 100) / 100)
      : 0;

    const now = new Date();
    const prefix = 'REC-' + localDateString(now).replaceAll('-', '') + '-';
    const sequence = db.prepare('SELECT COALESCE(MAX(CAST(SUBSTR(receipt_no, ?) AS INTEGER)), 0) AS n FROM sales WHERE receipt_no LIKE ?').get(prefix.length + 1, prefix + '%') as { n: number };
    const receiptNo = prefix + String(sequence.n + 1).padStart(3, '0');

    // ── Pass 1: resolve products & deduct stock batches (FIFO) ───────────────
    // We need actual batch costs before we can compute totals with correct profit
    const resolvedItems: Array<{
      product: { id: number; category: string; barcode: string };
      item: typeof params.items[number];
      actualCost: number;    // FIFO-weighted cost per unit
    }> = [];

    for (const item of params.items) {
      type Product = { id: number; category: string; barcode: string };
      let product = (item.id != null ? db.prepare('SELECT id, category, barcode FROM inventory WHERE id = ?').get(item.id) : undefined) as Product | undefined;
      if (!product && item.barcode) product = db.prepare('SELECT id, category, barcode FROM inventory WHERE barcode = ?').get(item.barcode) as Product | undefined;
      if (!product) {
        if (!item.barcode?.startsWith('SRV-')) throw new Error('Product no longer exists: ' + item.title);
        const inserted = db.prepare("INSERT INTO inventory (barcode, title, category, cost_price, selling_price, quantity, reorder_level) VALUES (?, ?, 'SERVICE', ?, ?, 999999, 0)")
          .run(item.barcode, item.title, item.cost_price, item.selling_price);
        product = { id: Number(inserted.lastInsertRowid), category: 'SERVICE', barcode: item.barcode };
      }
      const isService = product.category === 'SERVICE' || product.barcode?.startsWith('SRV-');

      let actualCost = item.cost_price; // default: cost as sent by POS

      if (!isService) {
        reconcileStock(db, product.id);
        const updated = db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ? AND quantity >= ?').run(item.quantity, product.id, item.quantity);
        if (updated.changes !== 1) throw new Error('Insufficient stock: ' + item.title);
        // FIFO deduction — returns weighted avg cost consumed
        actualCost = deductFifoBatches(db, product.id, item.quantity, item.original_price ?? item.selling_price);
      }

      resolvedItems.push({ product, item, actualCost });
    }

    // ── Pass 2: compute totals using FIFO-adjusted costs ─────────────────────
    let totalAmount = 0;
    let totalCost   = 0;
    for (const { item, actualCost } of resolvedItems) {
      const qty = item.quantity;
      totalAmount += item.selling_price * qty;
      totalCost   += actualCost * qty;
    }
    totalAmount = Math.round(totalAmount * 100) / 100;
    totalCost   = Math.round(totalCost * 100) / 100;
    const finalTotalAmount   = Math.max(0, Math.round((totalAmount - billDiscount) * 100) / 100);
    const finalGrossProfit   = Math.round((finalTotalAmount - totalCost) * 100) / 100;

    const sale = db.prepare('INSERT INTO sales (receipt_no, total_amount, total_cost, gross_profit, payment_type, created_at, checkout_request_id, bill_discount, customer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(receiptNo, finalTotalAmount, totalCost, finalGrossProfit, params.paymentType, now.toISOString(), params.requestId, billDiscount, params.customerId ?? null);
    const saleId = Number(sale.lastInsertRowid);

    for (const { product, item, actualCost } of resolvedItems) {
      db.prepare('INSERT INTO sale_items (sale_id, product_id, quantity, unit_cost, unit_price, discount_percent, original_price, title, barcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(saleId, product.id, item.quantity, actualCost, item.selling_price, item.discount_percent ?? 0, item.original_price ?? item.selling_price, item.title, item.barcode);
    }

    // ── Credit sale: record outstanding balance ───────────────────────────────
    if (params.paymentType === 'CREDIT' && params.customerId != null) {
      db.prepare('INSERT INTO credit_payments (customer_id, sale_id, amount, payment_type, notes) VALUES (?, ?, ?, ?, ?)')
        .run(params.customerId, saleId, finalTotalAmount, 'SALE', `Sale ${receiptNo}`);
      db.prepare('UPDATE credit_customers SET total_outstanding = total_outstanding + ? WHERE id = ?')
        .run(finalTotalAmount, params.customerId);
    }

    return { saleId, receiptNo, totalAmount: finalTotalAmount, billDiscount };
  })();
}

export function deleteSale(db: Database.Database, saleId: number) {
  return db.transaction(() => {
    const sale = db.prepare('SELECT id, receipt_no FROM sales WHERE id = ?').get(saleId) as any;
    if (!sale) throw new Error('Invoice not found');

    const items = db.prepare('SELECT product_id, quantity, unit_cost, original_price FROM sale_items WHERE sale_id = ?').all(saleId) as any[];

    for (const item of items) {
      if (!item.product_id) continue;
      const prod = db.prepare('SELECT category, barcode FROM inventory WHERE id = ?').get(item.product_id) as any;
      const isService = prod && (prod.category === 'SERVICE' || prod.barcode?.startsWith('SRV-'));
      if (!isService) {
        db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').run(item.quantity, item.product_id);
        const batch = db.prepare('SELECT id FROM stock_batches WHERE product_id = ? AND selling_price = ? ORDER BY id DESC LIMIT 1')
          .get(item.product_id, item.original_price) as { id: number } | undefined;
        if (batch) {
          db.prepare('UPDATE stock_batches SET remaining_qty = remaining_qty + ? WHERE id = ?').run(item.quantity, batch.id);
        } else {
          db.prepare("INSERT INTO stock_batches (product_id, received_date, initial_qty, remaining_qty, unit_cost, selling_price) VALUES (?, '0001-01-01', ?, ?, ?, ?)")
            .run(item.product_id, item.quantity, item.quantity, item.unit_cost, item.original_price);
        }
        reconcileStock(db, item.product_id);
      }
    }

    db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(saleId);
    db.prepare('DELETE FROM sales WHERE id = ?').run(saleId);
    return { success: true };
  })();
}

export function updateSale(db: Database.Database, params: {
  id: number;
  payment_type: string;
  bill_discount?: number;
  items: Array<{
    id?: number;
    product_id: number;
    quantity: number;
    unit_price: number;
    discount_percent?: number;
    original_price?: number;
    title: string;
    barcode: string;
  }>;
}) {
  return db.transaction(() => {
    const saleId = params.id;
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as any;
    if (!sale) throw new Error('Invoice not found');

    // 1. Revert previous stock deductions for old items
    const oldItems = db.prepare('SELECT product_id, quantity, unit_cost, original_price FROM sale_items WHERE sale_id = ?').all(saleId) as any[];
    for (const oldItem of oldItems) {
      if (!oldItem.product_id) continue;
      const prod = db.prepare('SELECT category, barcode FROM inventory WHERE id = ?').get(oldItem.product_id) as any;
      const isService = prod && (prod.category === 'SERVICE' || prod.barcode?.startsWith('SRV-'));
      if (!isService) {
        db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').run(oldItem.quantity, oldItem.product_id);
        const batch = db.prepare('SELECT id FROM stock_batches WHERE product_id = ? AND selling_price = ? ORDER BY id DESC LIMIT 1')
          .get(oldItem.product_id, oldItem.original_price) as { id: number } | undefined;
        if (batch) {
          db.prepare('UPDATE stock_batches SET remaining_qty = remaining_qty + ? WHERE id = ?').run(oldItem.quantity, batch.id);
        } else {
          db.prepare("INSERT INTO stock_batches (product_id, received_date, initial_qty, remaining_qty, unit_cost, selling_price) VALUES (?, '0001-01-01', ?, ?, ?, ?)")
            .run(oldItem.product_id, oldItem.quantity, oldItem.quantity, oldItem.unit_cost, oldItem.original_price);
        }
        reconcileStock(db, oldItem.product_id);
      }
    }

    // 2. Remove old sale items
    db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(saleId);

    // 3. Process new items and deduct stock
    if (!Array.isArray(params.items) || params.items.length === 0) {
      throw new Error('Invoice must contain at least one item');
    }

    let totalAmount = 0;
    let totalCost = 0;

    for (const item of params.items) {
      if (!item.title?.trim() || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error('Invalid item quantity for ' + (item.title || 'item'));
      }
      const prod = db.prepare('SELECT id, category, barcode, cost_price, selling_price FROM inventory WHERE id = ?').get(item.product_id) as any;
      const isService = prod && (prod.category === 'SERVICE' || prod.barcode?.startsWith('SRV-'));

      let actualCost = prod ? prod.cost_price : 0;

      if (!isService && prod) {
        reconcileStock(db, prod.id);
        const updated = db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ? AND quantity >= ?')
          .run(item.quantity, prod.id, item.quantity);
        if (updated.changes !== 1) throw new Error('Insufficient stock for ' + item.title);
        actualCost = deductFifoBatches(db, prod.id, item.quantity, item.original_price ?? item.unit_price);
      }

      const lineTotal = item.unit_price * item.quantity;
      totalAmount += lineTotal;
      totalCost += actualCost * item.quantity;

      db.prepare(`
        INSERT INTO sale_items (sale_id, product_id, quantity, unit_cost, unit_price, discount_percent, original_price, title, barcode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        saleId,
        item.product_id,
        item.quantity,
        actualCost,
        item.unit_price,
        item.discount_percent ?? 0,
        item.original_price ?? item.unit_price,
        item.title,
        item.barcode
      );
    }

    totalAmount = Math.round(totalAmount * 100) / 100;
    totalCost = Math.round(totalCost * 100) / 100;
    const rawDiscount = Number(params.bill_discount);
    const billDiscount = Number.isFinite(rawDiscount) && rawDiscount > 0
      ? Math.min(totalAmount, Math.round(rawDiscount * 100) / 100)
      : 0;
    const finalTotalAmount = Math.max(0, Math.round((totalAmount - billDiscount) * 100) / 100);
    const finalGrossProfit = Math.round((finalTotalAmount - totalCost) * 100) / 100;

    db.prepare(`
      UPDATE sales SET
        total_amount = ?,
        total_cost = ?,
        gross_profit = ?,
        payment_type = ?,
        bill_discount = ?
      WHERE id = ?
    `).run(
      finalTotalAmount,
      totalCost,
      finalGrossProfit,
      ['CASH', 'CARD'].includes(params.payment_type) ? params.payment_type : 'CASH',
      billDiscount,
      saleId
    );

    return { success: true };
  })();
}
