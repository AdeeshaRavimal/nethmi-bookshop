import { describe, it, expect, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { addCartItem } from '../utils/cart';
import { calculateCartTotals } from '../utils/checkout';
import { localDayRange, localMonthRange, localDateString } from '../utils/dates';
import { initPragmasAndSchema } from '../../electron/database';
import { executeCheckout } from '../../electron/checkout';
import { replaceDatabaseFromBackup } from '../../electron/restore';

const opened: Database.Database[] = [];
const folders: string[] = [];
const open = (name = ':memory:') => { const db = new Database(name); opened.push(db); initPragmasAndSchema(db); return db; };
const directory = () => { const p = fs.mkdtempSync(path.join(process.cwd(), 'restore-test-')); folders.push(p); return p; };
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
  vi.unstubAllGlobals();
});
const item = { barcode: 'SRV-RELOAD', title: 'Reload A', selling_price: 100, cost_price: 100, quantity: 1, stock_limit: 999999 };

describe('Regression fixes', () => {
  it('allows different prices of one product in the cart with independent stock limits', () => {
    const old = { id: 1, barcode: 'BOOK', title: 'Book', selling_price: 100, original_price: 100,
      cost_price: 50, quantity: 5, stock_limit: 5 };
    const newer = { ...old, selling_price: 120, original_price: 120, quantity: 2, stock_limit: 2 };
    const cart = addCartItem(addCartItem([], old), newer);
    expect(cart).toHaveLength(2);
    expect(cart.map(line => line.quantity)).toEqual([5, 2]);
    expect(addCartItem(cart, { ...newer, quantity: 1 })).toBe(cart);
  });
  it('keeps differently priced reloads and descriptions separate', () => {
    let cart = addCartItem([], item);
    cart = addCartItem(cart, { ...item, selling_price: 500, cost_price: 500 });
    expect(calculateCartTotals(cart).totalAmount).toBe(600);
    expect(cart).toHaveLength(2);
    cart = addCartItem(cart, { ...item, title: 'Reload B' });
    expect(cart).toHaveLength(3);
    expect(new Set(cart.map(i => i.lineId)).size).toBe(3);
    cart = addCartItem(cart, item);
    expect(cart[0].quantity).toBe(2);
  });

  it('records a retry only once and preserves sold descriptions', () => {
    const db = open();
    const params = { requestId: 'retry-1', paymentType: 'CASH', items: [{ ...item, title: 'Reload 0771234567' }] };
    const first = executeCheckout(db, params);
    expect(executeCheckout(db, params)).toEqual(first);
    expect(db.prepare('SELECT COUNT(*) AS n FROM sales').get()).toEqual({ n: 1 });
    db.prepare("UPDATE inventory SET title = 'Changed title' WHERE barcode = 'SRV-RELOAD'").run();
    expect(db.prepare('SELECT title FROM sale_items').get()).toEqual({ title: 'Reload 0771234567' });
  });

  it('rolls back the entire sale when stock is insufficient, including earlier lines', () => {
    const db = open();
    const product = db.prepare("INSERT INTO inventory (barcode, title, category, cost_price, selling_price, quantity) VALUES ('BOOK-1', 'Book', 'BOOK', 50, 100, 1)").run();
    const line = { ...item, id: Number(product.lastInsertRowid), barcode: 'BOOK-1', title: 'Book' };
    expect(() => executeCheckout(db, { requestId: 'no-stock', paymentType: 'CASH', items: [line, line] })).toThrow('Insufficient stock');
    expect(db.prepare('SELECT quantity FROM inventory WHERE id = ?').get(line.id)).toEqual({ quantity: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM sales').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM sale_items').get()).toEqual({ n: 0 });
  });

  it('does not link custom services to laminating', () => {
    const db = open();
    executeCheckout(db, { requestId: 'custom', paymentType: 'CARD', items: [{ ...item, barcode: 'SRV-CUSTOM', title: 'Spiral Binding' }] });
    expect(db.prepare('SELECT si.title, i.barcode FROM sale_items si JOIN inventory i ON i.id = si.product_id').get()).toEqual({ title: 'Spiral Binding', barcode: 'SRV-CUSTOM' });
  });

  it('rejects malformed checkout quantities', () => {
    const db = open();
    expect(() => executeCheckout(db, { requestId: 'bad', paymentType: 'CASH', items: [{ ...item, quantity: -1 }] })).toThrow('Invalid checkout item');
  });

  it('uses local calendar boundaries with an exclusive next-day/month end', () => {
    const date = new Date(2026, 9, 1, 1);
    const [dayStart, dayEnd] = localDayRange('2026-10-01');
    const [monthStart, monthEnd] = localMonthRange(2026, 10);
    expect(date.toISOString() >= dayStart && date.toISOString() < dayEnd).toBe(true);
    expect(date.toISOString() >= monthStart && date.toISOString() < monthEnd).toBe(true);
    expect(new Date(dayStart).getHours()).toBe(0);
    expect(localDateString(new Date(dayEnd))).toBe('2026-10-02');
    expect(localDateString(new Date(monthEnd))).toBe('2026-11-01');
    expect(() => localDayRange('2026-02-30')).toThrow();
  });

  it('leaves the current database usable when a corrupt or unrelated backup is selected', async () => {
    const folder = directory(); const destination = path.join(folder, 'live.sqlite'); const db = open(destination);
    db.prepare("INSERT INTO settings VALUES ('marker', 'live')").run();
    const bad = path.join(folder, 'bad.sqlite'); fs.writeFileSync(bad, 'not sqlite');
    await expect(replaceDatabaseFromBackup(db, destination, bad, initPragmasAndSchema, () => {})).rejects.toThrow();
    const unrelated = path.join(folder, 'unrelated.sqlite'); const other = new Database(unrelated); other.exec('CREATE TABLE unrelated (id INTEGER)'); other.close();
    await expect(replaceDatabaseFromBackup(db, destination, unrelated, initPragmasAndSchema, () => {})).rejects.toThrow('compatible');
    expect(db.prepare("SELECT value FROM settings WHERE key = 'marker'").get()).toEqual({ value: 'live' });
  });

  it('restores a validated backup and keeps the prior database as a recovery file', async () => {
    const folder = directory(); const destination = path.join(folder, 'live.sqlite'); const source = path.join(folder, 'backup.sqlite');
    const db = open(destination); db.prepare("INSERT INTO settings VALUES ('marker', 'live')").run();
    const backup = open(source); backup.prepare("INSERT INTO settings VALUES ('marker', 'backup')").run();
    const restored = await replaceDatabaseFromBackup(db, destination, source, initPragmasAndSchema, () => {}); opened.push(restored);
    expect(restored.prepare("SELECT value FROM settings WHERE key = 'marker'").get()).toEqual({ value: 'backup' });
    const recoveryFile = fs.readdirSync(folder).find(file => file.includes('.before-restore-'))!;
    const recovery = new Database(path.join(folder, recoveryFile)); opened.push(recovery);
    expect(recovery.prepare("SELECT value FROM settings WHERE key = 'marker'").get()).toEqual({ value: 'live' });
  });

  it('reopens the original database if opening the replacement fails', async () => {
    const folder = directory(); const destination = path.join(folder, 'live.sqlite'); const source = path.join(folder, 'backup.sqlite');
    const db = open(destination); db.prepare("INSERT INTO settings VALUES ('marker', 'live')").run(); open(source);
    let calls = 0; let recovered: Database.Database | undefined;
    await expect(replaceDatabaseFromBackup(db, destination, source, instance => {
      if (++calls === 2) throw new Error('simulated replacement failure');
      initPragmasAndSchema(instance);
    }, instance => { recovered = instance; opened.push(instance); })).rejects.toThrow('simulated replacement failure');
    expect(recovered!.prepare("SELECT value FROM settings WHERE key = 'marker'").get()).toEqual({ value: 'live' });
  });

  it('rejects failed database operations through the shared bridge', async () => {
    vi.stubGlobal('window', { ipcRenderer: { invoke: async () => ({ success: false, error: 'Duplicate barcode' }) } });
    const { db } = await import('../db');
    await expect(db.inventory.upsert({ title: 'Book' })).rejects.toThrow('Duplicate barcode');
    await expect(db.bills.markPaid(1, '2026-10-01')).rejects.toThrow('Duplicate barcode');
  });

  it('correctly applies custom bill discount to total amount and gross profit', () => {
    const db = open();
    // item has selling_price 100, cost_price 100. Let's use an item with profit
    const saleItem = { barcode: 'SRV-BOOK', title: 'Notebook', selling_price: 350, cost_price: 200, quantity: 2, stock_limit: 999999 };
    // Subtotal: 700, Cost: 400, Raw Profit: 300
    // Discount: 50 -> Net Total: 650, Net Profit: 250
    const res = executeCheckout(db, {
      requestId: 'disc-1',
      paymentType: 'CASH',
      items: [saleItem],
      billDiscount: 50,
    });
    expect(res.totalAmount).toBe(650);
    expect(res.billDiscount).toBe(50);

    const saleRow = db.prepare('SELECT total_amount, gross_profit, bill_discount FROM sales WHERE id = ?').get(res.saleId) as any;
    expect(saleRow.total_amount).toBe(650);
    expect(saleRow.gross_profit).toBe(250);
    expect(saleRow.bill_discount).toBe(50);
  });

  it('safely clamps bill discount if discount exceeds subtotal or is negative', () => {
    const db = open();
    const saleItem = { barcode: 'SRV-PEN', title: 'Pen', selling_price: 100, cost_price: 60, quantity: 1, stock_limit: 999999 };
    // Exceeds subtotal: 150 discount on 100 subtotal -> clamps to 100
    const res1 = executeCheckout(db, {
      requestId: 'disc-excess',
      paymentType: 'CASH',
      items: [saleItem],
      billDiscount: 150,
    });
    expect(res1.totalAmount).toBe(0);
    expect(res1.billDiscount).toBe(100);

    // Negative discount -> ignored (0)
    const res2 = executeCheckout(db, {
      requestId: 'disc-neg',
      paymentType: 'CARD',
      items: [saleItem],
      billDiscount: -20,
    });
    expect(res2.totalAmount).toBe(100);
    expect(res2.billDiscount).toBe(0);
  });
});
