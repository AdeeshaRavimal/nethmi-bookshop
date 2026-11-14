import { useState, useEffect, useMemo, useCallback } from 'react';
import { db, type CashbookEntry, type CashbookSummary } from '../db';
import { localDateString } from '../utils/dates';
import { useToast } from '../components/Toast';
import { Skeleton, EmptyState } from '../components/Skeleton';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Search,
  Calendar,
  Printer,
  Edit2,
  Trash2,
  X,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Layers,
  CheckCircle2,
  Info,
} from 'lucide-react';

const IN_CATEGORIES = [
  { value: 'CAPITAL', label: 'Owner / Initial Cash In' },
  { value: 'BANK_WITHDRAWAL', label: 'Bank Withdrawal' },
  { value: 'CUSTOMER_PAYMENT', label: 'Customer Debt Collection' },
  { value: 'SERVICE_INCOME', label: 'Service / Print Income' },
  { value: 'OTHER_IN', label: 'Other Cash In' },
];

const OUT_CATEGORIES = [
  { value: 'EXPENSE', label: 'Shop Expense (Tea, Bills, Supplies)' },
  { value: 'SUPPLIER_PAYMENT', label: 'Supplier Payment' },
  { value: 'BANK_DEPOSIT', label: 'Cash Deposited to Bank' },
  { value: 'DRAWINGS', label: 'Owner Drawings / Personal' },
  { value: 'SALARY', label: 'Staff Salary / Wages' },
  { value: 'OTHER_OUT', label: 'Other Cash Out' },
];

function getCategoryBadge(category: string, type: string) {
  switch (category) {
    case 'POS_SALES':
      return { label: 'POS Cash Sales', bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' };
    case 'CAPITAL':
      return { label: 'Owner Cash', bg: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300' };
    case 'BANK_WITHDRAWAL':
      return { label: 'Bank Withdrawal', bg: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' };
    case 'CUSTOMER_PAYMENT':
      return { label: 'Customer Payment', bg: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300' };
    case 'SERVICE_INCOME':
      return { label: 'Service Income', bg: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300' };
    case 'EXPENSE':
      return { label: 'Shop Expense', bg: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300' };
    case 'SUPPLIER_PAYMENT':
      return { label: 'Supplier Payment', bg: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300' };
    case 'BANK_DEPOSIT':
      return { label: 'Bank Deposit', bg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' };
    case 'DRAWINGS':
      return { label: 'Owner Drawings', bg: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300' };
    case 'SALARY':
      return { label: 'Salary / Wages', bg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-300' };
    default:
      return type === 'IN'
        ? { label: category || 'Other In', bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' }
        : { label: category || 'Other Out', bg: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400' };
  }
}

export default function Cashbook() {
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState(() => localDateString());
  const [transactions, setTransactions] = useState<CashbookEntry[]>([]);
  const [summary, setSummary] = useState<CashbookSummary>({
    openingBalance: 0,
    posCashSales: 0,
    manualCashIn: 0,
    totalCashIn: 0,
    totalCashOut: 0,
    netCashFlow: 0,
    closingBalance: 0,
    posSalesCount: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CashbookEntry | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    type: 'OUT' as 'IN' | 'OUT',
    category: 'EXPENSE',
    amount: '',
    description: '',
    reference_no: '',
    entry_date: localDateString(),
    entry_time: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [txRes, sumRes] = await Promise.all([
        db.cashbook.getDayTransactions({ date: selectedDate }),
        db.cashbook.getSummary({ date: selectedDate }),
      ]);
      setTransactions(txRes.data ?? []);
      if (sumRes.data) {
        setSummary(sumRes.data);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to load cashbook data');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Quick Date Selectors
  const setToday = () => setSelectedDate(localDateString());
  const setYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setSelectedDate(localDateString(d));
  };

  const handleOpenAdd = (type: 'IN' | 'OUT' = 'OUT') => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
    setEditingEntry(null);
    setFormData({
      type,
      category: type === 'IN' ? 'CAPITAL' : 'EXPENSE',
      amount: '',
      description: '',
      reference_no: '',
      entry_date: selectedDate,
      entry_time: timeStr,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (entry: CashbookEntry) => {
    if (entry.is_auto) return;
    setEditingEntry(entry);
    setFormData({
      type: entry.type,
      category: entry.category,
      amount: entry.amount.toString(),
      description: entry.description,
      reference_no: entry.reference_no || '',
      entry_date: entry.entry_date,
      entry_time: entry.entry_time || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(formData.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid amount greater than 0');
      return;
    }
    if (!formData.description.trim()) {
      toast.error('Please enter a description');
      return;
    }

    try {
      if (editingEntry && typeof editingEntry.id === 'number') {
        await db.cashbook.update({
          id: editingEntry.id,
          entry_date: formData.entry_date,
          entry_time: formData.entry_time,
          type: formData.type,
          category: formData.category,
          amount: amountNum,
          description: formData.description.trim(),
          reference_no: formData.reference_no.trim() || undefined,
        });
        toast.success('Cash entry updated');
      } else {
        await db.cashbook.create({
          entry_date: formData.entry_date,
          entry_time: formData.entry_time,
          type: formData.type,
          category: formData.category,
          amount: amountNum,
          description: formData.description.trim(),
          reference_no: formData.reference_no.trim() || undefined,
        });
        toast.success(`Cash ${formData.type === 'IN' ? 'In' : 'Out'} logged successfully`);
      }
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Operation failed');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await db.cashbook.delete(id);
      toast.success('Entry removed');
      setDeleteConfirmId(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  // Filtered rows
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;
      if (categoryFilter !== 'ALL' && t.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const desc = (t.description || '').toLowerCase();
        const ref = (t.reference_no || '').toLowerCase();
        const cat = (t.category || '').toLowerCase();
        if (!desc.includes(q) && !ref.includes(q) && !cat.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, typeFilter, categoryFilter, search]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* ── Top Header Bar ──────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Cashbook & Daily Ledger</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Track daily cash in hand, POS collections, and expenses
              </p>
            </div>
          </div>
        </div>

        {/* Date Selector & Action Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Quick Date Pills */}
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-0.5 text-xs font-medium">
            <button
              onClick={setToday}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                selectedDate === localDateString()
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Today
            </button>
            <button
              onClick={setYesterday}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                selectedDate !== localDateString()
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Yesterday / Other
            </button>
          </div>

          {/* Date Picker Input */}
          <div className="relative">
            <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <button
            onClick={() => loadData()}
            title="Refresh"
            className="p-2 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handlePrint}
            title="Print daily cash sheet"
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Print Sheet</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenAdd('IN')}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>Cash In</span>
            </button>
            <button
              onClick={() => handleOpenAdd('OUT')}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>Cash Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Printable Header (Only visible when printing) ────────────────────────── */}
      <div className="hidden print:block p-6 border-b border-gray-300 bg-white text-black">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black tracking-tight">HIRU BOOKSHOP & COMMUNICATION</h1>
            <p className="text-sm text-gray-600">Daily Cashbook & Closing Balance Sheet</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-bold">Date: {selectedDate}</p>
            <p className="text-xs text-gray-500">Printed: {new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* ── Scrollable Body Area ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* ── Summary Metric Cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Opening Balance */}
          <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Opening Balance
              </span>
              <div className="p-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
              Rs. {summary.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Brought forward from yesterday
            </p>
          </div>

          {/* Card 2: Total Cash In */}
          <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Total Cash In
              </span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-lg">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
              + Rs. {summary.totalCashIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 space-y-0.5">
              <div className="flex justify-between">
                <span>POS Cash ({summary.posSalesCount} sales):</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">Rs. {summary.posCashSales.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Manual Cash In:</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">Rs. {summary.manualCashIn.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Card 3: Total Cash Out */}
          <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Total Cash Out
              </span>
              <div className="p-2 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-lg">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-2">
              - Rs. {summary.totalCashOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Expenses, supplier cash & owner drawings
            </p>
          </div>

          {/* Card 4: Closing Balance (Cash in Hand) */}
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/30 p-5 rounded-xl border border-indigo-200 dark:border-indigo-800/80 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                Closing Cash in Hand
              </span>
              <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-indigo-950 dark:text-indigo-200 mt-2">
              Rs. {summary.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-indigo-700 dark:text-indigo-400 mt-1 font-medium">
              Net Flow Today: {summary.netCashFlow >= 0 ? '+' : ''}Rs. {summary.netCashFlow.toFixed(2)}
            </p>
          </div>
        </div>

        {/* ── Filter / Search Bar ────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between gap-4 shadow-sm print:hidden">
          <div className="flex items-center flex-1 min-w-[260px] relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search description, receipt #, or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Type filter */}
            <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-0.5 text-xs font-medium">
              <button
                onClick={() => setTypeFilter('ALL')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  typeFilter === 'ALL'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                All Flow
              </button>
              <button
                onClick={() => setTypeFilter('IN')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  typeFilter === 'IN'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                Cash In (+)
              </button>
              <button
                onClick={() => setTypeFilter('OUT')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  typeFilter === 'OUT'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                Cash Out (-)
              </button>
            </div>

            {/* Category dropdown */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="py-1.5 px-3 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Categories</option>
              <optgroup label="Cash In">
                <option value="POS_SALES">POS Cash Sales</option>
                {IN_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </optgroup>
              <optgroup label="Cash Out">
                {OUT_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* ── Transactions Ledger Table ──────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Ledger Entries for {selectedDate}
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium">
                {filteredTransactions.length} transactions
              </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 print:hidden">
              POS sales automatically recorded in real-time
            </div>
          </div>

          {loading ? (
            <div className="p-8 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={<Wallet className="w-12 h-12 text-gray-400" />}
                title="No cash transactions recorded"
                subtitle={`No cash inflow or outflow recorded for ${selectedDate}. Click "+ Cash In" or "+ Cash Out" above to record one.`}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 text-xs uppercase font-semibold border-b border-gray-200 dark:border-gray-800">
                  <tr>
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Ref #</th>
                    <th className="py-3 px-4 text-right">Cash In (Rs.)</th>
                    <th className="py-3 px-4 text-right">Cash Out (Rs.)</th>
                    <th className="py-3 px-4 text-center print:hidden">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/80">
                  {filteredTransactions.map((tx) => {
                    const badge = getCategoryBadge(tx.category, tx.type);
                    const isPos = Boolean(tx.is_auto);

                    return (
                      <tr
                        key={tx.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                      >
                        <td className="py-3 px-4 text-xs font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {tx.entry_time || '—'}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {tx.type === 'IN' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                              <ArrowDownLeft className="w-3 h-3" />
                              IN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300">
                              <ArrowUpRight className="w-3 h-3" />
                              OUT
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-medium ${badge.bg}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-900 dark:text-gray-100 font-medium">
                          {tx.description}
                          {isPos && (
                            <span className="ml-2 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              Auto
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {tx.reference_no || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {tx.type === 'IN'
                            ? `+ ${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                          {tx.type === 'OUT'
                            ? `- ${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap print:hidden">
                          {isPos ? (
                            <span className="text-xs text-gray-400 italic">POS Sale</span>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleOpenEdit(tx)}
                                title="Edit Entry"
                                className="p-1.5 text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(typeof tx.id === 'number' ? tx.id : null)}
                                title="Delete Entry"
                                className="p-1.5 text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 dark:bg-gray-800/80 font-bold text-sm border-t-2 border-gray-300 dark:border-gray-700">
                  <tr>
                    <td colSpan={5} className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">
                      Day's Total Movement:
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 font-extrabold whitespace-nowrap">
                      + Rs. {summary.totalCashIn.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400 font-extrabold whitespace-nowrap">
                      - Rs. {summary.totalCashOut.toFixed(2)}
                    </td>
                    <td className="print:hidden"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── Daily Closing Signature Slip (Print Only) ────────────────────────── */}
        <div className="hidden print:grid grid-cols-3 gap-8 pt-12 text-sm text-gray-800">
          <div className="border-t border-gray-400 pt-2 text-center">
            <p className="font-semibold">Prepared By (Cashier)</p>
            <p className="text-xs text-gray-500 mt-6">Signature & Date</p>
          </div>
          <div className="border-t border-gray-400 pt-2 text-center">
            <p className="font-semibold">Physical Cash Count</p>
            <p className="text-xs text-gray-500 mt-6">Rs. ___________________</p>
          </div>
          <div className="border-t border-gray-400 pt-2 text-center">
            <p className="font-semibold">Approved By (Manager)</p>
            <p className="text-xs text-gray-500 mt-6">Signature & Date</p>
          </div>
        </div>
      </div>

      {/* ── Add / Edit Entry Modal ──────────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${formData.type === 'IN' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'}`}>
                  {formData.type === 'IN' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">
                    {editingEntry ? 'Edit Cash Entry' : formData.type === 'IN' ? 'Log Cash Inflow' : 'Log Cash Outflow / Expense'}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {formData.type === 'IN' ? 'Deposit or customer payment into cash drawer' : 'Expense, payment, or drawing from cash drawer'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Type Switcher (only for new entries) */}
              {!editingEntry && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    Entry Direction
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          type: 'IN',
                          category: 'CAPITAL',
                        });
                      }}
                      className={`py-2.5 px-4 rounded-xl border flex items-center justify-center gap-2 font-medium text-sm transition-all ${
                        formData.type === 'IN'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 ring-2 ring-emerald-500/20 font-bold'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <ArrowDownLeft className="w-4 h-4" />
                      Cash In (+)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          type: 'OUT',
                          category: 'EXPENSE',
                        });
                      }}
                      className={`py-2.5 px-4 rounded-xl border flex items-center justify-center gap-2 font-medium text-sm transition-all ${
                        formData.type === 'OUT'
                          ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 ring-2 ring-rose-500/20 font-bold'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      Cash Out (-)
                    </button>
                  </div>
                </div>
              )}

              {/* Amount input */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Amount (Rs.) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-gray-400 text-sm">
                    Rs.
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    autoFocus
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full pl-12 pr-4 py-2.5 text-lg font-bold bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Category & Date/Time Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {formData.type === 'IN'
                      ? IN_CATEGORIES.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))
                      : OUT_CATEGORIES.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))
                    }
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    Entry Date & Time
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      required
                      value={formData.entry_date}
                      onChange={(e) => setFormData({ ...formData, entry_date: e.target.value })}
                      className="w-2/3 px-2.5 py-2 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="time"
                      value={formData.entry_time}
                      onChange={(e) => setFormData({ ...formData, entry_time: e.target.value })}
                      className="w-1/3 px-2 py-2 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Description / Reason <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    formData.type === 'IN'
                      ? 'e.g., Owner added capital to drawer, Customer balance collection'
                      : 'e.g., Staff tea & snacks, Electricity bill payment, Cleaning supplies'
                  }
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Reference Number */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Reference / Voucher # (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. VOUCHER-042, BILL-99, CHQ-1049"
                  value={formData.reference_no}
                  onChange={(e) => setFormData({ ...formData, reference_no: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Modal Buttons */}
              <div className="pt-3 flex justify-end gap-3 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-xl text-white text-sm font-semibold shadow-md transition-colors ${
                    formData.type === 'IN'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {editingEntry ? 'Save Changes' : formData.type === 'IN' ? 'Add Cash In' : 'Record Cash Out'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ─────────────────────────────────────────── */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-gray-900 dark:text-white">Delete Cash Entry?</h4>
              <p className="text-xs text-gray-500 mt-1">
                Are you sure you want to delete this cash entry? This will update the daily cash total and closing balance.
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold shadow-md"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
