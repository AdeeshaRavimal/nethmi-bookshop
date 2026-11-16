import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

function validateBackup(candidate: Database.Database) {
  const result = candidate.pragma('integrity_check') as Array<{ integrity_check: string }>;
  if (result.length !== 1 || result[0].integrity_check !== 'ok') throw new Error('Backup integrity check failed');
  const required: Record<string, string[]> = {
    inventory: ['id', 'barcode', 'title', 'category', 'cost_price', 'selling_price', 'discount_percent', 'quantity', 'supplier_id'],
    sales: ['id', 'receipt_no', 'total_amount', 'total_cost', 'gross_profit', 'payment_type', 'created_at'],
    sale_items: ['id', 'sale_id', 'product_id', 'quantity', 'unit_cost', 'unit_price', 'discount_percent', 'original_price'],
    suppliers: ['id', 'name', 'phone', 'notes'], bills: ['id', 'bill_type', 'title', 'amount', 'due_date', 'status', 'paid_date'],
    assets: ['id', 'asset_name', 'cost_value', 'purchase_date', 'condition'], settings: ['key', 'value'],
  };
  for (const [table, columns] of Object.entries(required)) {
    const existing = new Set((candidate.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(c => c.name));
    if (columns.some(column => !existing.has(column))) throw new Error('This file is not a compatible bookshop backup');
  }
  const hasVersion = candidate.prepare("SELECT name FROM sqlite_master WHERE name = 'schema_version'").get();
  if (hasVersion) {
    const row = candidate.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined;
    if (row && row.version > 13) throw new Error('Backup requires a newer application version');
  }
  if (candidate.pragma('foreign_key_check').length) throw new Error('Backup has invalid record references');
}

export async function replaceDatabaseFromBackup(
  current: Database.Database, destination: string, source: string,
  initialize: (instance: Database.Database) => void,
  recover: (instance: Database.Database) => void,
): Promise<Database.Database> {
  if (path.resolve(source).toLowerCase() === path.resolve(destination).toLowerCase()) throw new Error('Choose a backup file, not the active database');
  const stage = destination + '.restore-' + randomUUID();
  const recovery = destination + '.before-restore-' + randomUUID() + '.sqlite';
  let candidate: Database.Database | undefined;
  let replacement: Database.Database | undefined;
  let closed = false;
  let moved = false;
  try {
    candidate = new Database(source, { readonly: true, fileMustExist: true });
    validateBackup(candidate);
    await candidate.backup(stage);
    candidate.close();
    candidate = new Database(stage);
    initialize(candidate);
    validateBackup(candidate);
    candidate.close();
    candidate = undefined;
    current.close();
    closed = true;
    fs.renameSync(destination, recovery);
    moved = true;
    fs.renameSync(stage, destination);
    replacement = new Database(destination);
    initialize(replacement);
    return replacement;
  } catch (error) {
    if (closed) {
      if (replacement?.open) replacement.close();
      if (moved) {
        for (const suffix of ['', '-wal', '-shm']) {
          if (fs.existsSync(destination + suffix)) fs.unlinkSync(destination + suffix);
        }
        fs.renameSync(recovery, destination);
      }
      const restored = new Database(destination);
      initialize(restored);
      recover(restored);
    }
    throw error;
  } finally {
    if (candidate?.open) candidate.close();
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(stage + suffix)) fs.unlinkSync(stage + suffix);
    }
  }
}
