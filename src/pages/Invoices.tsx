import { useState, useEffect, useCallback } from 'react';
import { db, type Sale } from '../db';
import { FileText, Search, Printer, X, Eye, Edit, Trash2, Plus, Minus, CreditCard, Banknote, Users, Save, RotateCcw, Check } from 'lucide-react';
import { useToast } from '../components/Toast';
import { useSecurity } from '../context/SecurityContext';
import { printReceipt, printReturnReceipt, type ReturnReceiptData } from '../utils/receipt';
import { SkeletonRows, EmptyState } from '../components/Skeleton';

export default function Invoices() {
  const toast = useToast();
  const { isUnlocked, config, requestAuth } = useSecurity();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [editingSale, setEditingSale] = useState<any>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Item Return state
  const [returnSale, setReturnSale] = useState<Sale | null>(null);
  const [returnItems, setReturnItems] = useState<Array<{
    sale_item_id: number;
    product_id?: number;
    barcode: string;
    title: string;
    sold_qty: number;
    already_returned_qty: number;
    max_return_qty: number;
    return_qty: number;
    unit_price: number;
    refund_amount: number;
  }>>([]);
  const [returnRefundMethod, setReturnRefundMethod] = useState<'CASH' | 'EXCHANGE' | 'CREDIT'>('CASH');
  const [returnReason, setReturnReason] = useState('Customer Return');
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);
  const [lastProcessedReturn, setLastProcessedReturn] = useState<ReturnReceiptData | null>(null);

  const handleOpenReturn = async (sale: Sale) => {
    if (config.requireForReturns && !isUnlocked) {
      const authorized = await requestAuth(`Manager authorization required to process a return on receipt ${sale.receipt_no}.`);
      if (!authorized) return;
    }
    try {
      const [itemsRes, prevReturnsRes] = await Promise.all([
        db.saleItems.getBySale(sale.id!),
        db.returns.getByReceipt(sale.receipt_no),
      ]);

      const prevReturns = prevReturnsRes.data ?? [];
      const returnedCounts: Record<string, number> = {};
      prevReturns.forEach((r: any) => {
        const key = `${r.product_id || 0}_${r.barcode}`;
        returnedCounts[key] = (returnedCounts[key] || 0) + (r.quantity || 0);
      });

      const loadedItems = (itemsRes.data ?? []).map((item: any) => {
        const key = `${item.product_id || 0}_${item.barcode || ''}`;
        const prevReturned = returnedCounts[key] || 0;
        const maxReturn = Math.max(0, item.quantity - prevReturned);
        return {
          sale_item_id: item.id,
          product_id: item.product_id,
          barcode: item.barcode || '',
          title: item.title || 'Item',
          sold_qty: item.quantity,
          already_returned_qty: prevReturned,
          max_return_qty: maxReturn,
          return_qty: 0,
          unit_price: item.unit_price,
          refund_amount: 0,
        };
      });

      setReturnSale(sale);
      setReturnItems(loadedItems);
      setReturnReason('Customer Return');
      setReturnRefundMethod(sale.payment_type === 'CREDIT' ? 'CREDIT' : 'CASH');
      setLastProcessedReturn(null);
    } catch (err: any) {
      toast.error('Failed to prepare return for this invoice.');
    }
  };

  const handleReturnQtyChange = (idx: number, qtyStr: string) => {
    setReturnItems(prev => {
      const next = [...prev];
      const target = { ...next[idx] };
      const parsed = parseInt(qtyStr, 10);
      const val = isNaN(parsed) ? 0 : Math.max(0, Math.min(target.max_return_qty, parsed));
      target.return_qty = val;
      target.refund_amount = Math.round((val * target.unit_price) * 100) / 100;
      next[idx] = target;
      return next;
    });
  };

  const handleExecuteReturn = async () => {
    if (!returnSale) return;
    const itemsToReturn = returnItems.filter(i => i.return_qty > 0);
    if (itemsToReturn.length === 0) {
      toast.error('Please specify return quantity for at least one item.');
      return;
    }

    setIsProcessingReturn(true);
    try {
      const res = await db.returns.create({
        sale_id: returnSale.id,
        receipt_no: returnSale.receipt_no,
        refund_method: returnRefundMethod,
        reason: returnReason.trim() || 'Customer Return',
        items: itemsToReturn.map(i => ({
          product_id: i.product_id,
          barcode: i.barcode,
          title: i.title,
          quantity: i.return_qty,
          unit_price: i.unit_price,
          refund_amount: i.refund_amount,
        })),
      });

      if (!res.success) throw new Error(res.error || 'Failed to process return');

      const totalRefund = itemsToReturn.reduce((sum, i) => sum + i.refund_amount, 0);
      const voucherData: ReturnReceiptData = {
        return_no: res.returnNo || `RET-${Date.now().toString().slice(-6)}`,
        receipt_no: returnSale.receipt_no,
        created_at: new Date().toISOString(),
        refund_method: returnRefundMethod,
        reason: returnReason.trim() || 'Customer Return',
        total_refund: totalRefund,
        items: itemsToReturn.map(i => ({
          title: i.title,
          quantity: i.return_qty,
          unit_price: i.unit_price,
          refund_amount: i.refund_amount,
        })),
      };

      setLastProcessedReturn(voucherData);
      toast.success(`Return voucher ${voucherData.return_no} processed! Stock restored.`, 'Return Completed');

      const [itemsRes, prevReturnsRes] = await Promise.all([
        db.saleItems.getBySale(returnSale.id!),
        db.returns.getByReceipt(returnSale.receipt_no),
      ]);
      const prevReturns = prevReturnsRes.data ?? [];
      const returnedCounts: Record<string, number> = {};
      prevReturns.forEach((r: any) => {
        const key = `${r.product_id || 0}_${r.barcode}`;
        returnedCounts[key] = (returnedCounts[key] || 0) + (r.quantity || 0);
      });
      const refreshedItems = (itemsRes.data ?? []).map((item: any) => {
        const key = `${item.product_id || 0}_${item.barcode || ''}`;
        const prevReturned = returnedCounts[key] || 0;
        const maxReturn = Math.max(0, item.quantity - prevReturned);
        return {
          sale_item_id: item.id,
          product_id: item.product_id,
          barcode: item.barcode || '',
          title: item.title || 'Item',
          sold_qty: item.quantity,
          already_returned_qty: prevReturned,
          max_return_qty: maxReturn,
          return_qty: 0,
          unit_price: item.unit_price,
          refund_amount: 0,
        };
      });
      setReturnItems(refreshedItems);
    } catch (err: any) {
      toast.error(err.message || 'Failed to process return');
    } finally {
      setIsProcessingReturn(false);
    }
  };

  const fetchSales = useCallback(() => {
    let active = true;
    setLoading(true);
    db.sales.search(searchTerm, 50, page * 50).then(res => {
      if (!active) return;
      setSales(res.data ?? []);
      setHasMore(res.hasMore ?? false);
    }).catch(() => {
      if (active) { setSales([]); setHasMore(false); toast.error('Failed to load invoices.'); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [searchTerm, page, toast]);

  useEffect(() => {
    return fetchSales();
  }, [fetchSales]);

  const handleViewInvoice = async (sale: Sale) => {
    try {
      const res = await db.saleItems.getBySale(sale.id!);
      setSelectedSale({ ...sale, items: res.data ?? [] });
    } catch (err) {
      console.error(err);
      toast.error('Failed to load invoice details.');
    }
  };

  const handleDeleteInvoice = async (sale: Sale) => {
    if (config.requireForReturns && !isUnlocked) {
      const authorized = await requestAuth(`Manager authorization required to delete invoice ${sale.receipt_no}.`);
      if (!authorized) return;
    }
    if (!window.confirm(`Are you sure you want to delete invoice "${sale.receipt_no}"?\n\nThis will return all items back to stock.`)) {
      return;
    }
    try {
      const res = await db.sales.delete(sale.id!);
      if (!res.success) {
        throw new Error(res.error || 'Failed to delete invoice');
      }
      toast.success(`Invoice ${sale.receipt_no} deleted and stock returned.`, 'Invoice deleted');
      if (selectedSale?.id === sale.id) setSelectedSale(null);
      if (editingSale?.id === sale.id) setEditingSale(null);
      fetchSales();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to delete invoice.');
    }
  };

  const handleStartEdit = async (sale: Sale) => {
    if (config.requireForReturns && !isUnlocked) {
      const authorized = await requestAuth(`Manager authorization required to edit completed invoice ${sale.receipt_no}.`);
      if (!authorized) return;
    }
    try {
      const res = await db.saleItems.getBySale(sale.id!);
      const items = (res.data ?? []).map((item: any) => {
        const origPrice = item.original_price ?? item.unit_price;
        const hasDisc = origPrice > item.unit_price;
        const discAmt = hasDisc ? Math.round(((origPrice - item.unit_price) * item.quantity) * 100) / 100 : 0;
        return {
          ...item,
          original_price: origPrice,
          discountMode: 'Rs' as '%' | 'Rs',
          discountVal: discAmt > 0 ? String(discAmt) : (item.discount_percent > 0 ? String(item.discount_percent) : ''),
        };
      });
      setEditingSale({
        ...sale,
        payment_type: sale.payment_type || 'CASH',
        billDiscountInput: String(sale.bill_discount ?? 0),
        items,
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to load invoice for editing.');
    }
  };

  const handleEditItemQty = (index: number, delta: number) => {
    setEditingSale((prev: any) => {
      if (!prev) return prev;
      const nextItems = [...prev.items];
      const target = { ...nextItems[index] };
      const newQty = Math.max(1, (target.quantity || 1) + delta);
      target.quantity = newQty;

      // Recalculate price if in Rs mode
      const origPrice = target.original_price ?? target.unit_price;
      const val = parseFloat(target.discountVal);
      if (!isNaN(val) && val > 0 && target.discountMode === 'Rs') {
        const lineOrigTotal = origPrice * newQty;
        const totalDiscount = Math.min(lineOrigTotal, val);
        target.discount_percent = Math.round(((totalDiscount / lineOrigTotal) * 100) * 100) / 100;
        target.unit_price = Math.round(((lineOrigTotal - totalDiscount) / newQty) * 100) / 100;
      }
      nextItems[index] = target;
      return { ...prev, items: nextItems };
    });
  };

  const handleEditItemDiscount = (index: number, rawVal: string) => {
    setEditingSale((prev: any) => {
      if (!prev) return prev;
      const nextItems = [...prev.items];
      const target = { ...nextItems[index] };
      target.discountVal = rawVal;
      const origPrice = target.original_price ?? target.unit_price;
      const val = parseFloat(rawVal);
      const qty = Math.max(1, target.quantity || 1);

      if (!isNaN(val) && val > 0) {
        if (target.discountMode === '%') {
          target.discount_percent = Math.min(100, Math.max(0, val));
          target.unit_price = Math.round(origPrice * (1 - target.discount_percent / 100) * 100) / 100;
        } else {
          const lineOrigTotal = origPrice * qty;
          const totalDiscount = Math.min(lineOrigTotal, val);
          target.discount_percent = Math.round(((totalDiscount / lineOrigTotal) * 100) * 100) / 100;
          target.unit_price = Math.round(((lineOrigTotal - totalDiscount) / qty) * 100) / 100;
        }
      } else {
        target.discount_percent = 0;
        target.unit_price = origPrice;
      }
      nextItems[index] = target;
      return { ...prev, items: nextItems };
    });
  };

  const handleToggleItemDiscountMode = (index: number, mode: '%' | 'Rs') => {
    setEditingSale((prev: any) => {
      if (!prev) return prev;
      const nextItems = [...prev.items];
      const target = { ...nextItems[index] };
      const origPrice = target.original_price ?? target.unit_price;
      const qty = Math.max(1, target.quantity || 1);
      target.discountMode = mode;

      if (target.discount_percent > 0) {
        if (mode === 'Rs') {
          const totalAmt = Math.round((((origPrice * qty) * target.discount_percent) / 100) * 100) / 100;
          target.discountVal = String(totalAmt);
        } else {
          target.discountVal = String(target.discount_percent);
        }
      }
      nextItems[index] = target;
      return { ...prev, items: nextItems };
    });
  };

  const handleRemoveEditItem = (index: number) => {
    setEditingSale((prev: any) => {
      if (!prev || prev.items.length <= 1) {
        toast.warning('An invoice must have at least one item.');
        return prev;
      }
      return {
        ...prev,
        items: prev.items.filter((_: any, i: number) => i !== index),
      };
    });
  };

  const handleSaveEdit = async () => {
    if (!editingSale || isSavingEdit) return;
    setIsSavingEdit(true);

    try {
      const billDiscountVal = Math.max(0, parseFloat(editingSale.billDiscountInput) || 0);
      const res = await db.sales.update({
        id: editingSale.id,
        payment_type: editingSale.payment_type,
        customer_id: editingSale.customer_id ?? null,
        bill_discount: billDiscountVal,
        items: editingSale.items.map((i: any) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount_percent: i.discount_percent ?? 0,
          original_price: i.original_price ?? i.unit_price,
          title: i.title,
          barcode: i.barcode,
        })),
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to update invoice');
      }

      toast.success(`Invoice ${editingSale.receipt_no} updated successfully!`, 'Invoice updated');
      setEditingSale(null);
      fetchSales();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to save invoice changes.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handlePrint = () => {
    if (!selectedSale) return;
    const isCredit = selectedSale.payment_type === 'CREDIT';
    const totalDue = selectedSale.customer_total_outstanding ?? selectedSale.credit_due_amount;
    const prevDue = isCredit && totalDue != null ? Math.max(0, totalDue - (selectedSale.total_amount || 0)) : undefined;
    printReceipt({
      ...selectedSale,
      customer_name: selectedSale.customer_name,
      customer_phone: selectedSale.customer_phone,
      previous_due: prevDue,
      credit_due_amount: totalDue,
      bill_discount: selectedSale.bill_discount ?? 0,
      subtotal: (selectedSale.total_amount ?? 0) + (selectedSale.bill_discount ?? 0),
    });
  };

  // Live totals calculation for Edit Modal
  const editSubtotal = editingSale ? editingSale.items.reduce((sum: number, i: any) => sum + (i.unit_price * i.quantity), 0) : 0;
  const editBillDiscount = editingSale ? Math.min(editSubtotal, Math.max(0, parseFloat(editingSale.billDiscountInput) || 0)) : 0;
  const editNetTotal = Math.max(0, Math.round((editSubtotal - editBillDiscount) * 100) / 100);

  return (
    <div className="p-6 lg:p-8 h-full flex flex-col relative space-y-5">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900/50">
              <FileText className="w-4 h-4" />
            </div>
            <span>Invoices & Sales History</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Audit transactions, reprint receipts, and process returns or corrections
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search receipt or customer..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors shadow-2xs"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
          />
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-slate-200/90 dark:border-slate-800/90 flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-left text-xs">
            <thead className="bg-slate-50/80 dark:bg-slate-950/50 sticky top-0 z-10 backdrop-blur-xs">
              <tr>
                <th className="px-5 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px]">Date & Time</th>
                <th className="px-5 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px]">Receipt No</th>
                <th className="px-5 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px]">Payment Method</th>
                <th className="px-5 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] text-right">Net Amount</th>
                <th className="px-5 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800/70">
              {loading && <SkeletonRows rows={6} cols={5} />}
              {!loading && sales?.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={<FileText className="w-10 h-10" />}
                      title="No invoices found"
                      subtitle="Completed sales will appear here with their receipt numbers."
                    />
                  </td>
                </tr>
              )}
              {!loading && sales?.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300 font-mono tabular-nums whitespace-nowrap">
                    {new Date(sale.created_at).toLocaleString('en-LK', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-5 py-3.5 font-mono font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {sale.receipt_no}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide border ${
                      sale.payment_type === 'CASH'
                        ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        : sale.payment_type === 'CREDIT'
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200/80 dark:border-amber-900/50'
                        : 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200/80 dark:border-blue-900/50'
                    }`}>
                      {sale.payment_type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                    Rs. {Number(sale.total_amount).toFixed(2)}
                  </td>
                  <td className="px-5 py-3.5 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleViewInvoice(sale)}
                        className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                        title="View Receipt"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1 text-slate-400 group-hover:text-blue-600" /> View
                      </button>
                      <button
                        onClick={() => handleOpenReturn(sale)}
                        className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                        title="Return or Exchange Items"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1 text-slate-400" /> Return
                      </button>
                      <button
                        onClick={() => handleStartEdit(sale)}
                        className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                        title="Edit Invoice"
                      >
                        <Edit className="w-3.5 h-3.5 mr-1 text-slate-400" /> Edit
                      </button>
                      <button
                        onClick={() => handleDeleteInvoice(sale)}
                        className="inline-flex items-center p-1 text-xs font-medium rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        title="Delete Invoice and return stock"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">
            Page {page + 1}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={loading || page === 0}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Previous
            </button>
            <button
              disabled={loading || !hasMore}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Invoice Modal (Screen View) */}
      {selectedSale && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/70 dark:bg-slate-950/50">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Invoice Details</h3>
              </div>
              <button
                onClick={() => setSelectedSale(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 font-mono text-xs text-slate-800 dark:text-slate-200 space-y-4">
              <div className="text-center pb-3 border-b border-dashed border-slate-300 dark:border-slate-700">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">HIRU BOOKSHOP & COMMUNICATION</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Maniyangama, Avissawella • Tel: 070200042</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{new Date(selectedSale.created_at).toLocaleString('en-LK')}</p>
              </div>

              <div className="space-y-1 text-slate-600 dark:text-slate-300 border-b border-dashed border-slate-300 dark:border-slate-700 pb-3">
                <div className="flex justify-between">
                  <span className="text-slate-400">Receipt No:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{selectedSale.receipt_no}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Payment:</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedSale.payment_type}</span>
                </div>
                {selectedSale.customer_name && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Customer:</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedSale.customer_name} {selectedSale.customer_phone ? `(${selectedSale.customer_phone})` : ''}</span>
                  </div>
                )}
              </div>

              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 text-[10px] uppercase">
                    <th className="text-left pb-1.5">Item</th>
                    <th className="text-right pb-1.5">Qty</th>
                    <th className="text-right pb-1.5">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {selectedSale.items.map((item: any, idx: number) => (
                    <tr key={idx} className="align-top">
                      <td className="py-2 pr-2">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.title}</div>
                        {item.discount_percent > 0 && (
                          <div className="text-[10px] text-blue-600 dark:text-blue-400">Disc: {item.discount_percent}%</div>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{item.quantity}</td>
                      <td className="py-2 text-right tabular-nums">
                        {item.discount_percent > 0 && item.original_price && (
                          <div className="text-[10px] text-slate-400 line-through">Rs. {(item.quantity * item.original_price).toFixed(2)}</div>
                        )}
                        <div className="font-medium text-slate-900 dark:text-slate-100">Rs. {(item.quantity * item.unit_price).toFixed(2)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="space-y-1 pt-3 border-t border-dashed border-slate-300 dark:border-slate-700">
                {selectedSale.bill_discount > 0 && (
                  <>
                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>Subtotal:</span>
                      <span className="tabular-nums">Rs. {(selectedSale.total_amount + selectedSale.bill_discount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-rose-600 dark:text-rose-400">
                      <span>Bill Discount:</span>
                      <span className="tabular-nums">- Rs. {selectedSale.bill_discount.toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-slate-100 pt-1">
                  <span>Net Total:</span>
                  <span className="tabular-nums">Rs. {Number(selectedSale.total_amount).toFixed(2)}</span>
                </div>
                {(selectedSale.customer_total_outstanding != null || selectedSale.credit_due_amount != null) && (
                  <div className="pt-2 mt-2 border-t border-dashed border-slate-300 dark:border-slate-700 text-xs space-y-1">
                    {selectedSale.payment_type === 'CREDIT' && (
                      <>
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>Previous Due:</span>
                          <span className="tabular-nums">Rs. {Math.max(0, (selectedSale.customer_total_outstanding ?? selectedSale.credit_due_amount) - (selectedSale.total_amount || 0)).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>This Bill:</span>
                          <span className="tabular-nums">Rs. {Number(selectedSale.total_amount).toFixed(2)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between text-slate-900 dark:text-slate-100 font-bold pt-1 border-t border-slate-200 dark:border-slate-700">
                      <span>{selectedSale.payment_type === 'CREDIT' ? 'Total Credit Due:' : 'Remaining Credit Due:'}</span>
                      <span className="text-rose-600 dark:text-rose-400 tabular-nums">Rs. {Number(selectedSale.customer_total_outstanding ?? selectedSale.credit_due_amount).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex gap-3">
              <button
                onClick={() => setSelectedSale(null)}
                className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={handlePrint}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Invoice Modal */}
      {editingSale && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/70 dark:bg-slate-950/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200/60 dark:border-amber-900/40">
                  <Edit className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Edit Invoice #{editingSale.receipt_no}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {new Date(editingSale.created_at).toLocaleString('en-LK')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingSale(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Payment Type Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Payment Method
                  </label>
                  {editingSale.customer_name && (
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      Customer: <strong className="text-slate-900 dark:text-slate-100">{editingSale.customer_name}</strong>
                    </span>
                  )}
                </div>
                <div className={`grid ${(editingSale.customer_id || editingSale.payment_type === 'CREDIT') ? 'grid-cols-3 max-w-sm' : 'grid-cols-2 max-w-xs'} gap-2.5`}>
                  <button
                    type="button"
                    onClick={() => setEditingSale({ ...editingSale, payment_type: 'CASH' })}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-semibold text-xs border transition-all cursor-pointer ${
                      editingSale.payment_type === 'CASH'
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Banknote className="w-3.5 h-3.5" /> Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingSale({ ...editingSale, payment_type: 'CARD' })}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-semibold text-xs border transition-all cursor-pointer ${
                      editingSale.payment_type === 'CARD'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" /> Card
                  </button>
                  {(editingSale.customer_id || editingSale.payment_type === 'CREDIT') && (
                    <button
                      type="button"
                      onClick={() => setEditingSale({ ...editingSale, payment_type: 'CREDIT' })}
                      className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-semibold text-xs border transition-all cursor-pointer ${
                        editingSale.payment_type === 'CREDIT'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-2xs dark:bg-rose-600 dark:border-rose-600'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" /> Credit
                    </button>
                  )}
                </div>
              </div>

              {/* Items List */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Invoice Items ({editingSale.items.length})
                </label>
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {editingSale.items.map((item: any, idx: number) => {
                    const origPrice = item.original_price ?? item.unit_price;
                    const lineOrigTotal = origPrice * item.quantity;
                    const lineTotal = item.unit_price * item.quantity;
                    const itemSavings = Math.max(0, lineOrigTotal - lineTotal);

                    return (
                      <div key={idx} className="p-3 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-xs truncate">{item.title}</h4>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">{item.barcode}</p>
                          <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-mono tabular-nums">
                            Unit Price: <span className="font-semibold text-blue-600 dark:text-blue-400">Rs. {item.unit_price.toFixed(2)}</span>
                            {itemSavings > 0 && (
                              <span className="ml-1.5 line-through text-slate-400 text-[11px]">Rs. {origPrice.toFixed(2)}</span>
                            )}
                          </div>
                        </div>

                        {/* Qty & Item Discount Controls */}
                        <div className="flex items-center gap-3 self-end sm:self-center">
                          {/* Item Discount */}
                          <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-800 overflow-hidden text-xs">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="0"
                              value={item.discountVal}
                              onChange={(e) => handleEditItemDiscount(idx, e.target.value)}
                              className="w-12 px-2 py-1 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 bg-transparent focus:outline-none text-right"
                              title="Item discount"
                            />
                            <div className="flex bg-slate-200/80 dark:bg-slate-700 p-0.5 text-[10px] font-semibold">
                              <button
                                type="button"
                                onClick={() => handleToggleItemDiscountMode(idx, 'Rs')}
                                className={`px-1.5 py-0.5 rounded cursor-pointer ${item.discountMode === 'Rs' ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs font-bold' : 'text-slate-500'}`}
                              >
                                Rs
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleItemDiscountMode(idx, '%')}
                                className={`px-1.5 py-0.5 rounded cursor-pointer ${item.discountMode === '%' ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs font-bold' : 'text-slate-500'}`}
                              >
                                %
                              </button>
                            </div>
                          </div>

                          {/* Qty Counter */}
                          <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-800 p-0.5 text-xs">
                            <button
                              type="button"
                              onClick={() => handleEditItemQty(idx, -1)}
                              disabled={item.quantity <= 1}
                              className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 disabled:opacity-30 cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-7 text-center font-mono font-bold text-slate-900 dark:text-slate-100 text-xs">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => handleEditItemQty(idx, 1)}
                              className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Line Total */}
                          <div className="w-20 text-right">
                            <p className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100 tabular-nums">Rs. {lineTotal.toFixed(2)}</p>
                          </div>

                          {/* Delete Item */}
                          <button
                            type="button"
                            onClick={() => handleRemoveEditItem(idx)}
                            disabled={editingSale.items.length <= 1}
                            className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded transition-colors disabled:opacity-20 cursor-pointer"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bill Discount Input */}
              <div className="bg-slate-50/70 dark:bg-slate-950/40 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                    Bill Discount (Rs.)
                  </span>
                  <span className="text-[11px] text-slate-400">General discount applied to invoice net total</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    value={editingSale.billDiscountInput}
                    onChange={(e) => setEditingSale({ ...editingSale, billDiscountInput: e.target.value })}
                    className="w-32 px-3 py-1.5 text-xs font-mono font-semibold border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 text-right"
                  />
                </div>
              </div>

              {/* Summary Totals */}
              <div className="bg-slate-50/70 dark:bg-slate-950/40 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Subtotal</span>
                  <span className="font-semibold tabular-nums">Rs. {editSubtotal.toFixed(2)}</span>
                </div>
                {editBillDiscount > 0 && (
                  <div className="flex justify-between text-rose-600 dark:text-rose-400">
                    <span>Bill Discount</span>
                    <span className="tabular-nums">- Rs. {editBillDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-slate-100 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span>Net Total</span>
                  <span className="text-blue-600 dark:text-blue-400 tabular-nums">Rs. {editNetTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[11px] pt-1">
                  <span className="text-slate-500 dark:text-slate-400">Payment:</span>
                  <span className={`font-semibold uppercase ${
                    editingSale.payment_type === 'CREDIT'
                      ? 'text-rose-600 dark:text-rose-400'
                      : editingSale.payment_type === 'CARD'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}>
                    {editingSale.payment_type}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex gap-3">
              <button
                type="button"
                onClick={() => setEditingSale(null)}
                className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit || editingSale.items.length === 0}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                {isSavingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Return & Restock Modal */}
      {returnSale && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setReturnSale(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-slate-900 dark:bg-slate-950 p-4 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/10 text-rose-400 flex items-center justify-center border border-white/10">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Invoice Item Return & Refund</h3>
                  <p className="text-[11px] text-slate-400 font-mono">Receipt: {returnSale.receipt_no} • Restock items to inventory</p>
                </div>
              </div>
              <button
                onClick={() => setReturnSale(null)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Sale Summary Banner */}
              <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100 block">
                    Receipt: {returnSale.receipt_no}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                    Date: {new Date(returnSale.created_at).toLocaleString('en-LK')} • Payment: <strong>{returnSale.payment_type}</strong>
                  </span>
                </div>
                <div className="text-right font-mono">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Original Sale Total</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    Rs. {Number(returnSale.total_amount).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Return Items Selection Table */}
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Select Items to Return & Quantity
                </h4>
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800 text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Item</th>
                        <th className="py-2.5 px-2 text-center">Sold Qty</th>
                        <th className="py-2.5 px-2 text-center">Prev. Returned</th>
                        <th className="py-2.5 px-3 text-center">Return Qty</th>
                        <th className="py-2.5 px-3 text-right">Refund Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {returnItems.map((item, idx) => {
                        const isFullyReturned = item.max_return_qty <= 0;
                        return (
                          <tr key={idx} className={isFullyReturned ? 'bg-slate-50/50 dark:bg-slate-900/60 opacity-60' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40'}>
                            <td className="py-2.5 px-3">
                              <span className="font-medium text-slate-900 dark:text-slate-100 block">
                                {item.title}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {item.barcode || 'N/A'} • Rs. {Number(item.unit_price).toFixed(2)}/ea
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono text-slate-700 dark:text-slate-300">
                              {item.sold_qty}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono font-medium text-amber-600 dark:text-amber-400">
                              {item.already_returned_qty}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {isFullyReturned ? (
                                <span className="text-[10px] font-medium text-slate-400">Returned</span>
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  max={item.max_return_qty}
                                  value={item.return_qty}
                                  onChange={(e) => handleReturnQtyChange(idx, e.target.value)}
                                  className="w-14 px-2 py-1 text-center font-mono font-semibold text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-600"
                                />
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400 text-xs tabular-nums">
                              Rs. {item.refund_amount.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Return Reason & Method */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Return Reason *
                  </label>
                  <input
                    type="text"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="e.g. Defective, Wrong Book, Customer Exchange"
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {['Defective', 'Wrong Item', 'Exchange', 'Changed Mind'].map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setReturnReason(r)}
                        className="px-2 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Refund / Settlement Method *
                  </label>
                  <select
                    value={returnRefundMethod}
                    onChange={(e) => setReturnRefundMethod(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                  >
                    <option value="CASH">Cash Refund (Drawer Outflow)</option>
                    <option value="EXCHANGE">POS Exchange (Restock & Issue Credit)</option>
                    <option value="CREDIT">Customer Debt Reduction (Credit)</option>
                  </select>
                </div>
              </div>

              {/* Refund Summary Banner */}
              <div className="bg-slate-50 dark:bg-slate-950/40 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    Total Items Returning: <strong>{returnItems.reduce((sum, i) => sum + i.return_qty, 0)} units</strong>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Inventory quantities will automatically update.
                  </span>
                </div>
                <div className="text-right font-mono">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Total Refund Due</span>
                  <span className="text-lg font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                    Rs. {returnItems.reduce((sum, i) => sum + i.refund_amount, 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Last Processed Return Voucher Banner */}
              {lastProcessedReturn && (
                <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-lg p-3.5 flex items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-emerald-600 text-white rounded-md">
                      <Check className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-semibold text-emerald-900 dark:text-emerald-200 text-xs block">
                        Return {lastProcessedReturn.return_no} Processed Successfully!
                      </span>
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono">
                        Refund: <strong>Rs. {lastProcessedReturn.total_refund.toFixed(2)}</strong> ({lastProcessedReturn.refund_method})
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => printReturnReceipt(lastProcessedReturn)}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Voucher
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50/70 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setReturnSale(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-lg font-medium text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleExecuteReturn}
                disabled={isProcessingReturn || returnItems.reduce((sum, i) => sum + i.return_qty, 0) === 0}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white rounded-lg font-semibold text-xs shadow-2xs transition-all cursor-pointer flex items-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isProcessingReturn ? 'Processing...' : 'Confirm Return & Restock'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
