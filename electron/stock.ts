import type Database from 'better-sqlite3';

/** Bring manually entered/imported stock into the batch ledger.
 * Existing stock without receipt history is opening stock, before dated GRNs.
 * Call inside the transaction that changes inventory or consumes stock.
 */
export function reconcileStock(db: Database.Database, productId: number) {
  const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(productId) as any;
  if (!item || item.category === 'SERVICE' || item.barcode?.startsWith('SRV-')) return;
  const batches = db.prepare(`SELECT id, remaining_qty FROM stock_batches
    WHERE product_id = ? AND remaining_qty > 0 ORDER BY received_date, id`).all(productId) as Array<{ id: number; remaining_qty: number }>;
  const tracked = batches.reduce((sum, batch) => sum + batch.remaining_qty, 0);
  if (item.quantity > tracked) {
    const extra = item.quantity - tracked;
    db.prepare(`INSERT INTO stock_batches
      (product_id, received_date, initial_qty, remaining_qty, unit_cost, selling_price)
      VALUES (?, '0001-01-01', ?, ?, ?, ?)`).run(productId, extra, extra, item.cost_price, item.selling_price);
  } else if (item.quantity < tracked) {
    let remove = tracked - item.quantity;
    for (const batch of batches) {
      const take = Math.min(remove, batch.remaining_qty);
      db.prepare('UPDATE stock_batches SET remaining_qty = remaining_qty - ? WHERE id = ?').run(take, batch.id);
      remove -= take;
      if (remove === 0) break;
    }
  }
}
