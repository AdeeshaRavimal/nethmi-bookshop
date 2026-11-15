import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  initPragmasAndSchema,
  CURRENT_SCHEMA_VERSION,
} from '../../electron/database';

describe('Cashbook Database & Calculations', () => {
  let memDb: Database.Database;

  beforeEach(() => {
    memDb = new Database(':memory:');
    initPragmasAndSchema(memDb);
  });

  afterEach(() => {
    memDb.close();
  });

  it('creates cashbook_entries table with current schema version', () => {
    const row = memDb.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number };
    expect(row.version).toBe(CURRENT_SCHEMA_VERSION);

    const table = memDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cashbook_entries'")
      .get();
    expect(table).toBeDefined();
  });

  it('inserts and retrieves manual cash in and cash out entries', () => {
    const insert = memDb.prepare(`
      INSERT INTO cashbook_entries (entry_date, entry_time, type, category, amount, description, reference_no)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run('2026-11-14', '09:00:00', 'IN', 'CAPITAL', 5000, 'Starting cash drawer float', 'FLOAT-01');
    insert.run('2026-11-14', '11:30:00', 'OUT', 'EXPENSE', 350, 'Tea and snacks', null);

    const rows = memDb.prepare('SELECT * FROM cashbook_entries WHERE entry_date = ? ORDER BY id ASC').all('2026-11-14') as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].type).toBe('IN');
    expect(rows[0].amount).toBe(5000);
    expect(rows[0].reference_no).toBe('FLOAT-01');

    expect(rows[1].type).toBe('OUT');
    expect(rows[1].amount).toBe(350);
  });

  it('updates and deletes cashbook entries', () => {
    const insert = memDb.prepare(`
      INSERT INTO cashbook_entries (entry_date, entry_time, type, category, amount, description, reference_no)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = insert.run('2026-11-14', '10:00:00', 'OUT', 'EXPENSE', 100, 'Paper rolls', null);
    const entryId = info.lastInsertRowid;

    memDb.prepare(`
      UPDATE cashbook_entries SET amount = ?, description = ? WHERE id = ?
    `).run(150, 'Paper rolls & toner', entryId);

    const updated = memDb.prepare('SELECT * FROM cashbook_entries WHERE id = ?').get(entryId) as any;
    expect(updated.amount).toBe(150);
    expect(updated.description).toBe('Paper rolls & toner');

    memDb.prepare('DELETE FROM cashbook_entries WHERE id = ?').run(entryId);
    const deleted = memDb.prepare('SELECT * FROM cashbook_entries WHERE id = ?').get(entryId);
    expect(deleted).toBeUndefined();
  });

  it('calculates opening balance from prior days and computes closing balance accurately', () => {
    // Prior day 1: 2026-11-13
    // Prior POS Cash Sale
    memDb.prepare(`
      INSERT INTO sales (receipt_no, total_amount, total_cost, gross_profit, payment_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('REC-P1', 2500, 1500, 1000, 'CASH', '2026-11-13T10:00:00.000Z');

    // Prior Manual Cash In & Out
    const insertCb = memDb.prepare(`
      INSERT INTO cashbook_entries (entry_date, entry_time, type, category, amount, description, reference_no)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertCb.run('2026-11-13', '08:30:00', 'IN', 'CAPITAL', 1000, 'Capital float', null);
    insertCb.run('2026-11-13', '17:00:00', 'OUT', 'EXPENSE', 200, 'Cleaning supplies', null);

    // Target day: 2026-11-14
    // Target day POS Cash Sale
    memDb.prepare(`
      INSERT INTO sales (receipt_no, total_amount, total_cost, gross_profit, payment_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('REC-T1', 3200, 2000, 1200, 'CASH', '2026-11-14T11:00:00.000Z');
    // Target day Card Sale (should NOT affect cashbook)
    memDb.prepare(`
      INSERT INTO sales (receipt_no, total_amount, total_cost, gross_profit, payment_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('REC-T2', 1800, 1000, 800, 'CARD', '2026-11-14T12:00:00.000Z');

    // Target day manual transactions
    insertCb.run('2026-11-14', '09:00:00', 'IN', 'SERVICE_INCOME', 500, 'Photocopy service cash', null);
    insertCb.run('2026-11-14', '15:00:00', 'OUT', 'EXPENSE', 150, 'Tea', null);

    // Opening Balance check: Prior sales (2500) + prior cash in (1000) - prior cash out (200) = 3300
    const startDay = '2026-11-14T00:00:00.000Z';
    const priorSales = (memDb.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales WHERE payment_type = 'CASH' AND created_at < ?
    `).get(startDay) as any).total;

    const priorManual = (memDb.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'IN' THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN type = 'OUT' THEN amount ELSE 0 END), 0) AS net
      FROM cashbook_entries WHERE entry_date < ?
    `).get('2026-11-14') as any).net;

    const openingBalance = priorSales + priorManual;
    expect(openingBalance).toBe(3300);

    // Today's POS cash sales
    const endDay = '2026-11-15T00:00:00.000Z';
    const todayPosSales = (memDb.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales WHERE payment_type = 'CASH' AND created_at >= ? AND created_at < ?
    `).get(startDay, endDay) as any).total;
    expect(todayPosSales).toBe(3200);

    // Today's Manual cash in & out
    const todayManual = memDb.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'IN' THEN amount ELSE 0 END), 0) AS cash_in,
        COALESCE(SUM(CASE WHEN type = 'OUT' THEN amount ELSE 0 END), 0) AS cash_out
      FROM cashbook_entries WHERE entry_date = ?
    `).get('2026-11-14') as any;

    expect(todayManual.cash_in).toBe(500);
    expect(todayManual.cash_out).toBe(150);

    const totalCashIn = todayPosSales + todayManual.cash_in; // 3200 + 500 = 3700
    const totalCashOut = todayManual.cash_out; // 150
    const netFlow = totalCashIn - totalCashOut; // 3550
    const closingBalance = openingBalance + netFlow; // 3300 + 3550 = 6850

    expect(totalCashIn).toBe(3700);
    expect(totalCashOut).toBe(150);
    expect(netFlow).toBe(3550);
    expect(closingBalance).toBe(6850);
  });
});
