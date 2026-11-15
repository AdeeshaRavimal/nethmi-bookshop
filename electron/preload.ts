import { contextBridge, ipcRenderer } from 'electron';

/**
 * Whitelist of IPC channels the renderer is allowed to call.
 * Any invoke() call with a channel NOT in this list will be silently blocked.
 * This prevents a compromised renderer from executing arbitrary operations.
 */
const ALLOWED_CHANNELS = new Set([
  // ── Named database operations (replaces raw sql-* channels) ─────────────
  'db:inventory:getAll',
  'db:inventory:search',
  'db:inventory:upsert',
  'db:inventory:delete',
  'db:inventory:bulkUpsert',
  'db:inventory:getServices',

  'db:sales:getRecent',
  'db:sales:search',
  'db:sales:getByDate',
  'db:sales:getByMonth',
  'db:sales:getPaymentBreakdown',
  'db:sales:delete',
  'db:sales:update',

  'db:saleItems:getBySale',
  'db:saleItems:getAll',

  'db:suppliers:getAll',
  'db:suppliers:upsert',
  'db:suppliers:delete',

  'db:bills:getAll',
  'db:bills:getByMonth',
  'db:bills:upsert',
  'db:bills:delete',
  'db:bills:markPaid',

  'db:assets:getAll',
  'db:assets:upsert',
  'db:assets:delete',

  'db:settings:get',
  'db:settings:set',

  'db:grn:getAll',
  'db:grn:getPending',
  'db:grn:getById',
  'db:grn:create',
  'db:grn:markPaid',
  'db:grn:delete',

  'db:cashbook:getAll',
  'db:cashbook:getDayTransactions',
  'db:cashbook:getSummary',
  'db:cashbook:create',
  'db:cashbook:update',
  'db:cashbook:delete',

  'db:reports:getRevenueAnalytics',

  // ── Atomic operations ────────────────────────────────────────────────────
  'execute-checkout',

  // ── Backup / restore ─────────────────────────────────────────────────────
  'db-backup',
  'db-restore',
  'get-backup-settings',
  'select-backup-folder',
  'save-backup-settings',
  'execute-cloud-backup',

  // ── Auto-updater ─────────────────────────────────────────────────────────
  'updater:check',
  'updater:install',

  // ── Credit Customers ─────────────────────────────────────────────────────
  'db:credit:getCustomers',
  'db:credit:searchCustomers',
  'db:credit:createCustomer',
  'db:credit:updateCustomer',
  'db:credit:deleteCustomer',
  'db:credit:getCustomerLedger',
  'db:credit:recordPayment',
]);

/** Channels the main process is allowed to push to the renderer. */
const ALLOWED_PUSH_CHANNELS = new Set([
  'updater:status',   // { status: 'checking'|'available'|'downloading'|'ready'|'error', info?, progress?, error? }
]);

contextBridge.exposeInMainWorld('ipcRenderer', {
  invoke: (channel: string, ...args: any[]) => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      console.warn(`[preload] Blocked unauthorized IPC invoke: "${channel}"`);
      return Promise.resolve({ success: false, error: `Unauthorized channel: ${channel}` });
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  on: (channel: string, listener: (event: any, ...args: any[]) => void) => {
    if (!ALLOWED_PUSH_CHANNELS.has(channel)) {
      console.warn(`[preload] Blocked unauthorized IPC on: "${channel}"`);
      return () => {};
    }
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
