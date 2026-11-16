import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import { executeCheckout, deleteSale, updateSale } from './checkout';
import { reconcileStock } from './stock';
import { localDayRange, localMonthRange, localDateString } from '../src/utils/dates';
import {
  getDb,
  backupDatabase,
  restoreDatabase,
  getSetting,
  setSetting,
  backupToFolder,
} from './database';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let backupPending = false;
let restorePending = false;

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  const iconPath = process.env.VITE_DEV_SERVER_URL
    ? path.join(__dirname, '../public/logo.png')
    : path.join(__dirname, '../dist/logo.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Hiru Bookshop & Communication',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Auto-backup on close
app.on('before-quit', (event) => {
  if (isQuitting) return;
  if (backupPending || restorePending) { event.preventDefault(); return; }
  const folderPath = getSetting('cloud_backup_folder', '');
  if (!folderPath || getSetting('auto_backup_on_close', '1') !== '1') return;
  event.preventDefault();
  backupPending = true;
  void backupToFolder(folderPath).then(() => {
    isQuitting = true;
    app.quit();
  }).catch(async (error: Error) => {
    const choice = await dialog.showMessageBox({
      type: 'error', title: 'Backup failed',
      message: 'The closing backup could not be completed.', detail: error.message,
      buttons: ['Keep app open', 'Quit without backup'], defaultId: 0, cancelId: 0,
    });
    if (choice.response === 1) { isQuitting = true; app.quit(); }
    else if (BrowserWindow.getAllWindows().length === 0) createWindow();
  }).finally(() => { backupPending = false; });
});

// ─── Auto Updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  // In dev mode there's no update server, so skip.
  if (process.env.VITE_DEV_SERVER_URL) return;

  autoUpdater.autoDownload = false; // Ask user before downloading
  autoUpdater.autoInstallOnAppQuit = false;

  const push = (status: string, payload?: object) => {
    mainWindow?.webContents.send('updater:status', { status, ...payload });
  };

  autoUpdater.on('checking-for-update', () => push('checking'));
  autoUpdater.on('update-available', (info) => push('available', { info }));
  autoUpdater.on('update-not-available', () => push('up-to-date'));
  autoUpdater.on('download-progress', (progress) => push('downloading', { progress }));
  autoUpdater.on('update-downloaded', () => push('ready'));
  autoUpdater.on('error', (err) => {
    console.warn('[autoUpdater] Background update check error:', err?.message || err);
  });

  // Check once 10 seconds after launch (give the window time to paint).
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[autoUpdater] Initial check error:', err?.message || err);
    });
  }, 10_000);
}

// Renderer can trigger a manual check or install
ipcMain.handle('updater:check', async () => {
  if (process.env.VITE_DEV_SERVER_URL) return { success: false, error: 'Dev mode' };
  try {
    await autoUpdater.checkForUpdates();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('updater:install', () => {
  autoUpdater.downloadUpdate();
  // When downloaded, autoUpdater 'update-downloaded' fires → we quitAndInstall
  autoUpdater.once('update-downloaded', () => {
    autoUpdater.quitAndInstall(false, true);
  });
  return { success: true };
});

// ─── Named IPC handlers (replaces raw sql-* channels) ────────────────────────

// ── Inventory ─────────────────────────────────────────────────────────────────

ipcMain.handle('db:inventory:getAll', () => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT i.*, s.name AS supplier_name
      FROM inventory i
      LEFT JOIN suppliers s ON s.id = i.supplier_id
      ORDER BY i.title ASC
    `).all() as any[];

    try {
      const batchStmt = db.prepare(`
        SELECT product_id, selling_price, unit_cost, SUM(remaining_qty) AS remaining_qty
        FROM stock_batches
        WHERE remaining_qty > 0
        GROUP BY product_id, selling_price, unit_cost
        ORDER BY id ASC
      `);
      const allBatches = batchStmt.all() as any[];
      const batchMap = new Map<number, any[]>();
      for (const b of allBatches) {
        if (!batchMap.has(b.product_id)) batchMap.set(b.product_id, []);
        batchMap.get(b.product_id)!.push({
          selling_price: b.selling_price,
          unit_cost: b.unit_cost,
          remaining_qty: b.remaining_qty,
        });
      }
      for (const row of rows) {
        row.batches = batchMap.get(row.id) || [];
      }
    } catch {
      // safe fallback if stock_batches table is not queried
    }

    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:inventory:search', (_e, { term }: { term: string }) => {
  try {
    const db = getDb();
    const like = `%${term.toLowerCase()}%`;
    const rows = db.prepare(`
      SELECT i.*, s.name AS supplier_name
      FROM inventory i
      LEFT JOIN suppliers s ON s.id = i.supplier_id
      WHERE LOWER(i.title) LIKE ? OR i.barcode LIKE ?
      LIMIT 10
    `).all(like, like) as any[];

    // One choice per shelf price. Cost comes from the oldest delivery at that price.
    const batchStmt = db.prepare(`
      SELECT selling_price, unit_cost, remaining_qty AS batch_qty, id, received_date
      FROM stock_batches
      WHERE product_id = ? AND remaining_qty > 0
      ORDER BY received_date ASC, id ASC
    `);

    const results: any[] = [];
    for (const item of rows) {
      if (item.category === 'SERVICE' || item.barcode?.startsWith('SRV-')) {
        results.push(item);
        continue;
      }

      db.transaction(() => reconcileStock(db, item.id))();
      const tiers = new Map<number, { selling_price: number; unit_cost: number; batch_qty: number }>();
      for (const batch of batchStmt.all(item.id) as any[]) {
        const tier = tiers.get(batch.selling_price);
        if (tier) tier.batch_qty += batch.batch_qty;
        else tiers.set(batch.selling_price, { ...batch });
      }
      const batches = [...tiers.values()];
      if (batches.length === 0) {
        results.push(item);
      } else {
        // Use batch prices even when only one tier remains.
        batches.forEach((b, idx) => {
          results.push({
            ...item,
            searchKey: `${item.id}-price-${b.selling_price}`,
            selling_price: b.selling_price,
            cost_price: b.unit_cost,
            quantity: b.batch_qty,
            batch_label: `${idx === 0 ? 'OLD' : 'NEW'}: Rs. ${b.selling_price.toFixed(2)}`,
          });
        });
      }
    }

    return { success: true, data: results };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:inventory:getServices', () => {
  try {
    const rows = getDb().prepare(`
      SELECT * FROM inventory
      WHERE category = 'SERVICE' OR barcode LIKE 'SRV-%'
      ORDER BY id ASC
    `).all();
    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:inventory:upsert', (_e, item: Record<string, unknown>) => {
  try {
    const db = getDb();
    if (!Number.isInteger(item.quantity) || Number(item.quantity) < 0) throw new Error('Stock quantity must be a non-negative whole number.');
    return db.transaction(() => {
      if (item.id) {
        reconcileStock(db, Number(item.id));
        db.prepare(`
        UPDATE inventory SET
          barcode = ?, title = ?, category = ?, cost_price = ?,
          selling_price = ?, discount_percent = ?, quantity = ?,
          reorder_level = ?, supplier_id = ?
        WHERE id = ?
      `).run(
          item.barcode, item.title, item.category, item.cost_price,
          item.selling_price, item.discount_percent, item.quantity,
          item.reorder_level, item.supplier_id ?? null, item.id
        );
        reconcileStock(db, Number(item.id));
        return { success: true, id: item.id };
      } else {
        const info = db.prepare(`
        INSERT INTO inventory
          (barcode, title, category, cost_price, selling_price, discount_percent, quantity, reorder_level, supplier_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
          item.barcode, item.title, item.category, item.cost_price,
          item.selling_price, item.discount_percent, item.quantity,
          item.reorder_level, item.supplier_id ?? null
        );
        reconcileStock(db, Number(info.lastInsertRowid));
        return { success: true, id: info.lastInsertRowid };
      }
    })();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:inventory:delete', (_e, { id }: { id: number }) => {
  try {
    getDb().prepare('DELETE FROM inventory WHERE id = ?').run(id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:inventory:bulkUpsert', (_e, items: Record<string, unknown>[]) => {
  try {
    const db = getDb();
    const bulkTx = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO inventory (barcode, title, category, cost_price, selling_price, discount_percent, quantity, reorder_level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(barcode) DO UPDATE SET
          title=excluded.title, category=excluded.category,
          cost_price=excluded.cost_price, selling_price=excluded.selling_price,
          discount_percent=excluded.discount_percent, quantity=excluded.quantity,
          reorder_level=excluded.reorder_level
      `);
      for (const item of items) {
        if (!Number.isInteger(item.quantity) || Number(item.quantity) < 0) throw new Error('Stock quantity must be a non-negative whole number.');
        const existing = db.prepare('SELECT id FROM inventory WHERE barcode = ?').get(item.barcode) as { id: number } | undefined;
        if (existing) reconcileStock(db, existing.id);
        stmt.run(
          item.barcode, item.title, item.category,
          item.cost_price, item.selling_price, item.discount_percent,
          item.quantity, item.reorder_level
        );
        const saved = db.prepare('SELECT id FROM inventory WHERE barcode = ?').get(item.barcode) as { id: number };
        reconcileStock(db, saved.id);
      }
    });
    bulkTx();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// ── Sales ─────────────────────────────────────────────────────────────────────

ipcMain.handle('db:sales:getRecent', (_e, { limit = 20 }: { limit?: number }) => {
  try {
    const rows = getDb().prepare(
      'SELECT * FROM sales ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:sales:getByDate', (_e, { date }: { date: string }) => {
  try {
    const [start, end] = localDayRange(date);
    const agg = getDb().prepare(`
      SELECT COUNT(*) as count,
             COALESCE(SUM(total_amount), 0) as total_amount,
             COALESCE(SUM(total_cost), 0) as total_cost,
             COALESCE(SUM(gross_profit), 0) as gross_profit
      FROM sales WHERE created_at >= ? AND created_at < ?
    `).get(start, end);
    return { success: true, data: agg };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:sales:getByMonth', (_e, { year, month }: { year: number; month: number }) => {
  try {
    const [start, end] = localMonthRange(year, month);
    const agg = getDb().prepare(`
      SELECT COUNT(*) as count,
             COALESCE(SUM(total_amount), 0) as total_amount,
             COALESCE(SUM(total_cost), 0) as total_cost,
             COALESCE(SUM(gross_profit), 0) as gross_profit
      FROM sales WHERE created_at >= ? AND created_at < ?
    `).get(start, end);
    return { success: true, data: agg };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:sales:getPaymentBreakdown', (_e, { date }: { date: string }) => {
  try {
    const [start, end] = localDayRange(date);
    const rows = getDb().prepare(`
      SELECT COALESCE(payment_type, 'CASH') as payment_type,
             COUNT(*) as count,
             COALESCE(SUM(total_amount), 0) as total
      FROM sales WHERE created_at >= ? AND created_at < ?
      GROUP BY payment_type
    `).all(start, end);
    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:sales:search', (_e, { term = '', limit = 50, offset = 0 }) => {
  try {
    const pageSize = Math.max(1, Math.min(200, Math.trunc(Number(limit)) || 50));
    const skip = Math.max(0, Math.trunc(Number(offset)) || 0);
    const rows = getDb().prepare('SELECT * FROM sales WHERE INSTR(LOWER(receipt_no), LOWER(?)) > 0 ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?')
      .all(String(term).trim(), pageSize + 1, skip);
    return { success: true, data: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
  } catch (err: any) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:sales:delete', (_e, { id }: { id: number }) => {
  try {
    const res = deleteSale(getDb(), Number(id));
    return { success: true, data: res };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:sales:update', (_e, params: any) => {
  try {
    const res = updateSale(getDb(), params);
    return { success: true, data: res };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// ── Reports & Revenue Analytics ───────────────────────────────────────────────

ipcMain.handle('db:reports:getRevenueAnalytics', (_e, params: {
  startDate?: string;
  endDate?: string;
  category?: string;
  paymentType?: string;
  search?: string;
} = {}) => {
  try {
    const db = getDb();
    const startStr = params.startDate || localDateString();
    const endStr = params.endDate || startStr;
    const [startDay] = localDayRange(startStr);
    const [, endDay] = localDayRange(endStr);

    let whereSql = ' WHERE s.created_at >= ? AND s.created_at < ?';
    const sqlParams: any[] = [startDay, endDay];

    if (params.paymentType && params.paymentType !== 'ALL') {
      whereSql += ' AND s.payment_type = ?';
      sqlParams.push(params.paymentType);
    }

    if (params.category && params.category !== 'ALL') {
      if (params.category === 'SERVICE') {
        whereSql += " AND (i.category = 'SERVICE' OR si.barcode LIKE 'SRV-%' OR i.barcode LIKE 'SRV-%')";
      } else if (params.category === 'BOOK') {
        whereSql += " AND (i.category = 'BOOK' AND (si.barcode NOT LIKE 'SRV-%' OR si.barcode IS NULL) AND (i.barcode NOT LIKE 'SRV-%' OR i.barcode IS NULL))";
      } else if (params.category === 'STATIONERY') {
        whereSql += " AND i.category = 'STATIONERY'";
      } else {
        whereSql += ' AND UPPER(i.category) = ?';
        sqlParams.push(params.category.toUpperCase());
      }
    }

    if (params.search && params.search.trim()) {
      whereSql += ' AND (si.title LIKE ? OR i.title LIKE ? OR si.barcode LIKE ? OR i.barcode LIKE ?)';
      const term = `%${params.search.trim()}%`;
      sqlParams.push(term, term, term, term);
    }

    // 1. Overall Aggregates for matching items
    const totals = db.prepare(`
      SELECT
        COUNT(DISTINCT s.id) AS transaction_count,
        COALESCE(SUM(si.quantity), 0) AS total_items_sold,
        COALESCE(SUM(si.quantity * si.unit_price), 0) AS total_revenue,
        COALESCE(SUM(si.quantity * si.unit_cost), 0) AS total_cost
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN inventory i ON i.id = si.product_id
      ${whereSql}
    `).get(...sqlParams) as any;

    const totalRevenue = Math.round((totals?.total_revenue || 0) * 100) / 100;
    const totalCost = Math.round((totals?.total_cost || 0) * 100) / 100;
    const grossProfit = Math.round((totalRevenue - totalCost) * 100) / 100;
    const profitMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 10000) / 100 : 0;
    const totalItemsSold = totals?.total_items_sold || 0;
    const transactionCount = totals?.transaction_count || 0;

    // 2. Category Breakdown (always computed across all items within this date & payment filter so user can see distribution)
    let catWhereSql = ' WHERE s.created_at >= ? AND s.created_at < ?';
    const catParams: any[] = [startDay, endDay];
    if (params.paymentType && params.paymentType !== 'ALL') {
      catWhereSql += ' AND s.payment_type = ?';
      catParams.push(params.paymentType);
    }

    const categoryRows = db.prepare(`
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
      ${catWhereSql}
      GROUP BY category
      ORDER BY revenue DESC
    `).all(...catParams) as any[];

    const allCategoriesRevenue = categoryRows.reduce((sum, r) => sum + (r.revenue || 0), 0) || 1;
    const categoryBreakdown = categoryRows.map(r => {
      const rev = Math.round(r.revenue * 100) / 100;
      const cst = Math.round(r.cost * 100) / 100;
      const prf = Math.round((rev - cst) * 100) / 100;
      const mgn = rev > 0 ? Math.round((prf / rev) * 10000) / 100 : 0;
      const share = Math.round((rev / allCategoriesRevenue) * 10000) / 100;
      return {
        category: r.category,
        itemsSold: r.items_sold,
        revenue: rev,
        cost: cst,
        profit: prf,
        margin: mgn,
        percentage: share,
      };
    });

    // 3. Top Products / Items List
    const itemRows = db.prepare(`
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
      ${whereSql}
      GROUP BY si.product_id, item_title, item_barcode, item_category
      ORDER BY total_revenue DESC
      LIMIT 100
    `).all(...sqlParams) as any[];

    const items = itemRows.map(r => {
      const rev = Math.round(r.total_revenue * 100) / 100;
      const cst = Math.round(r.total_cost * 100) / 100;
      const prf = Math.round((rev - cst) * 100) / 100;
      const avg = r.quantity_sold > 0 ? Math.round((rev / r.quantity_sold) * 100) / 100 : 0;
      return {
        productId: r.product_id,
        title: r.item_title,
        barcode: r.item_barcode,
        category: r.item_category,
        quantitySold: r.quantity_sold,
        totalRevenue: rev,
        totalCost: cst,
        profit: prf,
        avgPrice: avg,
      };
    });

    // 4. Payment breakdown
    const paymentRows = db.prepare(`
      SELECT
        COALESCE(s.payment_type, 'CASH') AS payment_type,
        COUNT(DISTINCT s.id) AS count,
        COALESCE(SUM(si.quantity * si.unit_price), 0) AS total
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN inventory i ON i.id = si.product_id
      ${whereSql}
      GROUP BY s.payment_type
    `).all(...sqlParams) as any[];

    return {
      success: true,
      data: {
        summary: {
          totalRevenue,
          totalCost,
          grossProfit,
          profitMargin,
          totalItemsSold,
          transactionCount,
        },
        categoryBreakdown,
        items,
        paymentBreakdown: paymentRows.map(p => ({
          payment_type: p.payment_type,
          count: p.count,
          total: Math.round(p.total * 100) / 100,
        })),
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// ── Sale Items ────────────────────────────────────────────────────────────────

ipcMain.handle('db:saleItems:getBySale', (_e, { saleId }: { saleId: number }) => {
  try {
    const rows = getDb().prepare(`
      SELECT si.*, COALESCE(si.title, i.title) AS title, COALESCE(si.barcode, i.barcode) AS barcode
      FROM sale_items si
      LEFT JOIN inventory i ON i.id = si.product_id
      WHERE si.sale_id = ?
    `).all(saleId);
    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:saleItems:getAll', () => {
  try {
    const rows = getDb().prepare('SELECT * FROM sale_items').all();
    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// ── Suppliers ─────────────────────────────────────────────────────────────────

ipcMain.handle('db:suppliers:getAll', () => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT 
        s.*,
        COALESCE(grn_totals.total_purchases, 0) AS total_purchases,
        COALESCE(grn_totals.credit_purchases, 0) AS credit_purchases,
        COALESCE(payments.total_paid, 0) AS total_paid,
        MAX(0, ROUND(COALESCE(grn_totals.credit_purchases, 0) - COALESCE(payments.total_paid, 0), 2)) AS total_outstanding,
        COALESCE(grn_totals.grn_count, 0) AS grn_count,
        COALESCE(grn_totals.pending_grn_count, 0) AS pending_grn_count
      FROM suppliers s
      LEFT JOIN (
        SELECT 
          supplier_id,
          COUNT(*) AS grn_count,
          SUM(total_amount) AS total_purchases,
          SUM(CASE WHEN payment_type = 'CREDIT' THEN total_amount ELSE 0 END) AS credit_purchases,
          SUM(CASE WHEN payment_type = 'CREDIT' AND status = 'PENDING' THEN 1 ELSE 0 END) AS pending_grn_count
        FROM grn_headers
        GROUP BY supplier_id
      ) grn_totals ON s.id = grn_totals.supplier_id
      LEFT JOIN (
        SELECT 
          supplier_id,
          SUM(amount) AS total_paid
        FROM supplier_payments
        GROUP BY supplier_id
      ) payments ON s.id = payments.supplier_id
      ORDER BY total_outstanding DESC, s.name ASC
    `).all();
    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:suppliers:upsert', (_e, item: Record<string, unknown>) => {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    if (item.id) {
      db.prepare(`
        UPDATE suppliers 
        SET name = ?, phone = ?, contact_person = ?, address = ?, email = ?, notes = ? 
        WHERE id = ?
      `).run(
        item.name,
        item.phone || null,
        item.contact_person || null,
        item.address || null,
        item.email || null,
        item.notes || null,
        item.id
      );
      return { success: true, id: item.id };
    } else {
      const info = db.prepare(`
        INSERT INTO suppliers (name, phone, contact_person, address, email, notes, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        item.name,
        item.phone || null,
        item.contact_person || null,
        item.address || null,
        item.email || null,
        item.notes || null,
        now
      );
      return { success: true, id: info.lastInsertRowid };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:suppliers:delete', (_e, { id }: { id: number }) => {
  try {
    const db = getDb();
    const count = (db.prepare('SELECT COUNT(*) as count FROM grn_headers WHERE supplier_id = ?').get(id) as { count: number })?.count || 0;
    if (count > 0) {
      return { success: false, error: `Cannot delete supplier with ${count} existing Goods Received Notes (GRNs).` };
    }
    db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:suppliers:getLedger', (_e, { supplierId }: { supplierId: number }) => {
  try {
    const db = getDb();
    const supplier = db.prepare(`
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
        WHERE supplier_id = ?
      ) grn_totals ON s.id = grn_totals.supplier_id
      LEFT JOIN (
        SELECT 
          supplier_id,
          SUM(amount) AS total_paid
        FROM supplier_payments
        WHERE supplier_id = ?
      ) payments ON s.id = payments.supplier_id
      WHERE s.id = ?
    `).get(supplierId, supplierId, supplierId);

    if (!supplier) return { success: false, error: 'Supplier not found' };

    const grns = db.prepare(`
      SELECT 
        id, grn_number, supplier_invoice_no, received_date, payment_type, due_date, status, paid_date, total_amount, notes, created_at
      FROM grn_headers
      WHERE supplier_id = ?
      ORDER BY received_date DESC, id DESC
    `).all(supplierId) as any[];

    const payments = db.prepare(`
      SELECT 
        sp.*, gh.grn_number
      FROM supplier_payments sp
      LEFT JOIN grn_headers gh ON sp.grn_id = gh.id
      WHERE sp.supplier_id = ?
      ORDER BY sp.payment_date DESC, sp.id DESC
    `).all(supplierId) as any[];

    const pendingGrns = grns.filter(g => g.payment_type === 'CREDIT' && g.status === 'PENDING');

    return {
      success: true,
      data: {
        supplier,
        grns,
        payments,
        pendingGrns,
      }
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:suppliers:addPayment', (_e, payload: {
  supplier_id: number;
  grn_id?: number | null;
  amount: number;
  payment_method: string;
  reference_no?: string;
  payment_date: string;
  notes?: string;
}) => {
  try {
    const db = getDb();
    if (!payload.supplier_id || !payload.amount || payload.amount <= 0) {
      return { success: false, error: 'Invalid supplier payment details' };
    }
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO supplier_payments 
        (supplier_id, grn_id, amount, payment_method, reference_no, payment_date, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.supplier_id,
        payload.grn_id || null,
        payload.amount,
        payload.payment_method || 'CASH',
        payload.reference_no || null,
        payload.payment_date || now.split('T')[0],
        payload.notes || null,
        now
      );

      if (payload.grn_id) {
        const grn = db.prepare('SELECT total_amount FROM grn_headers WHERE id = ?').get(payload.grn_id) as { total_amount: number } | undefined;
        if (grn) {
          const totalPaidForGrn = (db.prepare('SELECT SUM(amount) as paid FROM supplier_payments WHERE grn_id = ?').get(payload.grn_id) as { paid: number })?.paid || 0;
          if (totalPaidForGrn >= grn.total_amount) {
            db.prepare('UPDATE grn_headers SET status = "PAID", paid_date = ? WHERE id = ?').run(payload.payment_date || now.split('T')[0], payload.grn_id);
          }
        }
      }
    })();

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:suppliers:deletePayment', (_e, { paymentId }: { paymentId: number }) => {
  try {
    const db = getDb();
    const pmt = db.prepare('SELECT grn_id FROM supplier_payments WHERE id = ?').get(paymentId) as { grn_id: number | null } | undefined;
    if (pmt?.grn_id) {
      db.prepare('UPDATE grn_headers SET status = "PENDING", paid_date = NULL WHERE id = ?').run(pmt.grn_id);
    }
    db.prepare('DELETE FROM supplier_payments WHERE id = ?').run(paymentId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// ── Cashbook ──────────────────────────────────────────────────────────────────

ipcMain.handle('db:cashbook:getAll', (_e, { startDate, endDate, type, category } = {}) => {
  try {
    const db = getDb();
    let query = 'SELECT * FROM cashbook_entries WHERE 1=1';
    const params: any[] = [];
    if (startDate) {
      query += ' AND entry_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND entry_date <= ?';
      params.push(endDate);
    }
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    query += ' ORDER BY entry_date DESC, entry_time DESC, id DESC';
    const rows = db.prepare(query).all(...params);
    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:cashbook:getDayTransactions', (_e, { date }: { date?: string } = {}) => {
  try {
    const db = getDb();
    const targetDate = date || localDateString();
    const [startDay, endDay] = localDayRange(targetDate);

    // 1. Manual cashbook entries for this day
    const manualRows = db.prepare(`
      SELECT id, entry_date, entry_time, type, category, amount, description, reference_no, created_at, 0 AS is_auto
      FROM cashbook_entries
      WHERE entry_date = ?
    `).all(targetDate) as any[];

    // 2. Automated POS cash sales for this day
    const posSales = db.prepare(`
      SELECT id, created_at, total_amount, receipt_no
      FROM sales
      WHERE payment_type = 'CASH' AND created_at >= ? AND created_at < ?
      ORDER BY created_at ASC
    `).all(startDay, endDay) as any[];

    const posRows = posSales.map(s => {
      let time = '';
      try {
        const d = new Date(s.created_at);
        time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch {
        time = s.created_at?.split('T')[1]?.substring(0, 8) || '';
      }
      return {
        id: `pos-${s.id}`,
        entry_date: targetDate,
        entry_time: time,
        type: 'IN',
        category: 'POS_SALES',
        amount: s.total_amount,
        description: `POS Cash Sale (${s.receipt_no})`,
        reference_no: s.receipt_no,
        created_at: s.created_at,
        is_auto: 1,
      };
    });

    const combined = [...manualRows, ...posRows];
    combined.sort((a, b) => {
      const timeA = a.entry_time || '';
      const timeB = b.entry_time || '';
      return timeB.localeCompare(timeA);
    });

    return { success: true, data: combined };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:cashbook:getSummary', (_e, { date }: { date?: string } = {}) => {
  try {
    const db = getDb();
    const targetDate = date || localDateString();
    const [startDay, endDay] = localDayRange(targetDate);

    // 1. POS Cash Sales for this day
    const posSalesRow = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) AS total_cash_sales, COUNT(*) AS count
      FROM sales
      WHERE payment_type = 'CASH' AND created_at >= ? AND created_at < ?
    `).get(startDay, endDay) as any;

    // 2. Manual cash entries for this day
    const cashbookAgg = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'IN' THEN amount ELSE 0 END), 0) AS manual_cash_in,
        COALESCE(SUM(CASE WHEN type = 'OUT' THEN amount ELSE 0 END), 0) AS manual_cash_out
      FROM cashbook_entries
      WHERE entry_date = ?
    `).get(targetDate) as any;

    // 3. Opening balance (all cash before this day)
    const priorSales = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) AS total
      FROM sales
      WHERE payment_type = 'CASH' AND created_at < ?
    `).get(startDay) as any;

    const priorCashbook = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'IN' THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN type = 'OUT' THEN amount ELSE 0 END), 0) AS net
      FROM cashbook_entries
      WHERE entry_date < ?
    `).get(targetDate) as any;

    const openingBalance = Math.round(((priorSales?.total || 0) + (priorCashbook?.net || 0)) * 100) / 100;
    const posCashSales = Math.round((posSalesRow?.total_cash_sales || 0) * 100) / 100;
    const manualCashIn = Math.round((cashbookAgg?.manual_cash_in || 0) * 100) / 100;
    const manualCashOut = Math.round((cashbookAgg?.manual_cash_out || 0) * 100) / 100;
    const totalCashIn = Math.round((posCashSales + manualCashIn) * 100) / 100;
    const totalCashOut = manualCashOut;
    const netCashFlow = Math.round((totalCashIn - totalCashOut) * 100) / 100;
    const closingBalance = Math.round((openingBalance + netCashFlow) * 100) / 100;

    return {
      success: true,
      data: {
        openingBalance,
        posCashSales,
        manualCashIn,
        totalCashIn,
        totalCashOut,
        netCashFlow,
        closingBalance,
        posSalesCount: posSalesRow?.count || 0,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:cashbook:create', (_e, entry: any) => {
  try {
    const db = getDb();
    if (!entry.description?.trim()) throw new Error('Description is required');
    const amount = parseFloat(entry.amount);
    if (isNaN(amount) || amount <= 0) throw new Error('Amount must be greater than 0');
    if (!['IN', 'OUT'].includes(entry.type)) throw new Error('Type must be IN or OUT');

    let time = entry.entry_time;
    if (!time) {
      const now = new Date();
      time = now.toTimeString().split(' ')[0];
    }

    const info = db.prepare(`
      INSERT INTO cashbook_entries (entry_date, entry_time, type, category, amount, description, reference_no)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.entry_date || localDateString(),
      time,
      entry.type,
      entry.category || 'OTHER',
      amount,
      entry.description.trim(),
      entry.reference_no?.trim() || null
    );
    return { success: true, id: Number(info.lastInsertRowid) };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:cashbook:update', (_e, entry: any) => {
  try {
    const db = getDb();
    if (!entry.id) throw new Error('Entry ID is required');
    if (!entry.description?.trim()) throw new Error('Description is required');
    const amount = parseFloat(entry.amount);
    if (isNaN(amount) || amount <= 0) throw new Error('Amount must be greater than 0');
    if (!['IN', 'OUT'].includes(entry.type)) throw new Error('Type must be IN or OUT');

    db.prepare(`
      UPDATE cashbook_entries SET
        entry_date = ?,
        entry_time = ?,
        type = ?,
        category = ?,
        amount = ?,
        description = ?,
        reference_no = ?
      WHERE id = ?
    `).run(
      entry.entry_date,
      entry.entry_time,
      entry.type,
      entry.category,
      amount,
      entry.description.trim(),
      entry.reference_no?.trim() || null,
      entry.id
    );
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:cashbook:delete', (_e, { id }: { id: number }) => {
  try {
    getDb().prepare('DELETE FROM cashbook_entries WHERE id = ?').run(Number(id));
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// ── Bills ─────────────────────────────────────────────────────────────────────

ipcMain.handle('db:bills:getAll', () => {
  try {
    const rows = getDb().prepare('SELECT * FROM bills ORDER BY due_date DESC').all();
    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:bills:getByMonth', (_e, { year, month }: { year: number; month: number }) => {
  try {
    const mm = String(month).padStart(2, '0');
    const daysInMonth = new Date(year, month, 0).getDate();
    const start = `${year}-${mm}-01`;
    const end = `${year}-${mm}-${String(daysInMonth).padStart(2, '0')}`;
    const rows = getDb().prepare(
      'SELECT * FROM bills WHERE due_date >= ? AND due_date <= ? ORDER BY due_date ASC'
    ).all(start, end);
    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:bills:upsert', (_e, item: Record<string, unknown>) => {
  try {
    const db = getDb();
    if (item.id) {
      db.prepare(`
        UPDATE bills SET bill_type=?, title=?, amount=?, due_date=?, status=?, paid_date=?, supplier_id=?
        WHERE id=?
      `).run(item.bill_type, item.title, item.amount, item.due_date, item.status, item.paid_date ?? null, item.supplier_id ?? null, item.id);
      return { success: true, id: item.id };
    } else {
      const info = db.prepare(`
        INSERT INTO bills (bill_type, title, amount, due_date, status, paid_date, supplier_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(item.bill_type, item.title, item.amount, item.due_date, item.status, item.paid_date ?? null, item.supplier_id ?? null);
      return { success: true, id: info.lastInsertRowid };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:bills:delete', (_e, { id }: { id: number }) => {
  try {
    getDb().prepare('DELETE FROM bills WHERE id = ?').run(id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:bills:markPaid', (_e, { id, paidDate }: { id: number; paidDate: string }) => {
  try {
    getDb().prepare("UPDATE bills SET status='PAID', paid_date=? WHERE id=?").run(paidDate, id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// ── GRN (Goods Received Notes) ────────────────────────────────────────────────

ipcMain.handle('db:grn:getAll', () => {
  try {
    const rows = getDb().prepare(`
      SELECT g.*, s.name AS supplier_name
      FROM grn_headers g
      LEFT JOIN suppliers s ON s.id = g.supplier_id
      ORDER BY g.received_date DESC, g.id DESC
    `).all();
    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:grn:getPending', () => {
  try {
    const rows = getDb().prepare(`
      SELECT g.*, s.name AS supplier_name
      FROM grn_headers g
      LEFT JOIN suppliers s ON s.id = g.supplier_id
      WHERE g.payment_type = 'CREDIT' AND g.status = 'PENDING'
      ORDER BY g.due_date ASC
    `).all();
    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:grn:getById', (_e, { id }: { id: number }) => {
  try {
    const db = getDb();
    const header = db.prepare(`
      SELECT g.*, s.name AS supplier_name
      FROM grn_headers g
      LEFT JOIN suppliers s ON s.id = g.supplier_id
      WHERE g.id = ?
    `).get(id);
    if (!header) return { success: false, error: 'GRN not found' };
    const items = db.prepare('SELECT * FROM grn_items WHERE grn_id = ? ORDER BY id ASC').all(id);
    return { success: true, data: { header, items } };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:grn:create', (_e, payload: {
  supplier_id?: number | null;
  received_date: string;
  payment_type: 'CASH' | 'CREDIT';
  due_date?: string | null;
  notes?: string;
  items: Array<{
    product_id?: number | null;
    barcode: string;
    title: string;
    received_qty: number;
    unit_cost: number;
    selling_price: number;   // ← new: retail price for this batch
  }>;
}) => {
  try {
    const db = getDb();

    const result = db.transaction(() => {
      if (!Array.isArray(payload.items) || payload.items.length === 0 ||
        !['CASH', 'CREDIT'].includes(payload.payment_type) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(payload.received_date)) {
        throw new Error('Enter a valid receipt date, payment type, and at least one item.');
      }
      for (const item of payload.items) {
        if (!item.barcode?.trim() || !item.title?.trim() ||
          !Number.isInteger(item.received_qty) || item.received_qty <= 0 ||
          !Number.isFinite(item.unit_cost) || item.unit_cost < 0 ||
          !Number.isFinite(item.selling_price) || item.selling_price < 0) {
          throw new Error('Each GRN item needs a positive whole quantity and valid prices.');
        }
      }
      // Generate GRN number: GRN-YYYYMMDD-NNN
      const dateStr = payload.received_date.replace(/-/g, '');
      const prefix = `GRN-${dateStr}-`;
      const last = db.prepare(
        `SELECT grn_number FROM grn_headers WHERE grn_number LIKE ? ORDER BY id DESC LIMIT 1`
      ).get(`${prefix}%`) as { grn_number: string } | undefined;
      let seq = 1;
      if (last) {
        const parts = last.grn_number.split('-');
        seq = (parseInt(parts[parts.length - 1]) || 0) + 1;
      }
      const grn_number = `${prefix}${String(seq).padStart(3, '0')}`;

      const totalAmount = payload.items.reduce((s, i) => s + i.received_qty * i.unit_cost, 0);
      const status = payload.payment_type === 'CASH' ? 'PAID' : 'PENDING';

      const info = db.prepare(`
        INSERT INTO grn_headers
          (grn_number, supplier_id, received_date, payment_type, due_date, status, total_amount, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        grn_number,
        payload.supplier_id ?? null,
        payload.received_date,
        payload.payment_type,
        payload.payment_type === 'CREDIT' ? (payload.due_date ?? null) : null,
        status,
        totalAmount,
        payload.notes ?? null
      );
      const grn_id = info.lastInsertRowid as number;

      const itemStmt = db.prepare(`
        INSERT INTO grn_items (grn_id, product_id, barcode, title, received_qty, unit_cost, selling_price, total_cost)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const stockStmt = db.prepare(`
        UPDATE inventory SET quantity = quantity + ? WHERE id = ?
      `);
      // Update both cost_price and selling_price to reflect the latest batch
      const priceStmt = db.prepare(`
        UPDATE inventory SET cost_price = ?, selling_price = ? WHERE id = ?
      `);
      const batchStmt = db.prepare(`
        INSERT INTO stock_batches (product_id, grn_id, received_date, initial_qty, remaining_qty, unit_cost, selling_price)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of payload.items) {
        const sellingPrice = Number(item.selling_price) || 0;
        let product = item.product_id
          ? db.prepare('SELECT id FROM inventory WHERE id = ?').get(item.product_id) as { id: number } | undefined
          : db.prepare('SELECT id FROM inventory WHERE barcode = ?').get(item.barcode) as { id: number } | undefined;
        if (item.product_id && !product) throw new Error('A GRN product no longer exists. Refresh and try again.');
        if (!product) {
          const inserted = db.prepare(`INSERT INTO inventory (barcode, title, category, cost_price, selling_price, quantity, supplier_id)
            VALUES (?, ?, 'OTHER', ?, ?, 0, ?)`).run(item.barcode, item.title, item.unit_cost, sellingPrice, payload.supplier_id ?? null);
          product = { id: Number(inserted.lastInsertRowid) };
        }
        const productId = product.id;
        reconcileStock(db, productId);
        const total_cost = item.received_qty * item.unit_cost;
        itemStmt.run(grn_id, productId, item.barcode, item.title, item.received_qty, item.unit_cost, sellingPrice, total_cost);

        {
          // Update total stock quantity
          stockStmt.run(item.received_qty, productId);

          // Update inventory prices to match this new batch (latest batch wins)
          priceStmt.run(item.unit_cost, sellingPrice, productId);

          // Every delivery keeps its own date and GRN, even when prices match.
          batchStmt.run(
            productId,
            grn_id,
            payload.received_date,
            item.received_qty,
            item.received_qty,
            item.unit_cost,
            sellingPrice
          );
        }
      }

      return { grn_id, grn_number };
    })();

    return { success: true, ...result };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:grn:markPaid', (_e, { id, paid_date }: { id: number; paid_date: string }) => {
  try {
    getDb().prepare(`UPDATE grn_headers SET status='PAID', paid_date=? WHERE id=?`).run(paid_date, id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:grn:delete', (_e, { id }: { id: number }) => {
  try {
    const db = getDb();
    db.transaction(() => {
      // Only untouched, traceable deliveries can be reversed safely.
      const items = db.prepare('SELECT product_id, SUM(received_qty) AS received_qty FROM grn_items WHERE grn_id = ? GROUP BY product_id').all(id) as Array<{ product_id: number | null; received_qty: number }>;
      const batchTotals = db.prepare(`SELECT COALESCE(SUM(initial_qty), 0) AS initial,
        COALESCE(SUM(remaining_qty), 0) AS remaining FROM stock_batches WHERE grn_id = ? AND product_id = ?`);
      const stockStmt = db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ? AND quantity >= ?');
      for (const item of items) {
        if (!item.product_id) continue;
        const batch = batchTotals.get(id, item.product_id) as { initial: number; remaining: number };
        if (batch.initial !== item.received_qty || batch.remaining !== item.received_qty) {
          throw new Error('Cannot delete this GRN: stock has been sold or its older batch history cannot be safely reversed.');
        }
        if (stockStmt.run(item.received_qty, item.product_id, item.received_qty).changes !== 1) {
          throw new Error('Cannot delete this GRN: available stock is below the received quantity.');
        }
      }
      // Remove FIFO batches for this GRN (stock_batches rows with grn_id)
      db.prepare('DELETE FROM stock_batches WHERE grn_id = ?').run(id);
      db.prepare('DELETE FROM grn_headers WHERE id = ?').run(id);
    })();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// ── Assets ────────────────────────────────────────────────────────────────────

ipcMain.handle('db:assets:getAll', () => {
  try {
    const rows = getDb().prepare('SELECT * FROM assets ORDER BY purchase_date DESC').all();
    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:assets:upsert', (_e, item: Record<string, unknown>) => {
  try {
    const db = getDb();
    if (item.id) {
      db.prepare('UPDATE assets SET asset_name=?, cost_value=?, purchase_date=?, condition=? WHERE id=?')
        .run(item.asset_name, item.cost_value, item.purchase_date, item.condition, item.id);
      return { success: true, id: item.id };
    } else {
      const info = db.prepare('INSERT INTO assets (asset_name, cost_value, purchase_date, condition) VALUES (?, ?, ?, ?)')
        .run(item.asset_name, item.cost_value, item.purchase_date, item.condition);
      return { success: true, id: info.lastInsertRowid };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:assets:delete', (_e, { id }: { id: number }) => {
  try {
    getDb().prepare('DELETE FROM assets WHERE id = ?').run(id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// ── Settings ──────────────────────────────────────────────────────────────────

ipcMain.handle('db:settings:get', (_e, { key, defaultValue = '' }: { key: string; defaultValue?: string }) => {
  return { success: true, value: getSetting(key, defaultValue) };
});

ipcMain.handle('db:settings:set', (_e, { key, value }: { key: string; value: string }) => {
  setSetting(key, value);
  return { success: true };
});

// ─── Atomic checkout ──────────────────────────────────────────────────────────

ipcMain.handle('execute-checkout', (_e, params) => {
  try {
    if (restorePending || backupPending) throw new Error('Database maintenance is in progress. Please retry.');
    return { success: true, ...executeCheckout(getDb(), params) };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// ─── Credit Customers ─────────────────────────────────────────────────────────

ipcMain.handle('db:credit:getCustomers', () => {
  try {
    const db = getDb();
    const data = db.prepare(`
      SELECT id, name, phone, address, credit_limit, total_outstanding, COALESCE(loyalty_points, 0) AS loyalty_points, notes, created_at
      FROM credit_customers
      ORDER BY name ASC
    `).all();
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:credit:searchCustomers', (_e, { term }: { term: string }) => {
  try {
    const db = getDb();
    const like = `%${term}%`;
    const data = db.prepare(`
      SELECT id, name, phone, address, credit_limit, total_outstanding, COALESCE(loyalty_points, 0) AS loyalty_points, notes, created_at
      FROM credit_customers
      WHERE name LIKE ? OR phone LIKE ?
      ORDER BY name ASC
      LIMIT 20
    `).all(like, like);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:credit:createCustomer', (_e, data: { name: string; phone?: string; address?: string; credit_limit?: number; notes?: string }) => {
  try {
    const db = getDb();
    if (!data.name?.trim()) throw new Error('Customer name is required');
    const result = db.prepare(`
      INSERT INTO credit_customers (name, phone, address, credit_limit, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.name.trim(), data.phone ?? '', data.address ?? '', data.credit_limit ?? 0, data.notes ?? '');
    return { success: true, id: Number(result.lastInsertRowid) };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:credit:updateCustomer', (_e, data: { id: number; name: string; phone?: string; address?: string; credit_limit?: number; notes?: string }) => {
  try {
    const db = getDb();
    if (!data.id || !data.name?.trim()) throw new Error('Invalid customer data');
    db.prepare(`
      UPDATE credit_customers SET name = ?, phone = ?, address = ?, credit_limit = ?, notes = ?
      WHERE id = ?
    `).run(data.name.trim(), data.phone ?? '', data.address ?? '', data.credit_limit ?? 0, data.notes ?? '', data.id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:credit:deleteCustomer', (_e, { id }: { id: number }) => {
  try {
    const db = getDb();
    const customer = db.prepare('SELECT total_outstanding FROM credit_customers WHERE id = ?').get(id) as { total_outstanding: number } | undefined;
    if (!customer) throw new Error('Customer not found');
    if (customer.total_outstanding > 0) throw new Error('Cannot delete customer with outstanding balance');
    db.prepare('DELETE FROM credit_customers WHERE id = ?').run(id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:credit:getCustomerLedger', (_e, { customerId }: { customerId: number }) => {
  try {
    const db = getDb();
    const customer = db.prepare('SELECT * FROM credit_customers WHERE id = ?').get(customerId) as any;
    if (!customer) throw new Error('Customer not found');
    const ledger = db.prepare(`
      SELECT cp.id, cp.amount, cp.payment_type, cp.notes, cp.created_at,
             s.receipt_no, s.total_amount AS sale_total
      FROM credit_payments cp
      LEFT JOIN sales s ON cp.sale_id = s.id
      WHERE cp.customer_id = ?
      ORDER BY cp.created_at DESC
    `).all(customerId);
    return { success: true, data: { customer, ledger } };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:credit:recordPayment', (_e, { customerId, amount, notes }: { customerId: number; amount: number; notes?: string }) => {
  try {
    const db = getDb();
    if (!customerId || !amount || amount <= 0) throw new Error('Invalid payment data');
    const customer = db.prepare('SELECT total_outstanding FROM credit_customers WHERE id = ?').get(customerId) as { total_outstanding: number } | undefined;
    if (!customer) throw new Error('Customer not found');
    db.transaction(() => {
      db.prepare('INSERT INTO credit_payments (customer_id, amount, payment_type, notes) VALUES (?, ?, ?, ?)').run(customerId, amount, 'PAYMENT', notes ?? '');
      const newOutstanding = Math.max(0, Math.round((customer.total_outstanding - amount) * 100) / 100);
      db.prepare('UPDATE credit_customers SET total_outstanding = ? WHERE id = ?').run(newOutstanding, customerId);
    })();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// ─── WhatsApp & E-Bill IPC ───────────────────────────────────────────────────

ipcMain.handle('whatsapp:openChat', async (_e, { phone, message }: { phone: string; message: string }) => {
  try {
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '94' + cleanPhone.substring(1);
    } else if (!cleanPhone.startsWith('94') && cleanPhone.length === 9) {
      cleanPhone = '94' + cleanPhone;
    }
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    await shell.openExternal(url);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('whatsapp:saveBillImage', async (_e, { base64Data, receiptNo }: { base64Data: string; receiptNo: string }) => {
  try {
    const fs = await import('fs');
    const pathMod = await import('path');
    const downloadsPath = app.getPath('downloads');
    const fileName = `Bill_${receiptNo.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    const fullPath = pathMod.join(downloadsPath, fileName);
    const data = base64Data.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(fullPath, Buffer.from(data, 'base64'));
    shell.showItemInFolder(fullPath);
    return { success: true, filePath: fullPath };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// ─── Backup / Restore ─────────────────────────────────────────────────────────

ipcMain.handle('db-backup', async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Save Database Backup',
      defaultPath: `hiru_backup_${today}.sqlite`,
      filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, cancelled: true };
    await backupDatabase(result.filePath);
    return { success: true, filePath: result.filePath };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db-restore', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Select Backup Database to Restore',
      properties: ['openFile'],
      filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
    });
    if (result.canceled || !result.filePaths?.length) return { success: false, cancelled: true };
    if (restorePending || backupPending) throw new Error('Database maintenance is already in progress');
    restorePending = true;
    try { await restoreDatabase(result.filePaths[0]); } finally { restorePending = false; }
    mainWindow?.webContents.reload();
    return { success: true, filePath: result.filePaths[0] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-backup-settings', () => ({
  folderPath: getSetting('cloud_backup_folder', ''),
  autoBackupOnClose: getSetting('auto_backup_on_close', '1') === '1',
  lastBackupTime: getSetting('last_backup_time', ''),
  lastBackupFile: getSetting('last_backup_file', ''),
}));

ipcMain.handle('select-backup-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select Google Drive or Cloud Backup Folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths?.length) return { success: false, cancelled: true };
  const folderPath = result.filePaths[0];
  setSetting('cloud_backup_folder', folderPath);
  return { success: true, folderPath };
});

ipcMain.handle('save-backup-settings', (_e, { folderPath, autoBackupOnClose }: { folderPath?: string; autoBackupOnClose?: boolean }) => {
  if (folderPath !== undefined) setSetting('cloud_backup_folder', folderPath);
  if (autoBackupOnClose !== undefined) setSetting('auto_backup_on_close', autoBackupOnClose ? '1' : '0');
  return { success: true };
});

ipcMain.handle('execute-cloud-backup', async () => {
  try {
    const folderPath = getSetting('cloud_backup_folder', '');
    if (!folderPath) return { success: false, error: 'No backup folder configured.' };
    const savedPath = await backupToFolder(folderPath);
    return { success: true, filePath: savedPath, timestamp: new Date().toISOString() };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
