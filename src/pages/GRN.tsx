import { useState, useEffect, useCallback, useRef } from 'react';
import { db, type GRNHeader, type GRNItem, type Supplier, type InventoryItem } from '../db';
import { useToast } from '../components/Toast';
import { Skeleton, EmptyState } from '../components/Skeleton';
import {
  Plus, Truck, X, CheckCircle2, Clock, AlertTriangle,
  Eye, Trash2, CreditCard, Banknote, Package, CalendarClock,
  ClipboardList,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split('T')[0];

const fmtRs = (n: number) =>
  `Rs. ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
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
      if (res.success && res.data) { setHeader(res.data.header); setItems(res.data.items); }
      setLoading(false);
    });
  }, [grnId]);

  const handleMarkPaid = async () => {
    if (!window.confirm('Mark this GRN as PAID?')) return;
    setMarking(true);
    try {
      await db.grn.markPaid(grnId, todayStr());
      toast.success('GRN marked as paid.');
      onMarkPaid(); onClose();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setMarking(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            GRN Details
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {[0,1,2,3].map(i => <Skeleton key={i} className="h-5 w-full" />)}
          </div>
        ) : header ? (
          <>
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-4 px-6 py-4 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">GRN Number</p>
                <p className="font-bold text-gray-900 dark:text-gray-100 font-mono">{header.grn_number}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Supplier</p>
                <p className="font-medium text-gray-800 dark:text-gray-200">{header.supplier_name || 'Walk-in / Unknown'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Received Date</p>
                <p className="font-medium text-gray-800 dark:text-gray-200">{fmtDate(header.received_date)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Payment</p>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                  header.payment_type === 'CASH'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                }`}>
                  {header.payment_type === 'CASH' ? <Banknote className="w-3 h-3" /> : <CreditCard className="w-3 h-3" />}
                  {header.payment_type}
                </span>
              </div>
              {header.payment_type === 'CREDIT' && (
                <>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Due Date</p>
                    <p className={`font-medium ${isOverdue(header) ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-800 dark:text-gray-200'}`}>
                      {isOverdue(header) && <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />}
                      {fmtDate(header.due_date)}
                      {isOverdue(header) && ' — Overdue!'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Status</p>
                    {header.status === 'PAID'
                      ? <span className="text-green-600 dark:text-green-400 font-bold text-sm">✓ Paid on {fmtDate(header.paid_date)}</span>
                      : <span className="text-amber-600 dark:text-amber-400 font-bold text-sm">⏳ Pending</span>}
                  </div>
                </>
              )}
              {header.notes && (
                <div className="col-span-2">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{header.notes}</p>
                </div>
              )}
            </div>

            {/* Items table */}
            <div className="overflow-auto flex-1">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Barcode</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Item</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Unit Cost</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Selling Price</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Cost</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {items.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{item.barcode}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{item.title}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{item.received_qty}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{fmtRs(item.unit_cost)}</td>
                      <td className="px-4 py-3 text-right font-medium text-blue-600 dark:text-blue-400">
                        {item.selling_price > 0 ? fmtRs(item.selling_price) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-gray-100">{fmtRs(item.total_cost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-gray-900/50 font-bold">
                    <td colSpan={5} className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">Grand Total</td>
                    <td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400 text-base">{fmtRs(header.total_amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
              {header.payment_type === 'CREDIT' && header.status === 'PENDING' && (
                <button
                  onClick={handleMarkPaid}
                  disabled={marking}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-bold transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {marking ? 'Saving…' : 'Mark as Paid'}
                </button>
              )}
              <button onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-bold transition-colors cursor-pointer">
                Close
              </button>
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
    setSearchTerm(''); setSearchResults([]); setShowDropdown(false);
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
    setSearchTerm(''); setShowDropdown(false);
  };

  const updateItem = (key: string, field: keyof DraftItem, value: string | number) =>
    setDraftItems(prev => prev.map(d => d._key === key ? { ...d, [field]: value } : d));

  const removeItem = (key: string) => setDraftItems(prev => prev.filter(d => d._key !== key));

  const grandTotal = draftItems.reduce((s, i) => s + i.received_qty * i.unit_cost, 0);

  const handleSave = async () => {
    if (draftItems.length === 0) { toast.warning('Add at least one item.'); return; }
    if (paymentType === 'CREDIT' && !dueDate) { toast.warning('Please set a repayment due date.'); return; }
    setSaving(true);
    try {
      const res = await db.grn.create({
        supplier_id: supplierId ? parseInt(supplierId, 10) : null,
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
      onCreated(); onClose();
    } catch (e: any) { toast.error(e.message || 'Failed to save GRN'); }
    finally { setSaving(false); }
  };

  const inputCls = 'w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col border border-gray-200 dark:border-gray-700">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            New Goods Received Note
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Top fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Supplier</label>
              <select className={inputCls} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">— Walk-in / Unknown —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Received Date *</label>
              <input type="date" className={inputCls} value={receivedDate} onChange={e => setReceivedDate(e.target.value)} />
            </div>

            {/* Payment toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Type *</label>
              <div className="flex gap-2">
                {(['CASH', 'CREDIT'] as const).map(pt => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => setPaymentType(pt)}
                    className={`flex-1 py-2 rounded-lg border-2 font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      paymentType === pt
                        ? pt === 'CASH'
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                        : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                  >
                    {pt === 'CASH' ? <Banknote className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                    {pt}
                  </button>
                ))}
              </div>
            </div>

            {paymentType === 'CREDIT' ? (
              <div>
                <label className="block text-sm font-medium text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                  <CalendarClock className="w-3.5 h-3.5" /> Repayment Due Date *
                </label>
                <input
                  type="date" min={todayStr()}
                  className={`${inputCls} ${!dueDate ? 'border-amber-400 dark:border-amber-500' : ''}`}
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                />
              </div>
            ) : <div />}

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
              <input type="text" className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Invoice #123, distributor visit, etc." />
            </div>
          </div>

          {/* Items section */}
          <div>
            <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2 border-t border-gray-200 dark:border-gray-700 pt-4">
              <Package className="w-4 h-4 text-blue-500" /> Items Received
            </h4>

            {/* Search */}
            <div className="relative mb-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    ref={searchRef}
                    type="text"
                    className={inputCls}
                    placeholder="Search by barcode or title…"
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
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded font-semibold text-sm flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Manual
                </button>
              </div>

              {/* Dropdown */}
              {showDropdown && (
                <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                  {searching && <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">Searching…</div>}
                  {!searching && searchResults.length === 0 && (
                    <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">No match — press Enter or click Manual to add.</div>
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
                        <div>Cost: {fmtRs(inv.cost_price)}</div>
                        <div>Stock: {inv.quantity}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Draft items */}
            {draftItems.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-gray-400 dark:text-gray-500 text-sm">
                Search and add items above
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Barcode</th>
                      <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Item</th>
                      <th className="px-3 py-2 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase w-16">Qty</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase w-24">Unit Cost</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-blue-600 dark:text-blue-400 uppercase w-28">New Sell Price</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase w-24">Margin</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase w-28">Total Cost</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {draftItems.map(item => {
                      const margin = (item.selling_price || 0) - (item.unit_cost || 0);
                      const marginPct = item.selling_price > 0 ? Math.round((margin / item.selling_price) * 100) : 0;
                      return (
                        <tr key={item._key}>
                          <td className="px-3 py-2">
                            <input className="w-24 p-1.5 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none" value={item.barcode} onChange={e => updateItem(item._key, 'barcode', e.target.value)} />
                          </td>
                          <td className="px-3 py-2">
                            <input className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none" value={item.title} onChange={e => updateItem(item._key, 'title', e.target.value)} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min={1} className="w-16 p-1.5 text-sm text-center border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none" value={item.received_qty} onChange={e => updateItem(item._key, 'received_qty', Math.max(1, parseInt(e.target.value) || 1))} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min={0} step={0.01} className="w-20 p-1.5 text-sm text-right border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none" value={item.unit_cost} onChange={e => updateItem(item._key, 'unit_cost', parseFloat(e.target.value) || 0)} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min={0} step={0.01} className="w-24 p-1.5 text-sm text-right font-semibold border-2 border-blue-400 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 text-gray-900 dark:text-gray-100 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none" value={item.selling_price} onChange={e => updateItem(item._key, 'selling_price', parseFloat(e.target.value) || 0)} title="New selling price (will update item in inventory & POS)" />
                          </td>
                          <td className="px-3 py-2 text-right">
                            {margin >= 0 ? (
                              <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                                +{fmtRs(margin)}
                                <span className="block text-[10px] text-gray-400">({marginPct}%)</span>
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                                {fmtRs(margin)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-gray-800 dark:text-gray-100">{fmtRs(item.received_qty * item.unit_cost)}</td>
                          <td className="px-2 py-2">
                            <button onClick={() => removeItem(item._key)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors cursor-pointer">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 dark:bg-gray-900/50 font-bold">
                      <td colSpan={6} className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300 text-sm">Grand Total (Cost)</td>
                      <td className="px-3 py-2.5 text-right text-blue-600 dark:text-blue-400 text-base">{fmtRs(grandTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {draftItems.length} item(s) · <strong className="text-gray-800 dark:text-gray-100">{fmtRs(grandTotal)}</strong>
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-bold transition-colors cursor-pointer text-sm">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || draftItems.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-colors cursor-pointer text-sm"
            >
              <Truck className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save GRN & Update Stock'}
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
  const [showNewModal, setShowNewModal] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [grnRes, supRes] = await Promise.all([db.grn.getAll(), db.suppliers.getAll()]);
      setGrns(grnRes.data ?? []);
      setSuppliers(supRes.data ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDelete = async (grn: GRNHeader) => {
    if (!window.confirm(`Delete GRN ${grn.grn_number}?\n\nThis will REVERSE the stock quantities that were added.`)) return;
    setDeleting(grn.id!);
    try {
      await db.grn.delete(grn.id!);
      toast.success(`${grn.grn_number} deleted. Stock reversed.`);
      fetchAll();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setDeleting(null); }
  };

  const filtered = grns.filter(g => {
    if (filter === 'CREDIT_PENDING') return g.payment_type === 'CREDIT' && g.status === 'PENDING';
    if (filter === 'CASH') return g.payment_type === 'CASH';
    if (filter === 'CREDIT_PAID') return g.payment_type === 'CREDIT' && g.status === 'PAID';
    return true;
  });

  const pendingCount = grns.filter(g => g.payment_type === 'CREDIT' && g.status === 'PENDING').length;
  const overdueCount = grns.filter(isOverdue).length;
  const totalCredit = grns.filter(g => g.payment_type === 'CREDIT' && g.status === 'PENDING').reduce((s, g) => s + g.total_amount, 0);

  return (
    <div className="p-8 h-full flex flex-col">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center">
          <ClipboardList className="mr-3 text-blue-600 dark:text-blue-400" />
          Goods Received Notes
        </h2>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors cursor-pointer text-sm shadow-sm"
        >
          <Plus className="w-4 h-4" /> New GRN
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-2.5">
            <Truck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{grns.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total GRNs</p>
          </div>
        </div>
        <div className={`border rounded-xl p-4 flex items-center gap-3 shadow-sm ${
          overdueCount > 0
            ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className={`rounded-lg p-2.5 ${pendingCount > 0 ? 'bg-amber-50 dark:bg-amber-900/30' : 'bg-green-50 dark:bg-green-900/30'}`}>
            <Clock className={`w-5 h-5 ${pendingCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`} />
          </div>
          <div>
            <p className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}`}>
              {pendingCount}
              {overdueCount > 0 && <span className="text-sm ml-1 font-semibold">({overdueCount} overdue!)</span>}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Pending Credit Bills</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="bg-amber-50 dark:bg-amber-900/30 rounded-lg p-2.5">
            <CreditCard className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{fmtRs(totalCredit)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Outstanding Credit</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {([
          { key: 'ALL', label: 'All GRNs' },
          { key: 'CREDIT_PENDING', label: `Pending Credit${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
          { key: 'CASH', label: 'Cash' },
          { key: 'CREDIT_PAID', label: 'Credit (Paid)' },
        ] as { key: FilterType; label: string }[]).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all cursor-pointer ${
              filter === f.key
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400 dark:hover:border-blue-500'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Main Table */}
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">GRN #</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Supplier</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Received</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Payment</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Due Date</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading && [0,1,2,3].map(r => (
                <tr key={r}>
                  {[0,1,2,3,4,5,6,7].map(c => <td key={c} className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>)}
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={<ClipboardList className="w-12 h-12" />}
                      title="No GRNs found"
                      subtitle="Click 'New GRN' to record a distributor delivery and update stock."
                    />
                  </td>
                </tr>
              )}
              {!loading && filtered.map(grn => {
                const overdue = isOverdue(grn);
                return (
                  <tr key={grn.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${overdue ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                    <td className="px-6 py-4 font-bold font-mono text-sm text-gray-800 dark:text-gray-100">{grn.grn_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                      {grn.supplier_name || <span className="italic text-gray-400 dark:text-gray-500">Walk-in</span>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{fmtDate(grn.received_date)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                        grn.payment_type === 'CASH'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                      }`}>
                        {grn.payment_type === 'CASH' ? <Banknote className="w-3 h-3" /> : <CreditCard className="w-3 h-3" />}
                        {grn.payment_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {grn.payment_type === 'CREDIT' ? (
                        <span className={`flex items-center gap-1 ${overdue ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-600 dark:text-gray-400'}`}>
                          {overdue && <AlertTriangle className="w-3.5 h-3.5" />}
                          {fmtDate(grn.due_date)}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      {grn.payment_type === 'CASH' || grn.status === 'PAID' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${overdue ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          <Clock className="w-3.5 h-3.5" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-800 dark:text-gray-100">{fmtRs(grn.total_amount)}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => setViewId(grn.id!)}
                          title="View details"
                          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(grn)}
                          disabled={deleting === grn.id}
                          title="Delete (reverses stock)"
                          className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
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
      {showNewModal && <NewGRNModal suppliers={suppliers} onClose={() => setShowNewModal(false)} onCreated={fetchAll} />}
      {viewId !== null && <GRNDetailModal grnId={viewId} onClose={() => setViewId(null)} onMarkPaid={fetchAll} />}
    </div>
  );
}
