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

  it('includes customer credit debt collections in cashbook daily transactions and cash in', () => {
    // Insert a credit customer
    memDb.prepare(`
      INSERT INTO credit_customers (id, name, phone, total_outstanding)
      VALUES (?, ?, ?, ?)
    `).run(1, 'Kannangara', '0724207000', 1000);

    // Customer settles 600 via recordPayment
    const targetDate = '2026-11-16';
    const nowIso = '2026-11-16T10:30:00.000Z';
    memDb.prepare(`
      INSERT INTO credit_payments (customer_id, amount, payment_type, notes, payment_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(1, 600, 'PAYMENT', 'Settled part of debt', targetDate, nowIso);

    // Query for customer collections matching target date
    const custCollections = memDb.prepare(`
      SELECT cp.id, cp.amount, cp.notes, cp.created_at, c.name AS customer_name
      FROM credit_payments cp
      LEFT JOIN credit_customers c ON c.id = cp.customer_id
      WHERE cp.payment_type = 'PAYMENT'
        AND (
          cp.payment_date = ?
          OR SUBSTR(cp.created_at, 1, 10) = ?
        )
    `).all(targetDate, targetDate) as any[];

    expect(custCollections).toHaveLength(1);
    expect(custCollections[0].amount).toBe(600);
    expect(custCollections[0].customer_name).toBe('Kannangara');

    // Customer debt collections total sum
    const custSum = (memDb.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total_customer_cash
      FROM credit_payments
      WHERE payment_type = 'PAYMENT'
        AND (
          payment_date = ?
          OR SUBSTR(created_at, 1, 10) = ?
        )
    `).get(targetDate, targetDate) as any).total_customer_cash;

    expect(custSum).toBe(600);
  });

  it('records and retrieves daily shift closing and Z-Report drawer reconciliation', () => {
    const table = memDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='daily_closings'")
      .get();
    expect(table).toBeDefined();

    const denominations = JSON.stringify({
      n5000: 5,
      n1000: 10,
      n500: 8,
      n100: 20,
      n50: 10,
      n20: 15,
      coins: 180,
    }); // 25000 + 10000 + 4000 + 2000 + 500 + 300 + 180 = 41980

    memDb.prepare(`
      INSERT INTO daily_closings (
        closing_date, expected_cash, counted_cash, difference,
        denominations_json, notes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      '2026-11-16', 41980, 41980, 0,
      denominations, 'Shift closed accurately without variance'
    );

    const record = memDb.prepare('SELECT * FROM daily_closings WHERE closing_date = ?').get('2026-11-16') as any;
    expect(record).toBeDefined();
    expect(record.expected_cash).toBe(41980);
    expect(record.counted_cash).toBe(41980);
    expect(record.difference).toBe(0);
    expect(JSON.parse(record.denominations_json).n5000).toBe(5);
  });
});
