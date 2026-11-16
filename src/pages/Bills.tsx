import { useState, useEffect, useMemo, useCallback } from 'react';
import { db, type GRNHeader, type GRNItem, type Supplier } from '../db';
import { localDateString } from '../utils/dates';
import { useToast } from '../components/Toast';
import { Skeleton, EmptyState } from '../components/Skeleton';
import {
  CreditCard,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Search,
  Eye,
  X,
  Printer,
  Building2,
  CalendarClock,
  FileText,
  RefreshCw,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtRs = (n: number) =>
  `Rs. ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return d;
};

const isOverdue = (dueDate?: string | null, status?: string) => {
  if (status !== 'PENDING' || !dueDate) return false;
  return dueDate < localDateString();
};

const getDaysInFuture = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDateString(d);
};

export default function Bills() {
  const toast = useToast();

  // ── Credit GRN Invoices State ─────────────────────────────────────────────
  const [grnList, setGrnList] = useState<GRNHeader[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'DUE_SOON' | 'OVERDUE' | 'PAID'>('PENDING');
  const [supplierFilter, setSupplierFilter] = useState('ALL');

  // Modals
  const [viewGrnId, setViewGrnId] = useState<number | null>(null);
  const [viewGrnData, setViewGrnData] = useState<{ header: GRNHeader; items: GRNItem[] } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const [payingGrn, setPayingGrn] = useState<GRNHeader | null>(null);
  const [payDate, setPayDate] = useState(() => localDateString());
  const [logInCashbook, setLogInCashbook] = useState(true);

  // ── Data Fetching ─────────────────────────────────────────────────────────

  const fetchGrns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await db.grn.getAll();
      const allGrns = res.data ?? [];
      // Strictly Credit GRN invoices
      const creditOnly = allGrns.filter((g) => g.payment_type === 'CREDIT');
      setGrnList(creditOnly);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to load credit GRNs');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await db.suppliers.getAll();
      setSuppliers(res.data ?? []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchGrns();
    fetchSuppliers();
  }, [fetchGrns, fetchSuppliers]);

  // Load GRN items modal
  useEffect(() => {
    if (!viewGrnId) {
      setViewGrnData(null);
      return;
    }
    setViewLoading(true);
    db.grn.getById(viewGrnId)
      .then((res) => {
        if (res.success && res.data) {
          setViewGrnData(res.data);
        }
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to fetch GRN details');
      })
      .finally(() => setViewLoading(false));
  }, [viewGrnId, toast]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleOpenPayModal = (grn: GRNHeader) => {
    setPayingGrn(grn);
    setPayDate(localDateString());
    setLogInCashbook(true);
  };

  const handleConfirmPayGrn = async () => {
    if (!payingGrn || !payingGrn.id) return;
    try {
      // 1. Mark GRN as paid in database
      await db.grn.markPaid(payingGrn.id, payDate);

      // 2. Optionally record payment in Cashbook as Cash Out
      if (logInCashbook) {
        await db.cashbook.create({
          entry_date: payDate,
          type: 'OUT',
          category: 'SUPPLIER_PAYMENT',
          amount: payingGrn.total_amount,
          description: `Paid Credit GRN ${payingGrn.grn_number} to ${payingGrn.supplier_name || 'Distributor'}`,
          reference_no: payingGrn.grn_number,
        });
      }

      toast.success(
        `Invoice ${payingGrn.grn_number} marked as PAID${logInCashbook ? ' and logged in Cashbook' : ''}.`
      );
      setPayingGrn(null);
      fetchGrns();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to update payment status');
    }
  };

  // ── Calculations & Filtering ──────────────────────────────────────────────

  const next7DaysStr = useMemo(() => getDaysInFuture(7), []);

  const totalOutstandingCredit = useMemo(() => {
    return grnList
      .filter((g) => g.status === 'PENDING')
      .reduce((sum, g) => sum + g.total_amount, 0);
  }, [grnList]);

  const overdueInvoices = useMemo(() => {
    return grnList.filter((g) => isOverdue(g.due_date, g.status));
  }, [grnList]);

  const overdueTotal = useMemo(() => {
    return overdueInvoices.reduce((sum, g) => sum + g.total_amount, 0);
  }, [overdueInvoices]);

  const dueSoonInvoices = useMemo(() => {
    const today = localDateString();
    return grnList.filter(
      (g) =>
        g.status === 'PENDING' &&
        g.due_date &&
        g.due_date >= today &&
        g.due_date <= next7DaysStr
    );
  }, [grnList, next7DaysStr]);

  const dueSoonTotal = useMemo(() => {
    return dueSoonInvoices.reduce((sum, g) => sum + g.total_amount, 0);
  }, [dueSoonInvoices]);

  const totalPaidCredit = useMemo(() => {
    return grnList
      .filter((g) => g.status === 'PAID')
      .reduce((sum, g) => sum + g.total_amount, 0);
  }, [grnList]);

  const filteredGrns = useMemo(() => {
    const today = localDateString();

    return grnList.filter((g) => {
      // Status filter
      if (statusFilter === 'PENDING' && g.status !== 'PENDING') return false;
      if (statusFilter === 'PAID' && g.status !== 'PAID') return false;
      if (statusFilter === 'OVERDUE' && (!isOverdue(g.due_date, g.status) || g.status !== 'PENDING')) return false;
      if (statusFilter === 'DUE_SOON') {
        if (g.status !== 'PENDING') return false;
        if (!g.due_date || g.due_date < today || g.due_date > next7DaysStr) return false;
      }

      // Supplier filter
      if (supplierFilter !== 'ALL' && String(g.supplier_id) !== supplierFilter) {
        return false;
      }

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const grnNum = (g.grn_number || '').toLowerCase();
        const supp = (g.supplier_name || '').toLowerCase();
        const notes = (g.notes || '').toLowerCase();
        if (!grnNum.includes(q) && !supp.includes(q) && !notes.includes(q)) return false;
      }

      return true;
    });
  }, [grnList, statusFilter, supplierFilter, search, next7DaysStr]);

  const selectedSupplierName = supplierFilter === 'ALL'
    ? 'All Suppliers & Distributors'
    : (suppliers.find(s => String(s.id) === supplierFilter)?.name || 'Selected Supplier');

  const selectedStatusName = statusFilter === 'ALL'
    ? 'All Invoices'
    : statusFilter === 'PENDING'
      ? 'Pending (Unpaid) Only'
      : statusFilter === 'OVERDUE'
        ? 'Overdue Invoices Only'
        : statusFilter === 'DUE_SOON'
          ? 'Due in Next 7 Days'
          : 'Settled (Paid) Only';

  const filteredTotal = filteredGrns.reduce((s, g) => s + g.total_amount, 0);

  return (
    <div className="p-6 lg:p-8 h-full flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950 space-y-4 print:p-0 print:space-y-3 print:overflow-visible print:bg-white">
      {/* ── Top Header Bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-center gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900/50">
              <CreditCard className="w-4 h-4" />
            </div>
            <span>Credit GRN Invoices</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage distributor credit purchases, payment due dates, and settlements
          </p>
        </div>

        {/* Top Summary & Actions */}
        <div className="flex items-center gap-2.5">
          <div className="bg-white dark:bg-slate-900 px-3.5 py-1.5 rounded-lg shadow-2xs border border-slate-200/90 dark:border-slate-800/90 text-xs font-mono">
            <span className="text-slate-500 dark:text-slate-400 font-sans">Total Credit Payable: </span>
            <span className="font-bold text-rose-600 dark:text-rose-400 ml-1 tabular-nums">
              {fmtRs(totalOutstandingCredit)}
            </span>
          </div>

          <button
            onClick={() => fetchGrns()}
            title="Refresh list"
            className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => window.print()}
            title="Print credit statement"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print Sheet</span>
          </button>
        </div>
      </div>

      {/* ── Printable Header ────────────────────────────────────────────────────── */}
      <div className="hidden print:block mb-4 p-4 border-b-2 border-slate-800 bg-white text-slate-900">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">HIRU BOOKSHOP & COMMUNICATION</h1>
            <p className="text-xs text-slate-600 font-medium">Distributor Credit GRN Invoices & Supplier Payables Statement</p>
            <p className="text-[10px] text-slate-500 mt-1">
              Supplier: <strong className="text-slate-900">{selectedSupplierName}</strong> &bull; Status Filter: <strong className="text-slate-900">{selectedStatusName}</strong> &bull; Showing {filteredGrns.length} invoice(s)
            </p>
          </div>
          <div className="text-right text-xs text-slate-600">
            <p className="font-mono font-bold text-slate-900">ACCOUNTS PAYABLE</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Printed: {new Date().toLocaleString('en-LK')}</p>
          </div>
        </div>
      </div>

      {/* ── Compact Executive Print Summary Strip (Replaces bulky boxes in print) ── */}
      <div className="hidden print:block mb-4 border border-slate-300 rounded overflow-hidden">
        <div className="grid grid-cols-4 divide-x divide-slate-300 bg-slate-100 text-[10px] font-bold text-slate-700 py-1.5 px-3 uppercase tracking-wider text-center">
          <div>Total Outstanding Credit</div>
          <div>Overdue Amount</div>
          <div>Due in Next 7 Days</div>
          <div>Filtered Statement Total</div>
        </div>
        <div className="grid grid-cols-4 divide-x divide-slate-300 font-mono font-bold py-1.5 px-3 text-xs bg-white text-center">
          <div className="text-rose-700">{fmtRs(totalOutstandingCredit)}</div>
          <div className="text-rose-600">{overdueTotal > 0 ? fmtRs(overdueTotal) : 'Rs. 0.00'}</div>
          <div className="text-amber-700">{dueSoonTotal > 0 ? fmtRs(dueSoonTotal) : 'Rs. 0.00'}</div>
          <div className="text-slate-900 font-extrabold">{fmtRs(filteredTotal)}</div>
        </div>
      </div>

      {/* ── 4 Metric Overview Cards (Screen Only) ────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
        {/* Card 1: Outstanding Credit */}
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 shadow-2xs">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Outstanding Credit
            </span>
            <div className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {fmtRs(totalOutstandingCredit)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {grnList.filter((g) => g.status === 'PENDING').length} pending invoices
          </p>
        </div>

        {/* Card 2: Overdue Invoices */}
        <div
          className={`p-3.5 rounded-xl border shadow-2xs ${
            overdueInvoices.length > 0
              ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40'
              : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800/90'
          }`}
        >
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1">
              {overdueInvoices.length > 0 && <AlertTriangle className="w-3 h-3" />}
              Overdue Credit
            </span>
            <div className="p-1.5 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-md">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400 mt-1 tabular-nums">
            {fmtRs(overdueTotal)}
          </p>
          <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-0.5 font-medium">
            {overdueInvoices.length} invoices past due
          </p>
        </div>

        {/* Card 3: Due Soon (Within 7 Days) */}
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 shadow-2xs">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Due in Next 7 Days
            </span>
            <div className="p-1.5 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-md">
              <CalendarClock className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
            {fmtRs(dueSoonTotal)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {dueSoonInvoices.length} invoices due soon
          </p>
        </div>

        {/* Card 4: Settled Credit */}
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 shadow-2xs">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Settled (Paid)
            </span>
            <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-md">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
            {fmtRs(totalPaidCredit)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {grnList.filter((g) => g.status === 'PAID').length} invoices settled
          </p>
        </div>
      </div>

      {/* ── Filter Bar ──────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/90 dark:border-slate-800/90 flex flex-wrap items-center justify-between gap-3 shadow-2xs print:hidden">
        <div className="flex items-center flex-1 min-w-[240px] relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search GRN invoice #, supplier name, notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 shadow-2xs"
          />
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Status Pills */}
          <div className="inline-flex rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-medium">
            {(['ALL', 'PENDING', 'DUE_SOON', 'OVERDUE', 'PAID'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  statusFilter === status
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {status === 'ALL'
                  ? 'All'
                  : status === 'PENDING'
                  ? 'Pending'
                  : status === 'DUE_SOON'
                  ? 'Due Soon'
                  : status === 'OVERDUE'
                  ? 'Overdue'
                  : 'Paid'}
              </button>
            ))}
          </div>

          {/* Supplier Dropdown Filter */}
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="py-1.5 px-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-600"
            >
              <option value="ALL">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Invoices Table ──────────────────────────────────────────────────────── */}
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col print:border-slate-300 print:shadow-none print:overflow-visible">
        <div className="overflow-x-auto flex-1 overflow-y-auto print:overflow-visible">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm print:text-xs">
            <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider print:bg-slate-100 print:text-slate-900 print:table-header-group">
              <tr>
                <th className="px-6 py-3 text-left print:py-1.5 print:px-2 print:text-[10px]">GRN Invoice #</th>
                <th className="px-6 py-3 text-left print:py-1.5 print:px-2 print:text-[10px]">Supplier / Distributor</th>
                <th className="px-6 py-3 text-left print:py-1.5 print:px-2 print:text-[10px]">Received Date</th>
                <th className="px-6 py-3 text-left print:py-1.5 print:px-2 print:text-[10px]">Due Date</th>
                <th className="px-6 py-3 text-left print:py-1.5 print:px-2 print:text-[10px]">Payment Status</th>
                <th className="px-6 py-3 text-right print:py-1.5 print:px-2 print:text-[10px]">Invoice Amount</th>
                <th className="px-6 py-3 text-center print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 print:divide-slate-200">
              {loading ? (
                [0, 1, 2, 3].map((r) => (
                  <tr key={r}>
                    {[0, 1, 2, 3, 4, 5, 6].map((c) => (
                      <td key={c} className="px-6 py-4">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredGrns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12">
                    <EmptyState
                      icon={<CreditCard className="w-12 h-12 text-gray-400" />}
                      title="No Credit GRN invoices found"
                      subtitle="Credit deliveries from distributors will appear here automatically when recorded under 'GRN (Stock In)'."
                    />
                  </td>
                </tr>
              ) : (
                filteredGrns.map((grn) => {
                  const overdue = isOverdue(grn.due_date, grn.status);

                  return (
                    <tr
                      key={grn.id}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors print:break-inside-avoid ${
                        overdue ? 'bg-red-50/50 dark:bg-red-950/20 print:bg-transparent' : ''
                      }`}
                    >
                      <td className="px-6 py-4 font-mono font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap print:py-1.5 print:px-2 print:text-slate-900">
                        {grn.grn_number}
                      </td>
                      <td className="px-6 py-4 text-gray-800 dark:text-gray-200 font-medium print:py-1.5 print:px-2 print:text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-gray-400 print:hidden" />
                          <span>{grn.supplier_name || 'Walk-in / Direct'}</span>
                        </div>
                        {grn.notes && (
                          <p className="text-xs text-gray-400 italic mt-0.5 print:text-[10px] print:text-slate-500">{grn.notes}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-300 whitespace-nowrap print:py-1.5 print:px-2 print:text-slate-700">
                        {fmtDate(grn.received_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap print:py-1.5 print:px-2">
                        <div
                          className={`flex items-center gap-1 font-medium ${
                            overdue
                              ? 'text-red-600 dark:text-red-400 font-bold'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {overdue && <AlertTriangle className="w-3.5 h-3.5 print:hidden" />}
                          <span>{fmtDate(grn.due_date)}</span>
                          {overdue && (
                            <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 print:border print:border-rose-400 print:bg-transparent">
                              Overdue
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap print:py-1.5 print:px-2">
                        {grn.status === 'PAID' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 print:p-0 print:bg-transparent print:text-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5 print:hidden" />
                            PAID {grn.paid_date ? `(${fmtDate(grn.paid_date)})` : ''}
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                              overdue
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 print:text-rose-800'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 print:text-amber-800'
                            } print:p-0 print:bg-transparent`}
                          >
                            <Clock className="w-3.5 h-3.5 print:hidden" />
                            Pending Payment
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-bold font-mono text-gray-900 dark:text-gray-100 whitespace-nowrap print:py-1.5 print:px-2 print:text-slate-900">
                        {fmtRs(grn.total_amount)}
                      </td>
                      <td className="px-6 py-4 text-center whitespace-nowrap print:hidden">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setViewGrnId(grn.id!)}
                            title="View Received Items"
                            className="p-1.5 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {grn.status === 'PENDING' ? (
                            <button
                              onClick={() => handleOpenPayModal(grn)}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer"
                            >
                              Mark as Paid
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">Settled</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredGrns.length > 0 && (
              <tfoot className="bg-gray-50 dark:bg-gray-900/60 font-bold border-t border-gray-200 dark:border-gray-700 print:bg-slate-100 print:text-slate-900 print:table-footer-group">
                <tr>
                  <td colSpan={5} className="px-6 py-3 text-right text-gray-700 dark:text-gray-300 print:py-2 print:px-2 print:text-slate-800">
                    Filtered Statement Grand Total:
                  </td>
                  <td className="px-6 py-3 text-right text-rose-600 dark:text-rose-400 print:text-slate-900 font-mono font-extrabold print:py-2 print:px-2">
                    {fmtRs(filteredTotal)}
                  </td>
                  <td className="print:hidden"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Official Accounts Payable Signature Slip (Print Only - Page break safe) ── */}
      <div className="hidden print:grid grid-cols-3 gap-8 pt-8 text-xs text-slate-800 print-avoid-break">
        <div className="border-t border-slate-400 pt-2 text-center">
          <p className="font-bold text-slate-900">Prepared By (Purchasing)</p>
          <p className="text-[10px] text-slate-500 mt-6">Signature & Date</p>
        </div>
        <div className="border-t border-slate-400 pt-2 text-center">
          <p className="font-bold text-slate-900">Accounts Verified By</p>
          <p className="text-[10px] text-slate-500 mt-6">Signature & Date</p>
        </div>
        <div className="border-t border-slate-400 pt-2 text-center">
          <p className="font-bold text-slate-900">Approved for Payment (Manager)</p>
          <p className="text-[10px] text-slate-500 mt-6">Signature & Date</p>
        </div>
      </div>

      {/* ── Modal: View GRN Invoice Items ───────────────────────────────────────── */}
      {viewGrnId !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Credit Invoice Items ({viewGrnData?.header.grn_number || 'Loading...'})
                </h3>
              </div>
              <button
                onClick={() => setViewGrnId(null)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {viewLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : viewGrnData ? (
                <>
                  {/* Summary Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl text-xs">
                    <div>
                      <span className="text-gray-400 block">Supplier</span>
                      <span className="font-bold text-gray-900 dark:text-white">
                        {viewGrnData.header.supplier_name || 'Walk-in'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Received Date</span>
                      <span className="font-bold text-gray-900 dark:text-white">
                        {fmtDate(viewGrnData.header.received_date)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Due Date</span>
                      <span className="font-bold text-gray-900 dark:text-white">
                        {fmtDate(viewGrnData.header.due_date)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Total Amount</span>
                      <span className="font-bold font-mono text-slate-900 dark:text-slate-100">
                        {fmtRs(viewGrnData.header.total_amount)}
                      </span>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400 uppercase font-semibold">
                        <tr>
                          <th className="py-2.5 px-3 text-left">Item Title</th>
                          <th className="py-2.5 px-3 text-left">Barcode</th>
                          <th className="py-2.5 px-3 text-right">Received Qty</th>
                          <th className="py-2.5 px-3 text-right">Unit Cost</th>
                          <th className="py-2.5 px-3 text-right">Selling Price</th>
                          <th className="py-2.5 px-3 text-right">Line Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {viewGrnData.items.map((item) => (
                          <tr key={item.id}>
                            <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-white">
                              {item.title}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-gray-400">{item.barcode}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-gray-800 dark:text-gray-200">
                              {item.received_qty}
                            </td>
                            <td className="py-2.5 px-3 text-right text-gray-600 dark:text-gray-300">
                              Rs. {item.unit_cost.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400 font-medium">
                              Rs. {item.selling_price.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-gray-900 dark:text-white">
                              Rs. {item.total_cost.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>

            <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-end">
              <button
                onClick={() => setViewGrnId(null)}
                className="px-4 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Mark Credit GRN as Paid ──────────────────────────────────────── */}
      {payingGrn !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-800 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 rounded-xl">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base">
                  Mark Invoice as Paid
                </h3>
                <p className="text-xs text-gray-500">
                  {payingGrn.grn_number} &bull; {payingGrn.supplier_name || 'Distributor'}
                </p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center text-sm mb-1">
                <span className="text-gray-500 dark:text-gray-400">Total Invoice Amount:</span>
                <span className="font-extrabold text-base text-gray-900 dark:text-white">
                  {fmtRs(payingGrn.total_amount)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs text-gray-500">
                <span>Originally Due:</span>
                <span>{fmtDate(payingGrn.due_date)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Settlement / Payment Date
                </label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>

              {/* Cashbook sync toggle */}
              <label className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={logInCashbook}
                  onChange={(e) => setLogInCashbook(e.target.checked)}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                    Record in Cashbook as Cash Out
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    Automatically logs -{fmtRs(payingGrn.total_amount)} under "Supplier Payment" in today's Cashbook.
                  </span>
                </div>
              </label>
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPayingGrn(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPayGrn}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors"
              >
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
