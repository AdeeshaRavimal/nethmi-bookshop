import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  events: new Map<string, (...args: any[]) => any>(),
  backup: vi.fn(), quit: vi.fn(), dialog: vi.fn(), db: undefined as any,
}));
vi.mock('electron', () => ({
  app: { whenReady: () => new Promise(() => {}), on: (name: string, cb: (...args: any[]) => any) => state.events.set(name, cb), quit: state.quit },
  BrowserWindow: { getAllWindows: () => [{}] },
  ipcMain: { handle: (name: string, cb: (...args: any[]) => any) => state.handlers.set(name, cb) },
  dialog: { showMessageBox: state.dialog },
}));
vi.mock('electron-updater', () => ({ autoUpdater: {} }));
vi.mock('../../electron/database', () => ({
  getDb: () => state.db, backupDatabase: vi.fn(), restoreDatabase: vi.fn(),
  getSetting: (key: string) => key === 'cloud_backup_folder' ? 'backup-folder' : '1',
  setSetting: vi.fn(), backupToFolder: state.backup,
}));

beforeEach(async () => {
  vi.resetModules(); state.events.clear(); state.handlers.clear(); vi.clearAllMocks();
  state.db = new Database(':memory:');
  state.db.exec('CREATE TABLE sales (id INTEGER PRIMARY KEY, receipt_no TEXT, created_at TEXT, total_amount REAL, total_cost REAL, gross_profit REAL, payment_type TEXT)');
  await import('../../electron/main');
});
afterEach(() => state.db.close());

async function setupStock() {
  const { initPragmasAndSchema } = await vi.importActual<typeof import('../../electron/database')>('../../electron/database');
  state.db.exec('DROP TABLE sales');
  initPragmasAndSchema(state.db);
  const result = state.handlers.get('db:inventory:upsert')!(null, {
    barcode: 'BOOK', title: 'Book', category: 'BOOK', quantity: 5, cost_price: 50,
    selling_price: 100, discount_percent: 0, reorder_level: 3,
  });
  expect(result.success).toBe(true);
  return result.id as number;
}

function receive(productId: number | null, date: string, price = 120, cost = 70, quantity = 2) {
  return state.handlers.get('db:grn:create')!(null, {
    received_date: date, payment_type: 'CASH', items: [{ product_id: productId,
      barcode: productId ? 'BOOK' : 'NEW', title: 'Book', received_qty: quantity, unit_cost: cost, selling_price: price }],
  });
}

describe('GRN price-tier FIFO integration', () => {
  it('keeps same-price deliveries separate and preserves opening stock and POS choices', async () => {
    const id = await setupStock();
    const first = receive(id, '2026-11-10');
    const second = receive(id, '2026-11-12');
    expect(first.success).toBe(true); expect(second.success).toBe(true);
    expect(state.db.prepare('SELECT grn_id, remaining_qty FROM stock_batches ORDER BY id').all()).toEqual([
      { grn_id: null, remaining_qty: 5 }, { grn_id: first.grn_id, remaining_qty: 2 }, { grn_id: second.grn_id, remaining_qty: 2 },
    ]);
    const choices = state.handlers.get('db:inventory:search')!(null, { term: 'BOOK' }).data;
    expect(choices.map((p: any) => [p.id, p.selling_price, p.quantity])).toEqual([[id, 100, 5], [id, 120, 4]]);
    expect(state.handlers.get('db:grn:delete')!(null, { id: second.grn_id }).success).toBe(true);
    expect(state.db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(id)).toEqual({ quantity: 7 });
  });

  it('uses remaining batch prices when the newest GRN is reversed and blocks reversing sold stock', async () => {
    const id = await setupStock();
    const incoming = receive(id, '2026-11-10');
    expect(state.handlers.get('db:grn:delete')!(null, { id: incoming.grn_id }).success).toBe(true);
    const choices = state.handlers.get('db:inventory:search')!(null, { term: 'BOOK' }).data;
    expect(choices).toHaveLength(1);
    expect(choices[0].selling_price).toBe(100);
    const delivery = receive(id, '2026-11-11');
    expect(state.handlers.get('execute-checkout')!(null, { requestId: 'grn-sale', paymentType: 'CASH', items: [{
      id, barcode: 'BOOK', title: 'Book', quantity: 1, selling_price: 120, cost_price: 70,
    }] }).success).toBe(true);
    expect(state.handlers.get('db:grn:delete')!(null, { id: delivery.grn_id }).success).toBe(false);
    expect(state.db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(id)).toEqual({ quantity: 6 });
  });

  it('creates inventory and batches for manual GRN lines and rolls back invalid receipts', async () => {
    await setupStock();
    const result = receive(null, '2026-11-10');
    expect(result.success).toBe(true);
    const choices = state.handlers.get('db:inventory:search')!(null, { term: 'NEW' }).data;
    expect(choices).toHaveLength(1); expect(choices[0].quantity).toBe(2);
    expect(receive(choices[0].id, '2026-11-11', 120, 70, -1).success).toBe(false);
    expect(state.db.prepare('SELECT COUNT(*) AS n FROM grn_headers').get()).toEqual({ n: 1 });
  });
});

describe('Main-process regression paths', () => {
  it('prevents shutdown and repeated quit requests until the backup finishes', async () => {
    let finish!: () => void;
    state.backup.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const preventDefault = vi.fn();
    state.events.get('before-quit')!({ preventDefault });
    state.events.get('before-quit')!({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(state.backup).toHaveBeenCalledTimes(1);
    expect(state.quit).not.toHaveBeenCalled();
    finish(); await vi.waitFor(() => expect(state.quit).toHaveBeenCalledTimes(1));
    const finalPrevent = vi.fn(); state.events.get('before-quit')!({ preventDefault: finalPrevent });
    expect(finalPrevent).not.toHaveBeenCalled();
  });

  it('keeps the app open when backup fails and the user chooses to stay', async () => {
    state.backup.mockRejectedValue(new Error('Disk full'));
    state.dialog.mockResolvedValue({ response: 0 });
    state.events.get('before-quit')!({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(state.dialog).toHaveBeenCalled());
    expect(state.quit).not.toHaveBeenCalled();
  });

  it('searches receipts beyond the most recent 200 and paginates them', () => {
    const insert = state.db.prepare('INSERT INTO sales (id, receipt_no, created_at) VALUES (?, ?, ?)');
    for (let n = 1; n <= 251; n++) insert.run(n, 'REC-' + String(n).padStart(3, '0'), '2026-10-01T12:00:00.000Z');
    const search = state.handlers.get('db:sales:search')!;
    const result = search(null, { term: 'REC-001', limit: 50, offset: 0 });
    expect(result.data[0].id).toBe(1);
    expect(result.hasMore).toBe(false);
    expect(search(null, { term: '', limit: 50, offset: 0 }).hasMore).toBe(true);
    const last = search(null, { term: '', limit: 50, offset: 250 });
    expect(last.data).toHaveLength(1); expect(last.hasMore).toBe(false);
  });

  it('includes an early local sale in the correct daily and monthly reports', () => {
    const saleTime = new Date(2026, 9, 1, 1).toISOString();
    state.db.prepare('INSERT INTO sales VALUES (?, ?, ?, ?, ?, ?, ?)').run(1, 'REC-1', saleTime, 100, 50, 50, 'CASH');
    expect(state.handlers.get('db:sales:getByDate')!(null, { date: '2026-10-01' }).data.total_amount).toBe(100);
    expect(state.handlers.get('db:sales:getByMonth')!(null, { year: 2026, month: 10 }).data.total_amount).toBe(100);
    expect(state.handlers.get('db:sales:getPaymentBreakdown')!(null, { date: '2026-10-01' }).data[0].total).toBe(100);
  });
});
