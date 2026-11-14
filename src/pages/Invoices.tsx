import { useState, useEffect, useCallback } from 'react';
import { db, type Sale } from '../db';
import { FileText, Search, Printer, X, Eye, Edit, Trash2, Plus, Minus, CreditCard, Banknote, Save } from 'lucide-react';
import { useToast } from '../components/Toast';
import { printReceipt } from '../utils/receipt';
import { SkeletonRows, EmptyState } from '../components/Skeleton';

export default function Invoices() {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [editingSale, setEditingSale] = useState<any>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

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
    } catch(err) {
      console.error(err);
      toast.error('Failed to load invoice details.');
    }
  };

  const handleDeleteInvoice = async (sale: Sale) => {
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
    printReceipt({
      ...selectedSale,
      bill_discount: selectedSale.bill_discount ?? 0,
      subtotal: (selectedSale.total_amount ?? 0) + (selectedSale.bill_discount ?? 0),
    });
  };

  // Live totals calculation for Edit Modal
  const editSubtotal = editingSale ? editingSale.items.reduce((sum: number, i: any) => sum + (i.unit_price * i.quantity), 0) : 0;
  const editBillDiscount = editingSale ? Math.min(editSubtotal, Math.max(0, parseFloat(editingSale.billDiscountInput) || 0)) : 0;
  const editNetTotal = Math.max(0, Math.round((editSubtotal - editBillDiscount) * 100) / 100);

  return (
    <div className="p-8 h-full flex flex-col relative">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center">
          <FileText className="mr-3 text-blue-600 dark:text-blue-400" />
          Invoices & Sales History
        </h2>
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search Receipt No..."
            className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex-1 overflow-hidden">
        <div className="overflow-x-auto h-full">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Date & Time</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Receipt No</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Payment</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Amount</th>
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading && <SkeletonRows rows={6} cols={5} />}
              {!loading && sales?.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={<FileText className="w-12 h-12" />}
                      title="No invoices found"
                      subtitle="Completed sales will appear here with their receipt numbers."
                    />
                  </td>
                </tr>
              )}
              {!loading && sales?.map((sale) => (
                <tr key={sale.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {new Date(sale.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {sale.receipt_no}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      sale.payment_type === 'CASH'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                    }`}>
                      {sale.payment_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    Rs. {sale.total_amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleViewInvoice(sale)}
                        className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 transition-colors cursor-pointer"
                        title="View Receipt"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" /> View
                      </button>
                      <button
                        onClick={() => handleStartEdit(sale)}
                        className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
                        title="Edit Invoice"
                      >
                        <Edit className="w-3.5 h-3.5 mr-1" /> Edit
                      </button>
                      <button
                        onClick={() => handleDeleteInvoice(sale)}
                        className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/40 transition-colors cursor-pointer"
                        title="Delete Invoice and return stock"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 py-3 text-sm">
        <button disabled={loading || page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer">Previous</button>
        <span className="text-gray-600 dark:text-gray-400 font-medium">Page {page + 1}</span>
        <button disabled={loading || !hasMore} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer">Next</button>
      </div>

      {/* Invoice Modal (Screen View) */}
      {selectedSale && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 rounded-t-xl">
              <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">Invoice Details</h3>
              <button onClick={() => setSelectedSale(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 font-mono text-sm text-gray-800 dark:text-gray-100">
              <h2 className="text-2xl font-bold text-center mb-2">Bookshop Receipt</h2>
              <p className="text-center text-gray-500 dark:text-gray-400 mb-6">{new Date(selectedSale.created_at).toLocaleString()}</p>

              <div className="border-b border-dashed border-gray-400 dark:border-gray-600 mb-4 pb-4">
                <p><strong>Receipt No:</strong> {selectedSale.receipt_no}</p>
                <p><strong>Payment:</strong> {selectedSale.payment_type}</p>
              </div>

              <table className="w-full mb-4">
                <thead>
                  <tr className="border-b border-gray-300 dark:border-gray-600">
                    <th className="text-left pb-2">Item</th>
                    <th className="text-right pb-2">Qty</th>
                    <th className="text-right pb-2">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSale.items.map((item: any, idx: number) => (
                    <tr key={idx} className="border-b border-gray-100 dark:border-gray-700 align-top">
                      <td className="py-2 pr-2">
                        <div>{item.title}</div>
                        {item.discount_percent > 0 && (
                          <div className="text-xs text-gray-500 mt-1">Discount: {item.discount_percent}%</div>
                        )}
                      </td>
                      <td className="py-2 text-right">{item.quantity}</td>
                      <td className="py-2 text-right">
                        {item.discount_percent > 0 && item.original_price && (
                          <div className="text-xs text-gray-400 line-through">Rs. {(item.quantity * item.original_price).toFixed(2)}</div>
                        )}
                        <div>Rs. {(item.quantity * item.unit_price).toFixed(2)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="text-right space-y-1 mt-4 border-t border-dashed border-gray-400 dark:border-gray-600 pt-4">
                {selectedSale.bill_discount > 0 && (
                  <>
                    <p className="text-sm">Subtotal: Rs. {(selectedSale.total_amount + selectedSale.bill_discount).toFixed(2)}</p>
                    <p className="text-sm text-red-500 font-bold">Bill Discount: - Rs. {selectedSale.bill_discount.toFixed(2)}</p>
                  </>
                )}
                <p className="text-lg font-bold">Total: Rs. {selectedSale.total_amount.toFixed(2)}</p>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-xl flex gap-3">
              <button onClick={() => setSelectedSale(null)} className="flex-1 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-lg font-bold transition-colors cursor-pointer">
                Close
              </button>
              <button onClick={handlePrint} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors flex items-center justify-center cursor-pointer">
                <Printer className="w-4 h-4 mr-2" /> Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Invoice Modal */}
      {editingSale && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 flex items-center gap-2">
                  <Edit className="w-5 h-5 text-amber-600" />
                  Edit Invoice #{editingSale.receipt_no}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {new Date(editingSale.created_at).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setEditingSale(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* Payment Type Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-2">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-3 max-w-xs">
                  <button
                    type="button"
                    onClick={() => setEditingSale({ ...editingSale, payment_type: 'CASH' })}
                    className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-sm border transition-all cursor-pointer ${
                      editingSale.payment_type === 'CASH'
                        ? 'bg-green-500 text-white border-green-600 shadow-sm'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Banknote className="w-4 h-4" /> Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingSale({ ...editingSale, payment_type: 'CARD' })}
                    className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-sm border transition-all cursor-pointer ${
                      editingSale.payment_type === 'CARD'
                        ? 'bg-blue-500 text-white border-blue-600 shadow-sm'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" /> Card
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-2">
                  Invoice Items ({editingSale.items.length})
                </label>
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
                  {editingSale.items.map((item: any, idx: number) => {
                    const origPrice = item.original_price ?? item.unit_price;
                    const lineOrigTotal = origPrice * item.quantity;
                    const lineTotal = item.unit_price * item.quantity;
                    const itemSavings = Math.max(0, lineOrigTotal - lineTotal);

                    return (
                      <div key={idx} className="p-3 bg-white dark:bg-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-gray-800 dark:text-gray-100 text-sm truncate">{item.title}</h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{item.barcode}</p>
                          <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                            Unit Price: <span className="font-bold text-blue-600 dark:text-blue-400">Rs. {item.unit_price.toFixed(2)}</span>
                            {itemSavings > 0 && (
                              <span className="ml-1.5 line-through text-gray-400">Rs. {origPrice.toFixed(2)}</span>
                            )}
                          </div>
                        </div>

                        {/* Qty & Item Discount Controls */}
                        <div className="flex items-center gap-3 self-end sm:self-center">
                          {/* Item Discount */}
                          <div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 overflow-hidden text-xs">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="0"
                              value={item.discountVal}
                              onChange={(e) => handleEditItemDiscount(idx, e.target.value)}
                              className="w-14 px-2 py-1 font-bold text-gray-900 dark:text-gray-100 bg-transparent focus:outline-none text-right"
                              title="Item discount"
                            />
                            <div className="flex bg-gray-200 dark:bg-gray-600 p-0.5 text-[10px] font-bold">
                              <button
                                type="button"
                                onClick={() => handleToggleItemDiscountMode(idx, 'Rs')}
                                className={`px-1.5 py-0.5 rounded cursor-pointer ${item.discountMode === 'Rs' ? 'bg-white dark:bg-gray-800 text-blue-600 font-bold shadow-2xs' : 'text-gray-500'}`}
                              >
                                Rs
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleItemDiscountMode(idx, '%')}
                                className={`px-1.5 py-0.5 rounded cursor-pointer ${item.discountMode === '%' ? 'bg-white dark:bg-gray-800 text-blue-600 font-bold shadow-2xs' : 'text-gray-500'}`}
                              >
                                %
                              </button>
                            </div>
                          </div>

                          {/* Qty Counter */}
                          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 text-xs">
                            <button
                              type="button"
                              onClick={() => handleEditItemQty(idx, -1)}
                              disabled={item.quantity <= 1}
                              className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300 disabled:opacity-30 cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-8 text-center font-bold text-gray-900 dark:text-gray-100">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => handleEditItemQty(idx, 1)}
                              className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Line Total */}
                          <div className="w-24 text-right">
                            <p className="font-bold text-sm text-gray-900 dark:text-gray-100">Rs. {lineTotal.toFixed(2)}</p>
                          </div>

                          {/* Delete Item */}
                          <button
                            type="button"
                            onClick={() => handleRemoveEditItem(idx)}
                            disabled={editingSale.items.length <= 1}
                            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-20 cursor-pointer"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bill Discount Input */}
              <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider block">
                    Bill Discount (Rs.)
                  </span>
                  <span className="text-xs text-gray-400">Additional discount off the whole invoice total</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    value={editingSale.billDiscountInput}
                    onChange={(e) => setEditingSale({ ...editingSale, billDiscountInput: e.target.value })}
                    className="w-36 px-3 py-1.5 text-sm font-bold border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                  />
                </div>
              </div>

              {/* Summary Totals */}
              <div className="bg-gray-50 dark:bg-gray-900/60 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>Subtotal</span>
                  <span className="font-semibold">Rs. {editSubtotal.toFixed(2)}</span>
                </div>
                {editBillDiscount > 0 && (
                  <div className="flex justify-between text-red-600 dark:text-red-400 font-medium">
                    <span>Bill Discount</span>
                    <span>- Rs. {editBillDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black text-gray-900 dark:text-gray-100 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span>Net Total</span>
                  <span className="text-blue-600 dark:text-blue-400 text-lg">Rs. {editNetTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl flex gap-3">
              <button
                type="button"
                onClick={() => setEditingSale(null)}
                className="flex-1 py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-xl font-bold transition-colors cursor-pointer text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit || editingSale.items.length === 0}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl font-bold transition-colors flex items-center justify-center cursor-pointer shadow-sm text-sm"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSavingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
