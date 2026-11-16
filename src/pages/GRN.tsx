import { useState, useEffect, useCallback, useRef } from 'react';
import { db, type GRNHeader, type GRNItem, type Supplier, type InventoryItem } from '../db';
import { useToast } from '../components/Toast';
import { Skeleton, EmptyState } from '../components/Skeleton';
import { printGRNVoucher } from '../utils/receipt';
import {
  Plus, Truck, X, CheckCircle2, Clock, AlertTriangle,
  Eye, Trash2, CreditCard, Banknote, Package, CalendarClock,
  ClipboardList, Printer, Search,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split('T')[0];

const fmtRs = (n: number) =>
  `Rs. ${Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return d;
};

const isOverdue = (g: GRNHeader) =>
  g.payment_type === 'CREDIT' && g.status === 'PENDING' && !!g.due_date && g.due_date < todayStr();

// ─── Types ────────────────────────────────────────────────────────────────────

interface DraftItem {
  _key: string;
  product_id: number | null;
  barcode: string;
  title: string;
  received_qty: number;
  unit_cost: number;
  selling_price: number;
}

type FilterType = 'ALL' | 'CREDIT_PENDING' | 'CASH' | 'CREDIT_PAID';

// ─── GRN Detail Modal ─────────────────────────────────────────────────────────

function GRNDetailModal({ grnId, onClose, onMarkPaid }: { grnId: number; onClose: () => void; onMarkPaid: () => void }) {
  const toast = useToast();
  const [header, setHeader] = useState<GRNHeader | null>(null);
  const [items, setItems] = useState<GRNItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    db.grn.getById(grnId).then(res => {
      if (res.success && res.data) {
        setHeader(res.data.header);
        setItems(res.data.items);
      }
      setLoading(false);
    });
  }, [grnId]);

  const handleMarkPaid = async () => {
    if (!window.confirm('Mark this GRN as PAID?')) return;
    setMarking(true);
    try {
      await db.grn.markPaid(grnId, todayStr());
      toast.success('GRN marked as paid.');
      onMarkPaid();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    } finally {
      setMarking(false);
    }
  };

  const totalQty = items.reduce((s, i) => s + (i.received_qty || 0), 0);
  const totalRetail = items.reduce((s, i) => s + ((i.received_qty || 0) * (i.selling_price || 0)), 0);
  const totalCost = header?.total_amount || 0;
  const projectedProfit = totalRetail - totalCost;
  const overallMargin = totalRetail > 0 ? Math.round((projectedProfit / totalRetail) * 1000) / 10 : 0;

  return (
    <div
      className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900/50">
              <ClipboardList className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Goods Received Note Details
              </h3>
              {header && (
                <p className="text-[11px] text-slate-400 font-mono">
                  {header.grn_number}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {header && items.length > 0 && (
              <button
                onClick={() => printGRNVoucher({ header, items })}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 rounded-lg font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
                title="Print official delivery voucher"
              >
                <Printer className="w-3.5 h-3.5 text-blue-600" />
                Print Voucher
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-5 w-full" />)}
          </div>
        ) : header ? (
          <>
            {/* Info grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 py-3.5 bg-slate-50/50 dark:bg-slate-950/30 border-b border-slate-200 dark:border-slate-800 text-xs font-mono">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">GRN Number</p>
                <p className="font-bold text-blue-600 dark:text-blue-400">{header.grn_number}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Supplier</p>
                <p className="font-medium font-sans text-slate-900 dark:text-slate-100">{header.supplier_name || 'Walk-in / Direct'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Supplier Inv / DN #</p>
                <p className="font-medium text-slate-800 dark:text-slate-200">
                  {header.supplier_invoice_no || <span className="text-slate-400 font-normal italic">—</span>}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">Received Date</p>
                <p className="font-medium text-gray-800 dark:text-gray-200">{fmtDate(header.received_date)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">Payment Type</p>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                  header.payment_type === 'CASH'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                }`}>
                  {header.payment_type === 'CASH' ? <Banknote className="w-3 h-3" /> : <CreditCard className="w-3 h-3" />}
                  {header.payment_type}
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">Status</p>
                {header.status === 'PAID' ? (
                  <span className="text-green-600 dark:text-green-400 font-bold text-xs">
                    ✓ Paid {header.paid_date ? `(${fmtDate(header.paid_date)})` : ''}
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 font-bold text-xs">
                    ⏳ Pending {header.due_date ? `(Due: ${fmtDate(header.due_date)})` : ''}
                  </span>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">Total Units</p>
                <p className="font-semibold text-gray-800 dark:text-gray-200">{totalQty} units ({items.length} items)</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">Total Cost</p>
                <p className="font-bold text-gray-900 dark:text-gray-100 text-base">{fmtRs(header.total_amount)}</p>
              </div>
              {header.notes && (
                <div className="col-span-2 md:col-span-4 bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">Notes</p>
                  <p className="text-xs text-gray-700 dark:text-gray-300">{header.notes}</p>
                </div>
              )}
            </div>

            {/* Items table */}
            <div className="overflow-auto flex-1">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Barcode</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Item Description</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Unit Cost</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Selling Price</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Margin</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Cost</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {items.map(item => {
                    const unitProfit = (item.selling_price || 0) - (item.unit_cost || 0);
                    const marginPct = item.selling_price > 0 ? Math.round((unitProfit / item.selling_price) * 1000) / 10 : 0;
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{item.barcode}</td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{item.title}</td>
                        <td className="px-4 py-3 text-center font-bold text-gray-700 dark:text-gray-300">{item.received_qty}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{fmtRs(item.unit_cost)}</td>
                        <td className="px-4 py-3 text-right font-medium text-blue-600 dark:text-blue-400">
                          {item.selling_price > 0 ? fmtRs(item.selling_price) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item.selling_price > 0 ? (
                            unitProfit >= 0 ? (
                              <span className="text-xs font-bold text-green-600 dark:text-green-400">
                                +{fmtRs(unitProfit)} <span className="text-[10px] text-gray-400 font-normal">({marginPct}%)</span>
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-red-600 dark:text-red-400">
                                {fmtRs(unitProfit)}
                              </span>
                            )
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-gray-100">{fmtRs(item.total_cost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-gray-900/50 font-bold border-t-2 border-gray-200 dark:border-gray-700">
                    <td colSpan={2} className="px-4 py-3 text-gray-700 dark:text-gray-300 text-xs">
                      Grand Totals ({items.length} items · {totalQty} units)
                    </td>
                    <td colSpan={3} className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 text-xs font-medium">
                      Total Retail Value: <span className="text-blue-600 dark:text-blue-400 font-bold">{fmtRs(totalRetail)}</span>
                      {totalRetail > 0 && (
                        <span className="ml-2 text-green-600 dark:text-green-400 font-bold">
                          (+{fmtRs(projectedProfit)} / {overallMargin}%)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400 font-semibold">Total Cost:</td>
                    <td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400 text-base">{fmtRs(header.total_amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
              <button
                onClick={() => printGRNVoucher({ header, items })}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors cursor-pointer text-sm shadow-sm"
              >
                <Printer className="w-4 h-4" />
                Print Voucher
              </button>
              <div className="flex gap-3">
                {header.payment_type === 'CREDIT' && header.status === 'PENDING' && (
                  <button
                    onClick={handleMarkPaid}
                    disabled={marking}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-bold transition-colors cursor-pointer text-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {marking ? 'Saving…' : 'Mark as Paid'}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-bold transition-colors cursor-pointer text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-red-500">Failed to load GRN.</div>
        )}
      </div>
    </div>
  );
}

// ─── New GRN Modal ────────────────────────────────────────────────────────────

function NewGRNModal({ suppliers, onClose, onCreated }: { suppliers: Supplier[]; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [receivedDate, setReceivedDate] = useState(todayStr());
  const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT'>('CASH');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<InventoryItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!term.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await db.inventory.search(term);
      setSearchResults(res.data ?? []);
      setShowDropdown(true);
      setSearching(false);
    }, 200);
  }, []);

  const addInventoryItem = (inv: InventoryItem) => {
    setDraftItems(prev => {
      const exists = prev.find(d => d.product_id === inv.id);
      if (exists) return prev.map(d => d.product_id === inv.id ? { ...d, received_qty: d.received_qty + 1 } : d);
      return [...prev, {
        _key: `${inv.id}-${Date.now()}`,
        product_id: inv.id ?? null,
        barcode: inv.barcode,
        title: inv.title,
        received_qty: 1,
        unit_cost: inv.cost_price,
        selling_price: inv.selling_price,
      }];
    });
    setSearchTerm('');
    setSearchResults([]);
    setShowDropdown(false);
    searchRef.current?.focus();
  };

  const addManualItem = () => {
    if (!searchTerm.trim()) return;
    setDraftItems(prev => [...prev, {
      _key: `manual-${Date.now()}`,
      product_id: null,
      barcode: searchTerm.trim(),
      title: 'Manual Item',
      received_qty: 1,
      unit_cost: 0,
      selling_price: 0,
    }]);
    setSearchTerm('');
    setShowDropdown(false);
  };

  const updateItem = (key: string, field: keyof DraftItem, value: string | number) =>
    setDraftItems(prev => prev.map(d => d._key === key ? { ...d, [field]: value } : d));

  const removeItem = (key: string) => setDraftItems(prev => prev.filter(d => d._key !== key));

  // Totals & Analytics
  const totalUnits = draftItems.reduce((s, i) => s + (Number(i.received_qty) || 0), 0);
  const grandCost = draftItems.reduce((s, i) => s + (Number(i.received_qty) || 0) * (Number(i.unit_cost) || 0), 0);
  const grandRetail = draftItems.reduce((s, i) => s + (Number(i.received_qty) || 0) * (Number(i.selling_price) || 0), 0);
  const expectedProfit = grandRetail - grandCost;
  const overallMarginPct = grandRetail > 0 ? Math.round((expectedProfit / grandRetail) * 1000) / 10 : 0;

  const handleSave = async () => {
    if (draftItems.length === 0) { toast.warning('Add at least one item.'); return; }
    if (paymentType === 'CREDIT' && !dueDate) { toast.warning('Please set a repayment due date.'); return; }
    setSaving(true);
    try {
      const res = await db.grn.create({
        supplier_id: supplierId ? parseInt(supplierId, 10) : null,
        supplier_invoice_no: supplierInvoiceNo.trim() || null,
        received_date: receivedDate,
        payment_type: paymentType,
        due_date: paymentType === 'CREDIT' ? dueDate : null,
        notes: notes.trim() || undefined,
        items: draftItems.map(d => ({
          product_id: d.product_id,
          barcode: d.barcode,
          title: d.title,
          received_qty: Number(d.received_qty),
          unit_cost: Number(d.unit_cost),
          selling_price: Number(d.selling_price) || 0,
        })),
      });
      if (!res.success) throw new Error(res.error || 'Failed');
      toast.success(`${res.grn_number} saved. Stock & prices updated.`, 'GRN Created');
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save GRN');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col border border-gray-200 dark:border-gray-700">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                New Goods Received Note (GRN)
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Record distributor stock inward, update cost & selling prices, and track supplier payables.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Top Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wider">
                Supplier
              </label>
              <select className={inputCls} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">— Walk-in / Direct Delivery —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wider">
                Supplier Inv / Delivery Note #
              </label>
              <input
                type="text"
                className={inputCls}
                value={supplierInvoiceNo}
                onChange={e => setSupplierInvoiceNo(e.target.value)}
                placeholder="e.g. INV-9840, DN-102"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wider">
                Received Date *
              </label>
              <input
                type="date"
                className={inputCls}
                value={receivedDate}
                onChange={e => setReceivedDate(e.target.value)}
              />
            </div>

            {/* Payment toggle */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wider">
                Payment Method *
              </label>
              <div className="flex gap-2">
                {(['CASH', 'CREDIT'] as const).map(pt => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => setPaymentType(pt)}
                    className={`flex-1 py-1.5 rounded-lg border-2 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      paymentType === pt
                        ? pt === 'CASH'
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                        : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400'
                    }`}
                  >
                    {pt === 'CASH' ? <Banknote className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
                    {pt}
                  </button>
                ))}
              </div>
            </div>

            {paymentType === 'CREDIT' ? (
              <div>
                <label className="block text-xs font-bold text-amber-600 dark:text-amber-400 mb-1 uppercase tracking-wider flex items-center gap-1">
                  <CalendarClock className="w-3.5 h-3.5" /> Repayment Due Date *
                </label>
                <input
                  type="date"
                  min={todayStr()}
                  className={`${inputCls} ${!dueDate ? 'border-amber-400 dark:border-amber-500 ring-1 ring-amber-400' : ''}`}
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">
                  Payment Status
                </label>
                <div className="py-2 px-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-semibold rounded-lg flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Cash settled immediately
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wider">
                Notes (optional)
              </label>
              <input
                type="text"
                className={inputCls}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Delivered by driver Kamalan, batch notes"
              />
            </div>
          </div>

          {/* Shipment Analytics Bar */}
          {draftItems.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5">
              <div>
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Shipment Size</p>
                <p className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {draftItems.length} lines <span className="text-xs font-medium text-gray-500">({totalUnits} units)</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Cost (Payable)</p>
                <p className="text-base font-bold text-gray-900 dark:text-gray-100">{fmtRs(grandCost)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Total Retail Value</p>
                <p className="text-base font-bold text-blue-600 dark:text-blue-400">{fmtRs(grandRetail)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Expected Profit & Margin</p>
                <p className={`text-base font-bold ${expectedProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {expectedProfit >= 0 ? `+${fmtRs(expectedProfit)}` : fmtRs(expectedProfit)}
                  <span className="text-xs ml-1 font-semibold">({overallMarginPct}%)</span>
                </p>
              </div>
            </div>
          )}

          {/* Items Section */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-500" />
                Received Items & Pricing
              </h4>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Updating selling price here updates the item in inventory & POS immediately
              </span>
            </div>

            {/* Search / Add Bar */}
            <div className="relative mb-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    ref={searchRef}
                    type="text"
                    className={inputCls}
                    placeholder="Search by barcode, SKU, or item title to add…"
                    value={searchTerm}
                    onChange={e => handleSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') { setShowDropdown(false); setSearchTerm(''); }
                      if (e.key === 'Enter' && searchResults.length === 0 && searchTerm.trim()) addManualItem();
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={addManualItem}
                  disabled={!searchTerm.trim()}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg font-semibold text-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Manual
                </button>
              </div>

              {/* Dropdown */}
              {showDropdown && (
                <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                  {searching && <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">Searching…</div>}
                  {!searching && searchResults.length === 0 && (
                    <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">
                      No match found — press Enter or click 'Add Manual' to add as new item.
                    </div>
                  )}
                  {searchResults.map(inv => (
                    <div
                      key={inv.id}
                      onClick={() => addInventoryItem(inv)}
                      className="flex justify-between items-center px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer border-b border-gray-100 dark:border-gray-600 last:border-0 transition-colors"
                    >
                      <div>
                        <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{inv.title}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">{inv.barcode}</div>
                      </div>
                      <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                        <div>Cost: {fmtRs(inv.cost_price)} · Sell: {fmtRs(inv.selling_price)}</div>
                        <div>Current Stock: {inv.quantity}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Draft Items Table */}
            {draftItems.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-gray-400 dark:text-gray-500 text-sm">
                <Truck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Scan barcode or search items above to build this Goods Received Note
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase w-28">Barcode</th>
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Item Description</th>
                      <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase w-16">Qty</th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase w-24">Unit Cost</th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-blue-600 dark:text-blue-400 uppercase w-28">New Sell Price</th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase w-32">Unit Profit & Margin</th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase w-28">Total Cost</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {draftItems.map(item => {
                      const unitCost = Number(item.unit_cost) || 0;
                      const sellPrice = Number(item.selling_price) || 0;
                      const unitProfit = sellPrice - unitCost;
                      const marginPct = sellPrice > 0 ? Math.round((unitProfit / sellPrice) * 1000) / 10 : 0;

                      return (
                        <tr key={item._key} className="hover:bg-gray-50/50 dark:hover:bg-gray-750">
                          <td className="px-3 py-2">
                            <input
                              className="w-24 p-1.5 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              value={item.barcode}
                              onChange={e => updateItem(item._key, 'barcode', e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              value={item.title}
                              onChange={e => updateItem(item._key, 'title', e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={1}
                              className="w-16 p-1.5 text-sm text-center border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded font-bold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              value={item.received_qty}
                              onChange={e => updateItem(item._key, 'received_qty', Math.max(1, parseInt(e.target.value) || 1))}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              className="w-24 p-1.5 text-sm text-right border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              value={item.unit_cost}
                              onChange={e => updateItem(item._key, 'unit_cost', parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              className="w-28 p-1.5 text-sm text-right font-bold border-2 border-blue-400 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 text-gray-900 dark:text-gray-100 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                              value={item.selling_price}
                              onChange={e => updateItem(item._key, 'selling_price', parseFloat(e.target.value) || 0)}
                              title="New retail selling price for this batch"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            {sellPrice <= 0 ? (
                              <span className="text-xs text-gray-400 italic">No price set</span>
                            ) : unitProfit >= 0 ? (
                              <div className="flex flex-col items-end">
                                <span className="text-xs font-bold text-green-600 dark:text-green-400">
                                  +{fmtRs(unitProfit)}
                                </span>
                                <span className="text-[10px] font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/40 px-1.5 py-0.5 rounded-full">
                                  {marginPct}% margin
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-end">
                                <span className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> {fmtRs(unitProfit)}
                                </span>
                                <span className="text-[10px] font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/40 px-1.5 py-0.5 rounded-full">
                                  Loss ({marginPct}%)
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-gray-800 dark:text-gray-100">
                            {fmtRs(item.received_qty * item.unit_cost)}
                          </td>
                          <td className="px-2 py-2">
                            <button
                              onClick={() => removeItem(item._key)}
                              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors cursor-pointer"
                              title="Remove line"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 dark:bg-gray-900/50 font-bold border-t border-gray-200 dark:border-gray-700">
                      <td colSpan={2} className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-400">
                        Total: {draftItems.length} lines · {totalUnits} units
                      </td>
                      <td colSpan={3} className="px-3 py-2.5 text-right text-xs text-gray-600 dark:text-gray-400 font-medium">
                        Total Retail Value: <span className="text-blue-600 dark:text-blue-400 font-bold">{fmtRs(grandRetail)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-600 dark:text-gray-400 font-semibold">
                        Grand Total Cost:
                      </td>
                      <td className="px-3 py-2.5 text-right text-blue-600 dark:text-blue-400 text-base font-bold">
                        {fmtRs(grandCost)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {draftItems.length} line(s) · {totalUnits} units · Total Cost: <strong className="text-gray-900 dark:text-gray-100">{fmtRs(grandCost)}</strong>
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-bold transition-colors cursor-pointer text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || draftItems.length === 0}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-colors cursor-pointer text-sm shadow-sm"
            >
              <Truck className="w-4 h-4" />
              {saving ? 'Saving GRN…' : 'Save GRN & Update Stock'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main GRN Page ────────────────────────────────────────────────────────────

export default function GRN() {
  const toast = useToast();
  const [grns, setGrns] = useState<GRNHeader[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [printingId, setPrintingId] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [grnRes, supRes] = await Promise.all([db.grn.getAll(), db.suppliers.getAll()]);
      setGrns(grnRes.data ?? []);
      setSuppliers(supRes.data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDelete = async (grn: GRNHeader) => {
    if (!window.confirm(`Delete GRN ${grn.grn_number}?\n\nThis will REVERSE the stock quantities that were added.`)) return;
    setDeleting(grn.id!);
    try {
      await db.grn.delete(grn.id!);
      toast.success(`${grn.grn_number} deleted. Stock reversed.`);
      fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const handlePrintVoucher = async (grn: GRNHeader) => {
    if (!grn.id) return;
    setPrintingId(grn.id);
    try {
      const res = await db.grn.getById(grn.id);
      if (res.success && res.data) {
        printGRNVoucher(res.data);
        toast.success(`Printing voucher for ${grn.grn_number}...`);
      } else {
        toast.error('Could not load GRN items for printing.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Print failed');
    } finally {
      setPrintingId(null);
    }
  };

  const filtered = grns.filter(g => {
    if (filter === 'CREDIT_PENDING' && !(g.payment_type === 'CREDIT' && g.status === 'PENDING')) return false;
    if (filter === 'CASH' && g.payment_type !== 'CASH') return false;
    if (filter === 'CREDIT_PAID' && !(g.payment_type === 'CREDIT' && g.status === 'PAID')) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchGrn = g.grn_number.toLowerCase().includes(q);
      const matchSup = g.supplier_name ? g.supplier_name.toLowerCase().includes(q) : false;
      const matchInv = g.supplier_invoice_no ? g.supplier_invoice_no.toLowerCase().includes(q) : false;
      if (!matchGrn && !matchSup && !matchInv) return false;
    }
    return true;
  });

  const pendingCount = grns.filter(g => g.payment_type === 'CREDIT' && g.status === 'PENDING').length;
  const overdueCount = grns.filter(isOverdue).length;
  const totalCredit = grns.filter(g => g.payment_type === 'CREDIT' && g.status === 'PENDING').reduce((s, g) => s + g.total_amount, 0);

  return (
    <div className="p-6 lg:p-8 h-full flex flex-col space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900/50">
              <ClipboardList className="w-4 h-4" />
            </div>
            <span>Goods Received Notes (GRN)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Receive distributor shipments, print delivery vouchers, and audit batch margins.
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-semibold text-xs shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> New GRN
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-xl p-4 flex items-center gap-3 shadow-2xs">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-2 text-slate-700 dark:text-slate-300">
            <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">{grns.length}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Total GRNs Recorded</p>
          </div>
        </div>
        <div className={`border rounded-xl p-4 flex items-center gap-3 shadow-2xs ${
          overdueCount > 0
            ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40'
            : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800/90'
        }`}>
          <div className="rounded-lg p-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            <Clock className={`w-4 h-4 ${pendingCount > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
          </div>
          <div>
            <p className={`text-lg font-bold font-mono tabular-nums ${overdueCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>
              {pendingCount}
              {overdueCount > 0 && <span className="text-xs ml-1 font-semibold">({overdueCount} overdue)</span>}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Pending Credit Deliveries</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-xl p-4 flex items-center gap-3 shadow-2xs">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-2 text-slate-700 dark:text-slate-300">
            <CreditCard className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <p className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">{fmtRs(totalCredit)}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Outstanding Credit Payables</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs and Search Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-medium border border-slate-200/60 dark:border-slate-700/60">
          {([
            { key: 'ALL', label: 'All GRNs' },
            { key: 'CREDIT_PENDING', label: `Pending Credit${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
            { key: 'CASH', label: 'Cash' },
            { key: 'CREDIT_PAID', label: 'Credit (Paid)' },
          ] as { key: FilterType; label: string }[]).map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                filter === f.key
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search GRN #, supplier, inv #…"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 shadow-2xs"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-slate-200/90 dark:border-slate-800/90 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1 overflow-y-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            <thead className="bg-slate-50/80 dark:bg-slate-950/50 sticky top-0 z-10 backdrop-blur-xs">
              <tr>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">GRN #</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Supplier</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Inv / DN #</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Received</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Payment</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Due Date</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
              {loading && [0, 1, 2, 3].map(r => (
                <tr key={r}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(c => <td key={c} className="px-5 py-4"><Skeleton className="h-4 w-full" /></td>)}
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      icon={<ClipboardList className="w-10 h-10" />}
                      title="No GRNs found"
                      subtitle={searchQuery ? 'Try clearing your search query.' : "Click 'New GRN' to record a distributor delivery and update stock."}
                    />
                  </td>
                </tr>
              )}
              {!loading && filtered.map(grn => {
                const overdue = isOverdue(grn);
                return (
                  <tr key={grn.id} className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${overdue ? 'bg-rose-50/20 dark:bg-rose-950/10' : ''}`}>
                    <td className="px-5 py-3 font-semibold font-mono text-xs text-blue-600 dark:text-blue-400">
                      {grn.grn_number}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-800 dark:text-slate-200 font-medium">
                      {grn.supplier_name || <span className="italic text-slate-400 font-normal">Walk-in</span>}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-slate-600 dark:text-slate-400">
                      {grn.supplier_invoice_no || <span className="text-slate-400 italic">—</span>}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-slate-600 dark:text-slate-400">{fmtDate(grn.received_date)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        grn.payment_type === 'CASH'
                          ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200/80 dark:border-amber-900/40'
                      }`}>
                        {grn.payment_type === 'CASH' ? <Banknote className="w-3 h-3" /> : <CreditCard className="w-3 h-3" />}
                        {grn.payment_type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs font-mono">
                      {grn.payment_type === 'CREDIT' ? (
                        <span className={`flex items-center gap-1 ${overdue ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>
                          {overdue && <AlertTriangle className="w-3 h-3" />}
                          {fmtDate(grn.due_date)}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      {grn.payment_type === 'CASH' || grn.status === 'PAID' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> Paid
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${overdue ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          <Clock className="w-3 h-3" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{fmtRs(grn.total_amount)}</td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex justify-center items-center gap-1">
                        <button
                          onClick={() => setViewId(grn.id!)}
                          title="View details"
                          className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handlePrintVoucher(grn)}
                          disabled={printingId === grn.id}
                          title="Print official delivery voucher"
                          className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(grn)}
                          disabled={deleting === grn.id}
                          title="Delete (reverses stock)"
                          className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showNewModal && (
        <NewGRNModal
          suppliers={suppliers}
          onClose={() => setShowNewModal(false)}
          onCreated={fetchAll}
        />
      )}
      {viewId !== null && (
        <GRNDetailModal
          grnId={viewId}
          onClose={() => setViewId(null)}
          onMarkPaid={fetchAll}
        />
      )}
    </div>
  );
}
