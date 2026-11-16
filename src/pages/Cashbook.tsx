import { useState, useEffect, useMemo, useCallback } from 'react';
import { db, type CashbookEntry, type CashbookSummary, type DailyClosing } from '../db';
import { localDateString } from '../utils/dates';
import { useToast } from '../components/Toast';
import { Skeleton, EmptyState } from '../components/Skeleton';
import { printZReport } from '../utils/receipt';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
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
  Receipt,
  AlertTriangle,
  Calculator,
} from 'lucide-react';

const fmtRs = (n: number = 0) =>
  `Rs. ${Number(n).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
      return { label: 'POS Cash Sales', bg: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60' };
    case 'CAPITAL':
      return { label: 'Owner Cash', bg: 'bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700' };
    case 'BANK_WITHDRAWAL':
      return { label: 'Bank Withdrawal', bg: 'bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700' };
    case 'CUSTOMER_PAYMENT':
      return { label: 'Customer Payment', bg: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60' };
    case 'SERVICE_INCOME':
      return { label: 'Service Income', bg: 'bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700' };
    case 'EXPENSE':
      return { label: 'Shop Expense', bg: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60' };
    case 'SUPPLIER_PAYMENT':
      return { label: 'Supplier Payment', bg: 'bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700' };
    case 'BANK_DEPOSIT':
      return { label: 'Bank Deposit', bg: 'bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700' };
    case 'DRAWINGS':
      return { label: 'Owner Drawings', bg: 'bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700' };
    case 'SALARY':
      return { label: 'Salary / Wages', bg: 'bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700' };
    default:
      return type === 'IN'
        ? { label: category || 'Other In', bg: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60' }
        : { label: category || 'Other Out', bg: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60' };
  }
}

export default function Cashbook() {
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState(() => localDateString());
  const [transactions, setTransactions] = useState<CashbookEntry[]>([]);
  const [summary, setSummary] = useState<CashbookSummary>({
    openingBalance: 0,
    posCashSales: 0,
    customerCashIn: 0,
    supplierCashOut: 0,
    manualCashIn: 0,
    manualCashOut: 0,
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

  // Shift Close & Daily Z-Report State
  const [showShiftCloseModal, setShowShiftCloseModal] = useState(false);
  const [closingDenoms, setClosingDenoms] = useState<Record<string, string>>({
    '5000': '',
    '1000': '',
    '500': '',
    '100': '',
    '50': '',
    '20': '',
    'coins': '',
  });
  const [closingNotes, setClosingNotes] = useState('');
  const [existingClosing, setExistingClosing] = useState<DailyClosing | null>(null);
  const [savingClosing, setSavingClosing] = useState(false);
  const [paymentBreakdown, setPaymentBreakdown] = useState<Array<{ payment_type: string; total: number }>>([]);

  const countedCash = useMemo(() => {
    let sum = 0;
    ['5000', '1000', '500', '100', '50', '20'].forEach(note => {
      const count = parseInt(closingDenoms[note] || '0', 10);
      if (!isNaN(count) && count > 0) sum += Number(note) * count;
    });
    const coins = parseFloat(closingDenoms['coins'] || '0');
    if (!isNaN(coins) && coins > 0) sum += coins;
    return Math.round(sum * 100) / 100;
  }, [closingDenoms]);

  const cashVariance = Math.round((countedCash - (summary.closingBalance || 0)) * 100) / 100;

  const handleOpenShiftClose = async () => {
    setShowShiftCloseModal(true);
    try {
      const [closeRes, bdRes] = await Promise.all([
        db.cashbook.getShiftClose(selectedDate),
        db.sales.getPaymentBreakdown(selectedDate),
      ]);
      if (closeRes.success && closeRes.data) {
        setExistingClosing(closeRes.data);
        try {
          const parsed = JSON.parse(closeRes.data.denominations_json);
          setClosingDenoms({
            '5000': parsed['5000'] ? String(parsed['5000']) : '',
            '1000': parsed['1000'] ? String(parsed['1000']) : '',
            '500': parsed['500'] ? String(parsed['500']) : '',
            '100': parsed['100'] ? String(parsed['100']) : '',
            '50': parsed['50'] ? String(parsed['50']) : '',
            '20': parsed['20'] ? String(parsed['20']) : '',
            'coins': parsed['coins'] ? String(parsed['coins']) : '',
          });
        } catch { }
        setClosingNotes(closeRes.data.notes || '');
      } else {
        setExistingClosing(null);
      }
      if (bdRes.success && bdRes.data) {
        setPaymentBreakdown(bdRes.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveShiftClose = async (printReport = false) => {
    setSavingClosing(true);
    try {
      const denomsPayload: Record<string, number> = {};
      ['5000', '1000', '500', '100', '50', '20'].forEach(note => {
        const val = parseInt(closingDenoms[note] || '0', 10);
        if (val > 0) denomsPayload[note] = val;
      });
      const coins = parseFloat(closingDenoms['coins'] || '0');
      if (coins > 0) denomsPayload['coins'] = coins;

      const res = await db.cashbook.recordShiftClose({
        closing_date: selectedDate,
        expected_cash: summary.closingBalance,
        counted_cash: countedCash,
        difference: cashVariance,
        denominations_json: JSON.stringify(denomsPayload),
        notes: closingNotes.trim(),
      });

      if (!res.success) {
        toast.error(res.error || 'Failed to record shift close');
        return;
      }

      toast.success('Shift close saved successfully!');
      setExistingClosing({
        closing_date: selectedDate,
        expected_cash: summary.closingBalance,
        counted_cash: countedCash,
        difference: cashVariance,
        denominations_json: JSON.stringify(denomsPayload),
        notes: closingNotes.trim(),
        closed_at: new Date().toLocaleTimeString(),
      });

      if (printReport) {
        const cardSales = paymentBreakdown.find(p => p.payment_type === 'CARD')?.total || 0;
        const creditSales = paymentBreakdown.find(p => p.payment_type === 'CREDIT')?.total || 0;
        const totalGross = summary.posCashSales + cardSales + creditSales;

        printZReport({
          closing_date: selectedDate,
          closed_at: new Date().toLocaleTimeString(),
          opening_balance: summary.openingBalance,
          pos_cash_sales: summary.posCashSales,
          customer_debt_collected: summary.customerCashIn || 0,
          supplier_cash_paid: summary.supplierCashOut || 0,
          expenses: summary.manualCashOut || 0,
          other_in: summary.manualCashIn || 0,
          other_out: 0,
          expected_cash: summary.closingBalance,
          counted_cash: countedCash,
          variance: cashVariance,
          card_sales: cardSales,
          credit_sales: creditSales,
          total_gross_sales: totalGross,
          pos_sales_count: summary.posSalesCount,
          denominations: denomsPayload,
          notes: closingNotes.trim(),
        });
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error recording shift close');
    } finally {
      setSavingClosing(false);
    }
  };

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
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-gray-950 print:h-auto print:overflow-visible print:bg-white">
      {/* ── Top Header Bar ──────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-100 dark:border-blue-900/60 shadow-2xs">
              <Wallet className="w-5 h-5 stroke-[1.8]" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">Cashbook & Daily Ledger</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Track daily cash in hand, POS collections, and expenses
              </p>
            </div>
          </div>
        </div>

        {/* Date Selector & Action Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Quick Date Pills */}
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-medium">
            <button
              onClick={setToday}
              className={`px-3 py-1.5 rounded-md transition-colors ${selectedDate === localDateString()
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              Today
            </button>
            <button
              onClick={setYesterday}
              className={`px-3 py-1.5 rounded-md transition-colors ${selectedDate !== localDateString()
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              Yesterday / Other
            </button>
          </div>

          {/* Date Picker Input */}
          <div className="relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
            />
          </div>

          <button
            onClick={() => loadData()}
            title="Refresh"
            className="p-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 transition-colors cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handlePrint}
            title="Print daily cash sheet"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Sheet</span>
          </button>

          <button
            onClick={handleOpenShiftClose}
            title="End of day till reconciliation & print Daily Z-Report"
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Close Day & Z-Report</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleOpenAdd('IN')}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Cash In</span>
            </button>
            <button
              onClick={() => handleOpenAdd('OUT')}
              className="flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Cash Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Printable Header (Only visible when printing) ────────────────────────── */}
      <div className="hidden print:block mb-4 p-4 border-b-2 border-slate-800 bg-white text-slate-900">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">HIRU BOOKSHOP & COMMUNICATION</h1>
            <p className="text-xs text-slate-600 font-medium">Daily Cashbook & Drawer Reconciliation Statement</p>
            <p className="text-[10px] text-slate-500 mt-1">
              Ledger Date: <strong className="text-slate-900">{selectedDate}</strong> &bull; Filter: {typeFilter === 'ALL' ? 'All Transactions' : typeFilter === 'IN' ? 'Cash Inflows Only' : 'Cash Outflows Only'} &bull; Category: {categoryFilter === 'ALL' ? 'All Categories' : categoryFilter} ({filteredTransactions.length} entries)
            </p>
          </div>
          <div className="text-right text-xs text-slate-600">
            <p className="font-mono font-bold text-slate-900">Date: {selectedDate}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Printed: {new Date().toLocaleString('en-LK')}</p>
          </div>
        </div>
      </div>

      {/* ── Compact Executive Print Summary Strip (Replaces bulky cards in print) ── */}
      <div className="hidden print:block mb-4 border border-slate-300 rounded overflow-hidden">
        <div className="grid grid-cols-4 divide-x divide-slate-300 bg-slate-100 text-[10px] font-bold text-slate-700 py-1.5 px-3 uppercase tracking-wider text-center">
          <div>Opening Cash (B/F)</div>
          <div>Total Cash In (+)</div>
          <div>Total Cash Out (-)</div>
          <div>Closing Till Balance</div>
        </div>
        <div className="grid grid-cols-4 divide-x divide-slate-300 font-mono font-bold py-1.5 px-3 text-xs bg-white text-center">
          <div className="text-slate-800">{fmtRs(summary.openingBalance)}</div>
          <div className="text-emerald-700">+{fmtRs(summary.totalCashIn)}</div>
          <div className="text-rose-700">-{fmtRs(summary.totalCashOut)}</div>
          <div className="text-slate-900 font-extrabold">{fmtRs(summary.closingBalance)}</div>
        </div>
      </div>

      {/* ── Scrollable Body Area ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 print:p-0 print:space-y-3 print:overflow-visible">
        {/* ── Summary Metric Cards (Hidden in Print to save pages and avoid awkward cuts) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
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
              {(summary.customerCashIn != null && summary.customerCashIn > 0) && (
                <div className="flex justify-between text-teal-600 dark:text-teal-400 font-medium">
                  <span>Customer Debt Collected:</span>
                  <span>Rs. {summary.customerCashIn.toFixed(2)}</span>
                </div>
              )}
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
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 space-y-0.5">
              {(summary.supplierCashOut != null && summary.supplierCashOut > 0) && (
                <div className="flex justify-between text-slate-600 dark:text-slate-400 font-medium">
                  <span>Supplier Cash Paid:</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">Rs. {summary.supplierCashOut.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Expenses & Cash Out:</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">Rs. {(summary.manualCashOut ?? Math.max(0, summary.totalCashOut - (summary.supplierCashOut ?? 0))).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Card 4: Closing Balance (Cash in Hand) */}
          <div className="bg-slate-900 text-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-900 dark:border-blue-900/60 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 dark:text-blue-300">
                Closing Cash in Hand
              </span>
              <div className="p-2 bg-blue-600 text-white rounded-lg shadow-2xs">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-white dark:text-blue-200 mt-2">
              Rs. {summary.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-slate-300 dark:text-slate-400 mt-1 font-medium">
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
                className={`px-3 py-1.5 rounded-md transition-colors ${typeFilter === 'ALL'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                  }`}
              >
                All Flow
              </button>
              <button
                onClick={() => setTypeFilter('IN')}
                className={`px-3 py-1.5 rounded-md transition-colors ${typeFilter === 'IN'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                  }`}
              >
                Cash In (+)
              </button>
              <button
                onClick={() => setTypeFilter('OUT')}
                className={`px-3 py-1.5 rounded-md transition-colors ${typeFilter === 'OUT'
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
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden print:bg-white print:border-slate-300 print:shadow-none print:overflow-visible">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between print:py-2 print:px-3 print:bg-slate-50 print:border-slate-300">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-gray-500 print:hidden" />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white print:text-xs print:font-extrabold print:text-slate-900">
                Ledger Entries for {selectedDate}
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium print:text-[10px] print:bg-transparent print:p-0 print:text-slate-600">
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
            <div className="overflow-x-auto print:overflow-visible print:bg-white">
              <table className="w-full text-left text-sm print:text-xs print:bg-white print:divide-slate-300">
                <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 text-xs uppercase font-semibold border-b border-gray-200 dark:border-gray-800 print:bg-slate-100 print:text-slate-900 print:table-header-group">
                  <tr>
                    <th className="py-3 px-4 print:py-1.5 print:px-2 print:bg-slate-100 print:text-slate-900">Time</th>
                    <th className="py-3 px-4 print:py-1.5 print:px-2 print:bg-slate-100 print:text-slate-900">Type</th>
                    <th className="py-3 px-4 print:py-1.5 print:px-2 print:bg-slate-100 print:text-slate-900">Category</th>
                    <th className="py-3 px-4 print:py-1.5 print:px-2 print:bg-slate-100 print:text-slate-900">Description</th>
                    <th className="py-3 px-4 print:py-1.5 print:px-2 print:bg-slate-100 print:text-slate-900">Ref #</th>
                    <th className="py-3 px-4 text-right print:py-1.5 print:px-2 print:bg-slate-100 print:text-slate-900">Cash In (Rs.)</th>
                    <th className="py-3 px-4 text-right print:py-1.5 print:px-2 print:bg-slate-100 print:text-slate-900">Cash Out (Rs.)</th>
                    <th className="py-3 px-4 text-center print:hidden">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/80 print:divide-slate-200 print:bg-white">
                  {filteredTransactions.map((tx) => {
                    const badge = getCategoryBadge(tx.category, tx.type);
                    const isPos = Boolean(tx.is_auto);

                    return (
                      <tr
                        key={tx.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors print:break-inside-avoid print:bg-white print:hover:bg-white"
                      >
                        <td className="py-3 px-4 text-xs font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap print:py-1.5 print:px-2 print:text-slate-600 print:bg-white">
                          {tx.entry_time || '—'}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap print:py-1.5 print:px-2">
                          {tx.type === 'IN' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 print:bg-transparent print:text-emerald-800 print:p-0">
                              <ArrowDownLeft className="w-3 h-3 print:hidden" />
                              + IN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 print:bg-transparent print:text-rose-800 print:p-0">
                              <ArrowUpRight className="w-3 h-3 print:hidden" />
                              - OUT
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap print:py-1.5 print:px-2">
                          <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-medium print:p-0 print:border-0 print:font-semibold print:text-slate-800 ${badge.bg}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-900 dark:text-gray-100 font-medium print:py-1.5 print:px-2 print:text-slate-900">
                          {tx.description}
                          {isPos && (
                            <span className="ml-2 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 print:hidden">
                              Auto
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap print:py-1.5 print:px-2 print:text-slate-600">
                          {tx.reference_no || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold font-mono text-emerald-600 dark:text-emerald-400 whitespace-nowrap print:py-1.5 print:px-2 print:text-slate-900">
                          {tx.type === 'IN'
                            ? `+ ${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold font-mono text-rose-600 dark:text-rose-400 whitespace-nowrap print:py-1.5 print:px-2 print:text-slate-900">
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
                                className="p-1.5 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
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
                <tfoot className="bg-gray-50 dark:bg-gray-800/80 font-bold text-sm border-t-2 border-gray-300 dark:border-gray-700 print:bg-slate-100 print:text-slate-900 print:table-footer-group">
                  <tr>
                    <td colSpan={5} className="py-3 px-4 text-right text-gray-700 dark:text-gray-300 print:py-2 print:px-2 print:text-slate-800">
                      Day's Total Movement:
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 font-extrabold whitespace-nowrap print:py-2 print:px-2 print:text-emerald-800 font-mono">
                      + Rs. {summary.totalCashIn.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400 font-extrabold whitespace-nowrap print:py-2 print:px-2 print:text-rose-800 font-mono">
                      - Rs. {summary.totalCashOut.toFixed(2)}
                    </td>
                    <td className="print:hidden"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── Daily Closing Signature Slip (Print Only - Page break safe) ───────── */}
        <div className="hidden print:grid grid-cols-3 gap-8 pt-8 text-xs text-slate-800 print-avoid-break">
          <div className="border-t border-slate-400 pt-2 text-center">
            <p className="font-bold text-slate-900">Prepared By (Cashier)</p>
            <p className="text-[10px] text-slate-500 mt-6">Signature & Date</p>
          </div>
          <div className="border-t border-slate-400 pt-2 text-center">
            <p className="font-bold text-slate-900">Physical Cash Verified</p>
            <p className="text-[10px] text-slate-500 mt-6">Rs. ___________________</p>
          </div>
          <div className="border-t border-slate-400 pt-2 text-center">
            <p className="font-bold text-slate-900">Approved By (Store Manager)</p>
            <p className="text-[10px] text-slate-500 mt-6">Signature & Date</p>
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
                      className={`py-2.5 px-4 rounded-xl border flex items-center justify-center gap-2 font-medium text-sm transition-all ${formData.type === 'IN'
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
                      className={`py-2.5 px-4 rounded-xl border flex items-center justify-center gap-2 font-medium text-sm transition-all ${formData.type === 'OUT'
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
                  className={`px-5 py-2 rounded-xl text-white text-sm font-semibold shadow-md transition-colors ${formData.type === 'IN'
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

      {/* ── Shift Close & Daily Z-Report Modal ───────────────────────────────────── */}
      {showShiftCloseModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 dark:bg-slate-950 text-white border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center text-slate-300">
                  <Receipt className="w-5 h-5 text-slate-200" />
                </div>
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-white">Daily Shift Close & Z-Report</h3>
                  <p className="text-xs text-slate-400">
                    Reconcile cash drawer for <strong className="text-slate-200">{selectedDate}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowShiftCloseModal(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* Status Banner if already closed */}
              {existingClosing && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>This day was previously closed at <strong>{existingClosing.closed_at}</strong>.</span>
                  </div>
                  <span className="font-semibold uppercase tracking-wider text-[10px] bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded">Recorded</span>
                </div>
              )}

              {/* Denomination Counter */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-2">
                  <Calculator className="w-3.5 h-3.5 text-slate-400" />
                  Cash Drawer Denomination Count
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-slate-50 dark:bg-slate-950/70 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  {[
                    { note: '5000', label: 'Rs. 5,000 Note' },
                    { note: '1000', label: 'Rs. 1,000 Note' },
                    { note: '500', label: 'Rs. 500 Note' },
                    { note: '100', label: 'Rs. 100 Note' },
                    { note: '50', label: 'Rs. 50 Note' },
                    { note: '20', label: 'Rs. 20 Note' },
                  ].map(({ note, label }) => {
                    const count = parseInt(closingDenoms[note] || '0', 10);
                    const subtotal = !isNaN(count) && count > 0 ? Number(note) * count : 0;
                    return (
                      <div key={note} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 shadow-2xs">
                        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">{label}</span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={closingDenoms[note] || ''}
                            onChange={(e) => setClosingDenoms({ ...closingDenoms, [note]: e.target.value })}
                            className="w-16 px-2 py-1 text-sm font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 text-center"
                          />
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono font-medium flex-1 text-right truncate">
                            {subtotal > 0 ? `Rs. ${subtotal.toLocaleString()}` : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Coins Total input */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 sm:col-span-3 shadow-2xs">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">Total Coins Amount (Rs.)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 145.00"
                      value={closingDenoms['coins'] || ''}
                      onChange={(e) => setClosingDenoms({ ...closingDenoms, coins: e.target.value })}
                      className="w-full mt-1 px-2.5 py-1 text-sm font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                    />
                  </div>
                </div>
              </div>

              {/* Till Reconciliation Comparison Box */}
              <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">Expected Closing Cash Balance:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                    {fmtRs(summary.closingBalance)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">Actual Physically Counted Cash:</span>
                  <span className="font-mono font-black text-slate-900 dark:text-white text-base">
                    {fmtRs(countedCash)}
                  </span>
                </div>

                {/* Variance Result Pill */}
                <div className={`p-3 rounded-xl border flex items-center justify-between ${Math.abs(cashVariance) < 0.01
                    ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : cashVariance > 0
                      ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                      : 'bg-rose-50 text-rose-900 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                  }`}>
                  <div className="flex items-center gap-2.5">
                    {Math.abs(cashVariance) < 0.01 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className={`w-4 h-4 shrink-0 ${cashVariance > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'}`} />
                    )}
                    <div>
                      <span className="text-xs font-bold block">
                        {Math.abs(cashVariance) < 0.01
                          ? 'Zero Discrepancy (Exact Match)'
                          : cashVariance > 0
                            ? `Cash Surplus (+${fmtRs(cashVariance)})`
                            : `Cash Shortage (-${fmtRs(Math.abs(cashVariance))})`}
                      </span>
                      <span className="text-[11px] opacity-90 block mt-0.5">
                        {Math.abs(cashVariance) < 0.01
                          ? 'Drawer count exactly matches the day’s ledger.'
                          : cashVariance > 0
                            ? 'Physical cash in drawer is higher than recorded transactions.'
                            : 'Physical cash in drawer is less than expected closing balance.'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Closing Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rs. 500 kept in till for tomorrow's petty change..."
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowShiftCloseModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={savingClosing}
                  onClick={() => handleSaveShiftClose(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  Save Record
                </button>
                <button
                  type="button"
                  disabled={savingClosing}
                  onClick={() => handleSaveShiftClose(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Save &amp; Print Z-Report
                </button>
              </div>
            </div>
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
