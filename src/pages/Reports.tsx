import { useState, useEffect, useMemo, useCallback } from 'react';
import { db, type RevenueAnalytics } from '../db';
import { localDateString } from '../utils/dates';
import { useToast } from '../components/Toast';
import { Skeleton, EmptyState } from '../components/Skeleton';
import {
  BarChart,
  Calendar,
  DollarSign,
  Printer,
  CreditCard,
  Banknote,
  Search,
  BookOpen,
  Wrench,
  Package,
  Layers,
  TrendingUp,
  RefreshCw,
  Filter,
  CheckCircle2,
  PieChart,
  ArrowUpRight,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtRs = (n: number) =>
  `Rs. ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function getCategoryColor(category: string) {
  switch (category?.toUpperCase()) {
    case 'BOOK':
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
        bar: 'bg-emerald-500',
      };
    case 'SERVICE':
      return {
        bg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
        bar: 'bg-blue-500',
      };
    case 'STATIONERY':
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
        bar: 'bg-amber-500',
      };
    default:
      return {
        bg: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
        badge: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
        bar: 'bg-purple-500',
      };
  }
}

function getCategoryIcon(category: string) {
  switch (category?.toUpperCase()) {
    case 'BOOK':
      return BookOpen;
    case 'SERVICE':
      return Wrench;
    case 'STATIONERY':
      return Layers;
    default:
      return Package;
  }
}

export default function Reports() {
  const toast = useToast();

  // ── Date Preset State ───────────────────────────────────────────────────────
  const [datePreset, setDatePreset] = useState<'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM'>('TODAY');
  const [startDate, setStartDate] = useState(() => localDateString());
  const [endDate, setEndDate] = useState(() => localDateString());

  // ── Filter State ────────────────────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedPaymentType, setSelectedPaymentType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Analytics Data State ────────────────────────────────────────────────────
  const [data, setData] = useState<RevenueAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  // Apply Date Preset
  const applyPreset = (preset: 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM') => {
    setDatePreset(preset);
    const now = new Date();

    if (preset === 'TODAY') {
      const today = localDateString();
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'YESTERDAY') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = localDateString(y);
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === 'THIS_WEEK') {
      const day = now.getDay(); // 0 is Sunday
      const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diffToMonday));
      setStartDate(localDateString(monday));
      setEndDate(localDateString());
    } else if (preset === 'THIS_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(localDateString(firstDay));
      setEndDate(localDateString());
    } else if (preset === 'LAST_MONTH') {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(localDateString(firstDayLastMonth));
      setEndDate(localDateString(lastDayLastMonth));
    }
  };

  // Fetch Report Data
  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await db.reports.getRevenueAnalytics({
        startDate,
        endDate,
        category: selectedCategory,
        paymentType: selectedPaymentType,
        search: searchQuery,
      });

      if (res.success && res.data) {
        setData(res.data);
      } else {
        toast.error(res.error || 'Failed to load revenue analytics');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error loading report');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedCategory, selectedPaymentType, searchQuery, toast]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Detected Categories List for Filters
  const availableCategories = useMemo(() => {
    const defaultList = ['BOOK', 'SERVICE', 'STATIONERY', 'OTHER'];
    if (!data?.categoryBreakdown) return defaultList;
    const fromData = data.categoryBreakdown.map((c) => c.category);
    return Array.from(new Set([...defaultList, ...fromData]));
  }, [data]);

  const summary = data?.summary || {
    totalRevenue: 0,
    totalCost: 0,
    grossProfit: 0,
    profitMargin: 0,
    totalItemsSold: 0,
    transactionCount: 0,
  };

  const categoryBreakdown = data?.categoryBreakdown || [];
  const items = data?.items || [];
  const paymentBreakdown = data?.paymentBreakdown || [];

  return (
    <div className="p-6 lg:p-8 h-full flex flex-col overflow-y-auto space-y-4">
      {/* ── Top Header Bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-center gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900/50">
              <BarChart className="w-4 h-4" />
            </div>
            <span>Revenue & Category Analytics</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Analyze gross sales, net profit margins, and performance across product categories
          </p>
        </div>

        {/* Date Preset Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Preset Buttons */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-medium border border-slate-200/60 dark:border-slate-700/60">
            {(
              [
                { key: 'TODAY', label: 'Today' },
                { key: 'YESTERDAY', label: 'Yesterday' },
                { key: 'THIS_WEEK', label: 'This Week' },
                { key: 'THIS_MONTH', label: 'This Month' },
                { key: 'LAST_MONTH', label: 'Last Month' },
                { key: 'CUSTOM', label: 'Custom' },
              ] as const
            ).map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  datePreset === p.key
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date Picker Inputs */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs shadow-2xs font-mono">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setDatePreset('CUSTOM');
                setStartDate(e.target.value);
              }}
              className="bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none font-medium"
            />
            <span className="text-slate-400 font-bold">&rarr;</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setDatePreset('CUSTOM');
                setEndDate(e.target.value);
              }}
              className="bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none font-medium"
            />
          </div>

          <button
            onClick={() => fetchAnalytics()}
            title="Refresh analytics"
            className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 transition-colors shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => window.print()}
            title="Print report"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* ── Printable Header ────────────────────────────────────────────────────── */}
      <div className="hidden print:block mb-6 p-4 border-b border-slate-300 bg-white text-black">
        <h1 className="text-xl font-bold">HIRU BOOKSHOP & COMMUNICATION</h1>
        <p className="text-xs text-slate-600">Sales & Revenue Breakdown by Category & Product</p>
        <div className="flex justify-between items-center text-[10px] text-slate-500 mt-2">
          <span>Date Range: {startDate} to {endDate}</span>
          <span>Category Filter: {selectedCategory}</span>
          <span>Printed: {new Date().toLocaleString('en-LK')}</span>
        </div>
      </div>

      {/* ── Filter Options Bar ──────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/90 dark:border-slate-800/90 flex flex-wrap items-center justify-between gap-3 shadow-2xs print:hidden">
        {/* Category Filter Buttons */}
        <div className="flex items-center flex-wrap gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Category:
          </span>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-medium border border-slate-200/60 dark:border-slate-700/60">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                selectedCategory === 'ALL'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Categories
            </button>
            <button
              onClick={() => setSelectedCategory('BOOK')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                selectedCategory === 'BOOK'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BookOpen className="w-3 h-3" />
              Books
            </button>
            <button
              onClick={() => setSelectedCategory('SERVICE')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                selectedCategory === 'SERVICE'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Wrench className="w-3 h-3" />
              Services
            </button>
            <button
              onClick={() => setSelectedCategory('STATIONERY')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                selectedCategory === 'STATIONERY'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Layers className="w-3 h-3" />
              Stationery
            </button>
            <button
              onClick={() => setSelectedCategory('OTHER')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                selectedCategory === 'OTHER'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Package className="w-3 h-3" />
              Other
            </button>
          </div>
        </div>

        {/* Payment & Search Filters */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Payment Type Selector */}
          <select
            value={selectedPaymentType}
            onChange={(e) => setSelectedPaymentType(e.target.value)}
            className="py-1.5 px-2.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-600"
          >
            <option value="ALL">All Payment Types</option>
            <option value="CASH">Cash Only</option>
            <option value="CARD">Card Only</option>
          </select>

          {/* Search Bar */}
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter item name, barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* ── 4 Primary Metric Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Gross Sales Revenue */}
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 shadow-2xs relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Gross Revenue {selectedCategory !== 'ALL' ? `(${selectedCategory})` : ''}
            </span>
            <div className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {fmtRs(summary.totalRevenue)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Across {summary.transactionCount} transactions
          </p>
        </div>

        {/* Card 2: Wholesale Cost of Goods */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Wholesale Cost of Goods
            </span>
            <div className="p-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-700 dark:text-gray-300 mt-2">
            - {fmtRs(summary.totalCost)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Inventory cost (Services cost: Rs. 0.00)
          </p>
        </div>

        {/* Card 3: Gross Profit */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Gross Profit
            </span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
            + {fmtRs(summary.grossProfit)}
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 font-semibold">
            Profit Margin: {summary.profitMargin.toFixed(1)}%
          </p>
        </div>

        {/* Card 4: Volume & Tender */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Units Sold & Tender
            </span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-lg">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
            {summary.totalItemsSold.toLocaleString()} units
          </p>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span>Cash: {fmtRs(paymentBreakdown.find((p) => p.payment_type === 'CASH')?.total || 0)}</span>
            <span>Card: {fmtRs(paymentBreakdown.find((p) => p.payment_type === 'CARD')?.total || 0)}</span>
          </div>
        </div>
      </div>

      {/* ── Category Breakdown Section ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <PieChart className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              Revenue Breakdown by Category
            </h3>
          </div>
          <span className="text-xs text-gray-400">
            Click any category to filter the item report below
          </span>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-full" />
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          </div>
        ) : categoryBreakdown.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-4 text-center">
            No category revenue recorded for the selected date range.
          </p>
        ) : (
          <>
            {/* Visual Revenue Share Bar */}
            <div className="w-full h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden flex mb-6">
              {categoryBreakdown.map((cat) => {
                const color = getCategoryColor(cat.category);
                return (
                  <div
                    key={cat.category}
                    style={{ width: `${Math.max(2, cat.percentage)}%` }}
                    className={`${color.bar} transition-all`}
                    title={`${cat.category}: ${cat.percentage.toFixed(1)}% (Rs. ${cat.revenue.toFixed(2)})`}
                  />
                );
              })}
            </div>

            {/* Category Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {categoryBreakdown.map((cat) => {
                const color = getCategoryColor(cat.category);
                const Icon = getCategoryIcon(cat.category);
                const isSelected = selectedCategory === cat.category;

                return (
                  <div
                    key={cat.category}
                    onClick={() =>
                      setSelectedCategory(isSelected ? 'ALL' : cat.category)
                    }
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'ring-2 ring-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 shadow-md'
                        : `${color.bg} hover:shadow-md hover:scale-[1.01]`
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        <span className="font-bold text-sm tracking-wide">
                          {cat.category === 'BOOK'
                            ? 'Books'
                            : cat.category === 'SERVICE'
                            ? 'Services'
                            : cat.category === 'STATIONERY'
                            ? 'Stationery'
                            : cat.category}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-white/80 dark:bg-gray-900/80">
                        {cat.percentage.toFixed(1)}% Share
                      </span>
                    </div>

                    <p className="text-xl font-black mt-2">{fmtRs(cat.revenue)}</p>

                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-black/5 dark:border-white/10 text-xs">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 block text-[10px] uppercase font-semibold">
                          Items Sold
                        </span>
                        <span className="font-bold">{cat.itemsSold}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 block text-[10px] uppercase font-semibold">
                          Gross Profit
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {fmtRs(cat.profit)} ({cat.margin.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Item-Wise Revenue & Performance Table ─────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col flex-1">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              Item & Service Sales Performance Ranking
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-semibold">
              {items.length} items
            </span>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400 print:hidden">
            Ranked by total revenue generated
          </div>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/60 sticky top-0 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 text-center w-12">#</th>
                <th className="py-3 px-4 text-left">Product / Service</th>
                <th className="py-3 px-4 text-left">Category</th>
                <th className="py-3 px-4 text-right">Quantity Sold</th>
                <th className="py-3 px-4 text-right">Avg Price</th>
                <th className="py-3 px-4 text-right">Total Revenue</th>
                <th className="py-3 px-4 text-right">Wholesale Cost</th>
                <th className="py-3 px-4 text-right">Gross Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {loading ? (
                [0, 1, 2, 3, 4].map((r) => (
                  <tr key={r}>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((c) => (
                      <td key={c} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12">
                    <EmptyState
                      icon={<BarChart className="w-12 h-12 text-gray-400" />}
                      title="No sales found"
                      subtitle="No sales matched the selected date range and filters. Try adjusting the dates or category filter."
                    />
                  </td>
                </tr>
              ) : (
                items.map((item, index) => {
                  const color = getCategoryColor(item.category);
                  const marginPct =
                    item.totalRevenue > 0
                      ? Math.round((item.profit / item.totalRevenue) * 100)
                      : 0;

                  return (
                    <tr
                      key={`${item.productId}-${item.barcode}-${index}`}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                    >
                      <td className="py-3 px-4 text-center font-bold text-xs text-gray-400">
                        {index + 1}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-gray-900 dark:text-gray-100">
                          {item.title}
                        </div>
                        {item.barcode && (
                          <div className="text-xs font-mono text-gray-400">
                            {item.barcode}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-bold ${color.badge}`}>
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-gray-900 dark:text-gray-100">
                        {item.quantitySold}
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-gray-600 dark:text-gray-300">
                        Rs. {item.avgPrice.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-extrabold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        {fmtRs(item.totalRevenue)}
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {fmtRs(item.totalCost)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        <div>+{fmtRs(item.profit)}</div>
                        <div className="text-[10px] text-emerald-700 dark:text-emerald-500 font-semibold">
                          ({marginPct}% margin)
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot className="bg-gray-50 dark:bg-gray-900/80 font-bold border-t-2 border-gray-200 dark:border-gray-700 text-sm">
                <tr>
                  <td colSpan={3} className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">
                    Grand Total:
                  </td>
                  <td className="py-3 px-4 text-right text-gray-900 dark:text-white">
                    {summary.totalItemsSold}
                  </td>
                  <td></td>
                  <td className="py-3 px-4 text-right text-indigo-600 dark:text-indigo-400 font-black">
                    {fmtRs(summary.totalRevenue)}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400">
                    {fmtRs(summary.totalCost)}
                  </td>
                  <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 font-black">
                    +{fmtRs(summary.grossProfit)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
