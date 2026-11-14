// ─── Shared TypeScript interfaces ──────────────────────────────────────────────

export interface InventoryItem {
  id?: number;
  barcode: string;
  title: string;
  category: string;
  cost_price: number;
  selling_price: number;
  discount_percent: number;
  quantity: number;
  reorder_level: number;
  supplier_id?: number | null;
  supplier_name?: string;  // joined from suppliers table
  is_synced?: boolean;
  batches?: Array<{ selling_price: number; unit_cost: number; remaining_qty: number }>;
}

export interface Sale {
  id?: number;
  receipt_no: string;
  total_amount: number;
  total_cost: number;
  gross_profit: number;
  payment_type: string;
  created_at: string;
  bill_discount?: number;
  is_synced?: boolean;
}

export interface SaleItem {
  id?: number;
  sale_id: number;
  product_id: number;
  quantity: number;
  unit_cost: number;
  unit_price: number;
  discount_percent: number;
  original_price: number;
  title?: string;
  barcode?: string;
  is_synced?: boolean;
}

export interface Asset {
  id?: number;
  asset_name: string;
  cost_value: number;
  purchase_date: string;
  condition: string;
  is_synced?: boolean;
}

export interface Bill {
  id?: number;
  bill_type: string;
  title: string;
  amount: number;
  due_date: string;
  status: string;   // 'PENDING' | 'PAID'
  paid_date?: string;
  supplier_id?: number;
  is_synced?: boolean;
}

export interface Supplier {
  id?: number;
  name: string;
  phone: string;
  notes?: string;
  is_synced?: boolean;
}

export interface GRNHeader {
  id?: number;
  grn_number: string;
  supplier_id?: number | null;
  supplier_name?: string;
  received_date: string;
  payment_type: 'CASH' | 'CREDIT';
  due_date?: string | null;
  status: 'PAID' | 'PENDING';
  paid_date?: string | null;
  total_amount: number;
  notes?: string | null;
  created_at?: string;
}

export interface GRNItem {
  id?: number;
  grn_id: number;
  product_id?: number | null;
  barcode: string;
  title: string;
  received_qty: number;
  unit_cost: number;
  selling_price: number;
  total_cost: number;
}

export interface SalesAggregate {
  count: number;
  total_amount: number;
  total_cost: number;
  gross_profit: number;
}

export interface PaymentBreakdown {
  payment_type: string;
  count: number;
  total: number;
}

export interface CashbookEntry {
  id?: number | string;
  entry_date: string;
  entry_time: string;
  type: 'IN' | 'OUT';
  category: string;
  amount: number;
  description: string;
  reference_no?: string | null;
  created_at?: string;
  is_auto?: number;
}

export interface CashbookSummary {
  openingBalance: number;
  posCashSales: number;
  manualCashIn: number;
  totalCashIn: number;
  totalCashOut: number;
  netCashFlow: number;
  closingBalance: number;
  posSalesCount: number;
}

export interface RevenueAnalytics {
  summary: {
    totalRevenue: number;
    totalCost: number;
    grossProfit: number;
    profitMargin: number;
    totalItemsSold: number;
    transactionCount: number;
  };
  categoryBreakdown: Array<{
    category: string;
    itemsSold: number;
    revenue: number;
    cost: number;
    profit: number;
    margin: number;
    percentage: number;
  }>;
  items: Array<{
    productId: number;
    title: string;
    barcode: string;
    category: string;
    quantitySold: number;
    totalRevenue: number;
    totalCost: number;
    profit: number;
    avgPrice: number;
  }>;
  paymentBreakdown: Array<{
    payment_type: string;
    count: number;
    total: number;
  }>;
}

export interface UpdaterStatus {
  status: 'checking' | 'available' | 'up-to-date' | 'downloading' | 'ready' | 'error';
  info?: object;
  progress?: { percent: number; transferred: number; total: number };
  error?: string;
}

// ─── IPC bridge type ───────────────────────────────────────────────────────────

declare global {
  interface Window {
    ipcRenderer?: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      on: (channel: string, listener: (event: any, ...args: any[]) => void) => () => void;
    };
  }
}

// ─── Helper ────────────────────────────────────────────────────────────────────

async function ipc<T = any>(channel: string, payload?: object): Promise<T> {
  if (!window.ipcRenderer) {
    console.warn(`[db] Electron IPC not found (browser mode). Channel: ${channel}`);
    // Return safe empty responses for browser-mode development
    if (channel.endsWith(':getAll') || channel.endsWith(':search') || channel.endsWith(':getRecent')) {
      return { success: true, data: [] } as T;
    }
    return { success: true } as T;
  }
  const result = await (payload !== undefined
    ? window.ipcRenderer.invoke(channel, payload)
    : window.ipcRenderer.invoke(channel));
  if (channel.startsWith('db:') && result?.success === false) {
    throw new Error(result.error || 'Database operation failed');
  }
  return result;
}

// ─── Database API ──────────────────────────────────────────────────────────────

export const db = {
  // ── Inventory ────────────────────────────────────────────────────────────────
  inventory: {
    getAll: (): Promise<{ success: boolean; data?: InventoryItem[]; error?: string }> =>
      ipc('db:inventory:getAll'),

    search: (term: string): Promise<{ success: boolean; data?: InventoryItem[]; error?: string }> =>
      ipc('db:inventory:search', { term }),

    upsert: (item: Partial<InventoryItem>): Promise<{ success: boolean; id?: number; error?: string }> =>
      ipc('db:inventory:upsert', item as Record<string, unknown>),

    delete: (id: number): Promise<{ success: boolean; error?: string }> =>
      ipc('db:inventory:delete', { id }),

    bulkUpsert: (items: any[]): Promise<{ success: boolean; error?: string }> =>
      ipc('db:inventory:bulkUpsert', items),

    getServices: (): Promise<{ success: boolean; data?: InventoryItem[]; error?: string }> =>
      ipc('db:inventory:getServices'),
  },

  // ── Sales ─────────────────────────────────────────────────────────────────────
  sales: {
    search: (term: string, limit = 50, offset = 0): Promise<{ success: boolean; data?: Sale[]; hasMore?: boolean; error?: string }> =>
      ipc('db:sales:search', { term, limit, offset }),

    getRecent: (limit = 20): Promise<{ success: boolean; data?: Sale[]; error?: string }> =>
      ipc('db:sales:getRecent', { limit }),

    getByDate: (date: string): Promise<{ success: boolean; data?: SalesAggregate; error?: string }> =>
      ipc('db:sales:getByDate', { date }),

    getByMonth: (year: number, month: number): Promise<{ success: boolean; data?: SalesAggregate; error?: string }> =>
      ipc('db:sales:getByMonth', { year, month }),

    getPaymentBreakdown: (date: string): Promise<{ success: boolean; data?: PaymentBreakdown[]; error?: string }> =>
      ipc('db:sales:getPaymentBreakdown', { date }),

    delete: (id: number): Promise<{ success: boolean; error?: string }> =>
      ipc('db:sales:delete', { id }),

    update: (params: {
      id: number;
      payment_type: string;
      bill_discount?: number;
      items: Array<{
        product_id: number;
        quantity: number;
        unit_price: number;
        discount_percent?: number;
        original_price?: number;
        title: string;
        barcode: string;
      }>;
    }): Promise<{ success: boolean; error?: string }> =>
      ipc('db:sales:update', params),
  },

  // ── Sale Items ────────────────────────────────────────────────────────────────
  saleItems: {
    getBySale: (saleId: number): Promise<{ success: boolean; data?: SaleItem[]; error?: string }> =>
      ipc('db:saleItems:getBySale', { saleId }),

    getAll: (): Promise<{ success: boolean; data?: SaleItem[]; error?: string }> =>
      ipc('db:saleItems:getAll'),
  },

  // ── Suppliers ─────────────────────────────────────────────────────────────────
  suppliers: {
    getAll: (): Promise<{ success: boolean; data?: Supplier[]; error?: string }> =>
      ipc('db:suppliers:getAll'),

    upsert: (item: Partial<Supplier>): Promise<{ success: boolean; id?: number; error?: string }> =>
      ipc('db:suppliers:upsert', item as Record<string, unknown>),

    delete: (id: number): Promise<{ success: boolean; error?: string }> =>
      ipc('db:suppliers:delete', { id }),
  },

  // ── Bills ─────────────────────────────────────────────────────────────────────
  bills: {
    getAll: (): Promise<{ success: boolean; data?: Bill[]; error?: string }> =>
      ipc('db:bills:getAll'),

    getByMonth: (year: number, month: number): Promise<{ success: boolean; data?: Bill[]; error?: string }> =>
      ipc('db:bills:getByMonth', { year, month }),

    upsert: (item: Partial<Bill>): Promise<{ success: boolean; id?: number; error?: string }> =>
      ipc('db:bills:upsert', item as Record<string, unknown>),

    delete: (id: number): Promise<{ success: boolean; error?: string }> =>
      ipc('db:bills:delete', { id }),

    markPaid: (id: number, paidDate: string): Promise<{ success: boolean; error?: string }> =>
      ipc('db:bills:markPaid', { id, paidDate }),
  },

  // ── Assets ────────────────────────────────────────────────────────────────────
  assets: {
    getAll: (): Promise<{ success: boolean; data?: Asset[]; error?: string }> =>
      ipc('db:assets:getAll'),

    upsert: (item: Partial<Asset>): Promise<{ success: boolean; id?: number; error?: string }> =>
      ipc('db:assets:upsert', item as Record<string, unknown>),

    delete: (id: number): Promise<{ success: boolean; error?: string }> =>
      ipc('db:assets:delete', { id }),
  },

  // ── GRN (Goods Received Notes) ─────────────────────────────────────────────
  grn: {
    getAll: (): Promise<{ success: boolean; data?: GRNHeader[]; error?: string }> =>
      ipc('db:grn:getAll'),

    getPending: (): Promise<{ success: boolean; data?: GRNHeader[]; error?: string }> =>
      ipc('db:grn:getPending'),

    getById: (id: number): Promise<{ success: boolean; data?: { header: GRNHeader; items: GRNItem[] }; error?: string }> =>
      ipc('db:grn:getById', { id }),

    create: (payload: {
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
        selling_price: number;   // retail price for this batch
      }>;
    }): Promise<{ success: boolean; grn_id?: number; grn_number?: string; error?: string }> =>
      ipc('db:grn:create', payload),

    markPaid: (id: number, paid_date: string): Promise<{ success: boolean; error?: string }> =>
      ipc('db:grn:markPaid', { id, paid_date }),

    delete: (id: number): Promise<{ success: boolean; error?: string }> =>
      ipc('db:grn:delete', { id }),
  },

  // ── Cashbook ────────────────────────────────────────────────────────────────
  cashbook: {
    getAll: (params?: { startDate?: string; endDate?: string; type?: string; category?: string }): Promise<{ success: boolean; data?: CashbookEntry[]; error?: string }> =>
      ipc('db:cashbook:getAll', params),

    getDayTransactions: (params?: { date?: string }): Promise<{ success: boolean; data?: CashbookEntry[]; error?: string }> =>
      ipc('db:cashbook:getDayTransactions', params),

    getSummary: (params?: { date?: string }): Promise<{ success: boolean; data?: CashbookSummary; error?: string }> =>
      ipc('db:cashbook:getSummary', params),

    create: (entry: {
      entry_date?: string;
      entry_time?: string;
      type: 'IN' | 'OUT';
      category: string;
      amount: number;
      description: string;
      reference_no?: string;
    }): Promise<{ success: boolean; id?: number; error?: string }> =>
      ipc('db:cashbook:create', entry),

    update: (entry: {
      id: number;
      entry_date: string;
      entry_time?: string;
      type: 'IN' | 'OUT';
      category: string;
      amount: number;
      description: string;
      reference_no?: string;
    }): Promise<{ success: boolean; error?: string }> =>
      ipc('db:cashbook:update', entry),

    delete: (id: number): Promise<{ success: boolean; error?: string }> =>
      ipc('db:cashbook:delete', { id }),
  },

  // ── Settings ──────────────────────────────────────────────────────────────────
  settings: {

    get: (key: string, defaultValue = ''): Promise<{ success: boolean; value: string }> =>
      ipc('db:settings:get', { key, defaultValue }),

    set: (key: string, value: string): Promise<{ success: boolean }> =>
      ipc('db:settings:set', { key, value }),
  },

  // ── Atomic checkout ───────────────────────────────────────────────────────────
  executeCheckout: (params: {
    requestId: string;
    totalAmount: number;
    totalCost: number;
    grossProfit: number;
    paymentType: string;
    createdAt: string;
    items: any[];
    billDiscount?: number;
  }): Promise<{ success: boolean; saleId?: number; receiptNo?: string; error?: string }> => {
    if (!window.ipcRenderer) return Promise.resolve({ success: true, saleId: Date.now(), receiptNo: `REC-${Date.now()}` });
    return window.ipcRenderer.invoke('execute-checkout', params);
  },

  // ── Reports & Revenue Analytics ──────────────────────────────────────────────
  reports: {
    getRevenueAnalytics: (params?: {
      startDate?: string;
      endDate?: string;
      category?: string;
      paymentType?: string;
      search?: string;
    }): Promise<{ success: boolean; data?: RevenueAnalytics; error?: string }> =>
      ipc('db:reports:getRevenueAnalytics', params),
  },

  // ── Backup / Restore ──────────────────────────────────────────────────────────
  backup: (): Promise<{ success: boolean; filePath?: string; error?: string; cancelled?: boolean }> =>
    ipc('db-backup'),

  restore: (): Promise<{ success: boolean; filePath?: string; error?: string; cancelled?: boolean }> =>
    ipc('db-restore'),

  getBackupSettings: (): Promise<{ folderPath: string; autoBackupOnClose: boolean; lastBackupTime: string; lastBackupFile: string }> =>
    ipc('get-backup-settings'),

  selectBackupFolder: (): Promise<{ success: boolean; folderPath?: string; cancelled?: boolean }> =>
    ipc('select-backup-folder'),

  saveBackupSettings: (settings: { folderPath?: string; autoBackupOnClose?: boolean }): Promise<{ success: boolean }> =>
    ipc('save-backup-settings', settings),

  executeCloudBackup: (): Promise<{ success: boolean; filePath?: string; timestamp?: string; error?: string }> =>
    ipc('execute-cloud-backup'),

  // ── Auto Updater ──────────────────────────────────────────────────────────────
  updater: {
    check: (): Promise<{ success: boolean; error?: string }> =>
      ipc('updater:check'),

    install: (): Promise<{ success: boolean }> =>
      ipc('updater:install'),

    onStatus: (cb: (status: UpdaterStatus) => void): (() => void) => {
      if (!window.ipcRenderer) return () => {};
      return window.ipcRenderer.on('updater:status', (_event, payload) => cb(payload));
    },
  },
};
