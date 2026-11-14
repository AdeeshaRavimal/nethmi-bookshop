import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initPragmasAndSchema } from '../../electron/database';

describe('Reports & Revenue Analytics', () => {
  let memDb: Database.Database;

  beforeEach(() => {
    memDb = new Database(':memory:');
    initPragmasAndSchema(memDb);

    // Insert sample inventory across categories
    memDb.prepare(`
      INSERT INTO inventory (id, barcode, title, category, cost_price, selling_price, quantity)
      VALUES
        (1, 'BK-001', 'Atlas Exercise Book 80pg', 'BOOK', 70, 100, 50),
        (2, 'ST-001', 'Atlas Chooty Blue Pen', 'STATIONERY', 20, 35, 100),
        (3, 'SRV-001', 'A4 Photocopy B&W', 'SERVICE', 0, 15, 0)
    `).run();

    // Insert a sale
    const saleInfo = memDb.prepare(`
      INSERT INTO sales (receipt_no, total_amount, total_cost, gross_profit, payment_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('REC-100', 315, 180, 135, 'CASH', '2026-11-14T10:00:00.000Z');

    const saleId = saleInfo.lastInsertRowid;

    // Insert sale items: 2x Book (200), 1x Pen (35), 5x Photocopy (80 - wait 5*15=75) -> 200+35+75 = 310
    memDb.prepare(`
      INSERT INTO sale_items (sale_id, product_id, barcode, title, quantity, unit_cost, unit_price, original_price)
      VALUES
        (?, 1, 'BK-001', 'Atlas Exercise Book 80pg', 2, 70, 100, 100),
        (?, 2, 'ST-001', 'Atlas Chooty Blue Pen', 1, 20, 35, 35),
        (?, 3, 'SRV-001', 'A4 Photocopy B&W', 5, 0, 15, 15)
    `).run(saleId, saleId, saleId);
  });

  afterEach(() => {
    memDb.close();
  });

  it('accurately groups and calculates revenue and profit by category', () => {
    const startDay = '2026-11-14T00:00:00.000Z';
    const endDay = '2026-11-15T00:00:00.000Z';

    const categoryRows = memDb.prepare(`
      SELECT
        CASE
          WHEN i.category = 'SERVICE' OR si.barcode LIKE 'SRV-%' OR i.barcode LIKE 'SRV-%' THEN 'SERVICE'
          WHEN i.category IS NOT NULL AND i.category != '' THEN UPPER(i.category)
          ELSE 'OTHER'
        END AS category,
        COALESCE(SUM(si.quantity), 0) AS items_sold,
        COALESCE(SUM(si.quantity * si.unit_price), 0) AS revenue,
        COALESCE(SUM(si.quantity * si.unit_cost), 0) AS cost
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN inventory i ON i.id = si.product_id
      WHERE s.created_at >= ? AND s.created_at < ?
      GROUP BY category
      ORDER BY revenue DESC
    `).all(startDay, endDay) as any[];

    expect(categoryRows).toHaveLength(3);

    const bookRow = categoryRows.find(r => r.category === 'BOOK');
    expect(bookRow).toBeDefined();
    expect(bookRow.items_sold).toBe(2);
    expect(bookRow.revenue).toBe(200); // 2 * 100
    expect(bookRow.cost).toBe(140); // 2 * 70

    const srvRow = categoryRows.find(r => r.category === 'SERVICE');
    expect(srvRow).toBeDefined();
    expect(srvRow.items_sold).toBe(5);
    expect(srvRow.revenue).toBe(75); // 5 * 15
    expect(srvRow.cost).toBe(0); // service cost is 0

    const statRow = categoryRows.find(r => r.category === 'STATIONERY');
    expect(statRow).toBeDefined();
    expect(statRow.items_sold).toBe(1);
    expect(statRow.revenue).toBe(35);
    expect(statRow.cost).toBe(20);
  });

  it('filters revenue specifically by category (e.g. SERVICE only)', () => {
    const startDay = '2026-11-14T00:00:00.000Z';
    const endDay = '2026-11-15T00:00:00.000Z';

    const serviceTotals = memDb.prepare(`
      SELECT
        COALESCE(SUM(si.quantity), 0) AS total_items_sold,
        COALESCE(SUM(si.quantity * si.unit_price), 0) AS total_revenue,
        COALESCE(SUM(si.quantity * si.unit_cost), 0) AS total_cost
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN inventory i ON i.id = si.product_id
      WHERE s.created_at >= ? AND s.created_at < ?
        AND (i.category = 'SERVICE' OR si.barcode LIKE 'SRV-%' OR i.barcode LIKE 'SRV-%')
    `).get(startDay, endDay) as any;

    expect(serviceTotals.total_revenue).toBe(75);
    expect(serviceTotals.total_cost).toBe(0);
    expect(serviceTotals.total_items_sold).toBe(5);
  });

  it('runs itemRows query with unambiguous column names successfully', () => {
    const startDay = '2026-11-14T00:00:00.000Z';
    const endDay = '2026-11-15T00:00:00.000Z';

    const itemRows = memDb.prepare(`
      SELECT
        si.product_id,
        COALESCE(si.title, i.title, 'Item #' || si.product_id) AS item_title,
        COALESCE(si.barcode, i.barcode, '') AS item_barcode,
        CASE
          WHEN i.category = 'SERVICE' OR si.barcode LIKE 'SRV-%' OR i.barcode LIKE 'SRV-%' THEN 'SERVICE'
          WHEN i.category IS NOT NULL AND i.category != '' THEN UPPER(i.category)
          ELSE 'OTHER'
        END AS item_category,
        COALESCE(SUM(si.quantity), 0) AS quantity_sold,
        COALESCE(SUM(si.quantity * si.unit_price), 0) AS total_revenue,
        COALESCE(SUM(si.quantity * si.unit_cost), 0) AS total_cost
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN inventory i ON i.id = si.product_id
      WHERE s.created_at >= ? AND s.created_at < ?
      GROUP BY si.product_id, item_title, item_barcode, item_category
      ORDER BY total_revenue DESC
      LIMIT 100
    `).all(startDay, endDay) as any[];

    expect(itemRows).toHaveLength(3);
    expect(itemRows[0].total_revenue).toBe(200);
    expect(itemRows[0].item_title).toBe('Atlas Exercise Book 80pg');
  });
});
