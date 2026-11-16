import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initPragmasAndSchema } from '../../electron/database';

describe('Security & Fraud Prevention System', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initPragmasAndSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('initializes with default security settings if not set', () => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('manager_security_pin') as { value: string } | undefined;
    expect(row).toBeUndefined(); // default in frontend is '1234'
  });

  it('stores and updates manager security PIN safely', () => {
    // Set PIN
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('manager_security_pin', '5821');

    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('manager_security_pin') as { value: string };
    expect(row).toBeDefined();
    expect(row.value).toBe('5821');

    // Update PIN
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('manager_security_pin', '9988');
    const updated = db.prepare('SELECT value FROM settings WHERE key = ?').get('manager_security_pin') as { value: string };
    expect(updated.value).toBe('9988');
  });

  it('stores and retrieves security config toggles', () => {
    const config = {
      requireForInventory: true,
      requireForReports: true,
      requireForCashbook: true,
      requireForSuppliers: true,
      requireForAssets: false,
      requireForMarketing: false,
      requireForGRN: true,
      requireForBills: true,
      requireForReturns: true,
      requireForBackup: true,
      autoLockMinutes: 10,
    };

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('manager_security_config', JSON.stringify(config));

    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('manager_security_config') as { value: string };
    expect(row).toBeDefined();
    const parsed = JSON.parse(row.value);
    expect(parsed.requireForInventory).toBe(true);
    expect(parsed.requireForAssets).toBe(false);
    expect(parsed.autoLockMinutes).toBe(10);
  });
});
