import { useState, useEffect, useMemo } from 'react';
import { db, type Supplier, type SupplierPayment, type GRNHeader } from '../db';
import {
  Plus, Truck, Phone, Search, DollarSign, AlertCircle, CheckCircle2,
  Calendar, CreditCard, Banknote, Building2, User, Mail, MapPin,
  FileText, Trash2, Edit2, X, ArrowUpRight, ArrowDownLeft, ShieldAlert
} from 'lucide-react';
import { useToast } from '../components/Toast';
import { Skeleton, EmptyState } from '../components/Skeleton';

const fmtRs = (n: number = 0) =>
  `Rs. ${Number(n).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const todayStr = () => new Date().toISOString().split('T')[0];

export default function Suppliers() {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDebtOnly, setFilterDebtOnly] = useState<'ALL' | 'DEBT' | 'CLEAR'>('ALL');

  // Add / Edit Modal state
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  });
  const [savingSupplier, setSavingSupplier] = useState(false);

  // Ledger & Payment Modal state
  const [selectedLedgerSupplier, setSelectedLedgerSupplier] = useState<Supplier | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerGrns, setLedgerGrns] = useState<GRNHeader[]>([]);
  const [ledgerPayments, setLedgerPayments] = useState<SupplierPayment[]>([]);
  const [ledgerPendingGrns, setLedgerPendingGrns] = useState<GRNHeader[]>([]);
  const [activeLedgerTab, setActiveLedgerTab] = useState<'ALL' | 'GRN' | 'PAYMENTS'>('ALL');

  // Record Payment Form inside Ledger
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE'>('CASH');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayStr());
  const [paymentGrnId, setPaymentGrnId] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const fetchSuppliers = async () => {
    try {
      const res = await db.suppliers.getAll();
      setSuppliers(res.data ?? []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const openAddModal = () => {
    setEditingSupplier(null);
    setFormData({
      name: '',
      contact_person: '',
      phone: '',
      email: '',
      address: '',
      notes: '',
    });
    setShowAddEditModal(true);
  };

  const openEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      contact_person: supplier.contact_person || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      notes: supplier.notes || '',
    });
    setShowAddEditModal(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Supplier name is required.');
      return;
    }
    setSavingSupplier(true);
    try {
      const payload: Partial<Supplier> = {
        name: formData.name.trim(),
        contact_person: formData.contact_person.trim() || undefined,
        phone: formData.phone.trim() || '',
        email: formData.email.trim() || undefined,
        address: formData.address.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      };
      if (editingSupplier?.id) {
        payload.id = editingSupplier.id;
      }
      const res = await db.suppliers.upsert(payload);
      if (!res.success) throw new Error(res.error || 'Failed to save supplier');

      toast.success(
        editingSupplier ? `Updated "${formData.name}".` : `Supplier "${formData.name}" added.`,
        'Supplier Saved'
      );
      setShowAddEditModal(false);
      fetchSuppliers();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error saving supplier.');
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleDeleteSupplier = async (supplier: Supplier) => {
    if (!supplier.id) return;
    if (!window.confirm(`Are you sure you want to delete "${supplier.name}"?`)) return;

    try {
      const res = await db.suppliers.delete(supplier.id);
      if (!res.success) throw new Error(res.error || 'Failed to delete supplier');
      toast.success(`Supplier "${supplier.name}" deleted.`);
      fetchSuppliers();
    } catch (err: any) {
      toast.error(err.message || 'Cannot delete supplier.');
    }
  };

  // Open Ledger
  const openSupplierLedger = async (supplier: Supplier) => {
    setSelectedLedgerSupplier(supplier);
    setPaymentAmount('');
    setPaymentRef('');
    setPaymentNotes('');
    setPaymentGrnId('');
    setPaymentDate(todayStr());
    setLedgerLoading(true);

    try {
      const res = await db.suppliers.getLedger(supplier.id!);
      if (res.success && res.data) {
        setSelectedLedgerSupplier(res.data.supplier);
        setLedgerGrns(res.data.grns);
        setLedgerPayments(res.data.payments);
        setLedgerPendingGrns(res.data.pendingGrns);
      } else {
        throw new Error(res.error || 'Failed to load supplier ledger');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load ledger');
    } finally {
      setLedgerLoading(false);
    }
  };

  const refreshLedger = async (supplierId: number) => {
    try {
      const res = await db.suppliers.getLedger(supplierId);
      if (res.success && res.data) {
        setSelectedLedgerSupplier(res.data.supplier);
        setLedgerGrns(res.data.grns);
        setLedgerPayments(res.data.payments);
        setLedgerPendingGrns(res.data.pendingGrns);
      }
      fetchSuppliers();
    } catch (err) {
      console.error(err);
    }
  };

  // Record Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLedgerSupplier?.id) return;
    const amountNum = parseFloat(paymentAmount);
    if (!amountNum || amountNum <= 0) {
      toast.error('Please enter a valid payment amount.');
      return;
    }

    setSubmittingPayment(true);
    try {
      const res = await db.suppliers.addPayment({
        supplier_id: selectedLedgerSupplier.id,
        grn_id: paymentGrnId ? parseInt(paymentGrnId, 10) : null,
        amount: amountNum,
        payment_method: paymentMethod,
        reference_no: paymentRef.trim() || undefined,
        payment_date: paymentDate,
        notes: paymentNotes.trim() || undefined,
      });

      if (!res.success) throw new Error(res.error || 'Failed to record payment');

      toast.success(`Payment of ${fmtRs(amountNum)} recorded!`, 'Payment Saved');
      setPaymentAmount('');
      setPaymentRef('');
      setPaymentNotes('');
      setPaymentGrnId('');
      refreshLedger(selectedLedgerSupplier.id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to record payment.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Delete Payment
  const handleDeletePayment = async (paymentId: number) => {
    if (!selectedLedgerSupplier?.id) return;
    if (!window.confirm('Are you sure you want to delete this payment record?')) return;

    try {
      const res = await db.suppliers.deletePayment(paymentId);
      if (!res.success) throw new Error(res.error || 'Failed to delete payment');
      toast.success('Payment deleted.');
      refreshLedger(selectedLedgerSupplier.id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete payment');
    }
  };

  // Metrics
  const metrics = useMemo(() => {
    const totalCount = suppliers.length;
    const totalDebt = suppliers.reduce((sum, s) => sum + (s.total_outstanding || 0), 0);
    const totalPurchases = suppliers.reduce((sum, s) => sum + (s.total_purchases || 0), 0);
    const pendingBillsCount = suppliers.reduce((sum, s) => sum + (s.pending_grn_count || 0), 0);
    return { totalCount, totalDebt, totalPurchases, pendingBillsCount };
  }, [suppliers]);

  // Filtered Suppliers
  const filteredSuppliers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return suppliers.filter(s => {
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q)) ||
        (s.notes && s.notes.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (filterDebtOnly === 'DEBT') return (s.total_outstanding || 0) > 0;
      if (filterDebtOnly === 'CLEAR') return (s.total_outstanding || 0) === 0;
      return true;
    });
  }, [suppliers, search, filterDebtOnly]);

  // Combined Timeline for Ledger
  const combinedTimeline = useMemo(() => {
    const events: Array<{
      id: string;
      date: string;
      type: 'GRN' | 'PAYMENT';
      title: string;
      refNumber: string;
      amount: number;
      paymentType?: string;
      status?: string;
      notes?: string | null;
      rawPayment?: SupplierPayment;
    }> = [];

    ledgerGrns.forEach(g => {
      events.push({
        id: `grn-${g.id}`,
        date: g.received_date,
        type: 'GRN',
        title: `GRN Bill (${g.payment_type})`,
        refNumber: g.supplier_invoice_no ? `${g.grn_number} • Inv: ${g.supplier_invoice_no}` : g.grn_number,
        amount: g.total_amount,
        paymentType: g.payment_type,
        status: g.status,
        notes: g.notes,
      });
    });

    ledgerPayments.forEach(p => {
      events.push({
        id: `pay-${p.id}`,
        date: p.payment_date,
        type: 'PAYMENT',
        title: `Payment Out (${p.payment_method})`,
        refNumber: p.reference_no ? `Ref: ${p.reference_no}${p.grn_number ? ` • GRN: ${p.grn_number}` : ''}` : (p.grn_number ? `GRN: ${p.grn_number}` : 'General Settlement'),
        amount: p.amount,
        paymentType: p.payment_method,
        notes: p.notes,
        rawPayment: p,
      });
    });

    return events.sort((a, b) => b.date.localeCompare(a.date));
  }, [ledgerGrns, ledgerPayments]);

  return (
    <div className="p-8 h-full flex flex-col overflow-y-auto">
      {/* Top Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl">
              <Truck className="w-6 h-6" />
            </div>
            <span>Supplier Directory & Payables Ledger</span>
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Track book distributors, credit balances, and payment statements
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-600/25 transition-all cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>Add Distributor</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Total Suppliers
            </span>
            <span className="text-2xl font-black text-gray-900 dark:text-gray-100">
              {metrics.totalCount}
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-rose-200 dark:border-rose-900/40 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-rose-500 uppercase tracking-wider block mb-1">
              Outstanding Payables (Debt)
            </span>
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {fmtRs(metrics.totalDebt)}
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-amber-200 dark:border-amber-900/40 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-amber-500 uppercase tracking-wider block mb-1">
              Pending Credit Bills
            </span>
            <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {metrics.pendingBillsCount} GRNs
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Calendar className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Total Purchases
            </span>
            <span className="text-2xl font-black text-gray-900 dark:text-gray-100">
              {fmtRs(metrics.totalPurchases)}
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by company name, rep, phone, or terms..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700/60 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setFilterDebtOnly('ALL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterDebtOnly === 'ALL'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
            }`}
          >
            All Suppliers ({suppliers.length})
          </button>
          <button
            onClick={() => setFilterDebtOnly('DEBT')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterDebtOnly === 'DEBT'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
            }`}
          >
            Debt Owed ({suppliers.filter(s => (s.total_outstanding || 0) > 0).length})
          </button>
          <button
            onClick={() => setFilterDebtOnly('CLEAR')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterDebtOnly === 'CLEAR'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
            }`}
          >
            Clear / Settled ({suppliers.filter(s => (s.total_outstanding || 0) === 0).length})
          </button>
        </div>
      </div>

      {/* Suppliers Grid */}
      <div className="flex-1">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-2xl p-5 space-y-3 bg-white dark:bg-gray-800">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-14 w-full" />
              </div>
            ))}
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <EmptyState
            icon={<Truck className="w-12 h-12 text-gray-400" />}
            title={search ? 'No matching suppliers found' : 'No suppliers registered yet'}
            subtitle="Add your book publishers, paper mills, and stationery distributors to manage purchase debt."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredSuppliers.map(supplier => {
              const debt = supplier.total_outstanding || 0;
              const hasDebt = debt > 0;

              return (
                <div
                  key={supplier.id}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <h4 className="font-black text-lg text-gray-900 dark:text-gray-100 leading-snug">
                          {supplier.name}
                        </h4>
                        {supplier.contact_person && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5 font-medium">
                            <User className="w-3.5 h-3.5 text-gray-400" />
                            {supplier.contact_person}
                          </span>
                        )}
                      </div>

                      {/* Outstanding Debt Badge */}
                      <div className="text-right shrink-0">
                        {hasDebt ? (
                          <span className="inline-block px-2.5 py-1 rounded-xl text-xs font-black bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                            Due: {fmtRs(debt)}
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            ✓ Clear
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Contact details */}
                    <div className="space-y-1.5 my-3 text-xs text-gray-600 dark:text-gray-300">
                      {supplier.phone ? (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          <span className="font-mono font-bold text-gray-800 dark:text-gray-200">{supplier.phone}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-gray-400 italic">
                          <Phone className="w-3.5 h-3.5" />
                          <span>No phone provided</span>
                        </div>
                      )}

                      {supplier.address && (
                        <div className="flex items-center gap-2 text-gray-500">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="truncate">{supplier.address}</span>
                        </div>
                      )}

                      {supplier.email && (
                        <div className="flex items-center gap-2 text-gray-500">
                          <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="truncate">{supplier.email}</span>
                        </div>
                      )}
                    </div>

                    {/* GRN Purchase Stats */}
                    <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3 my-3 text-xs flex justify-between items-center border border-gray-100 dark:border-gray-800">
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase font-bold block">Purchases</span>
                        <span className="font-bold text-gray-800 dark:text-gray-200">{fmtRs(supplier.total_purchases || 0)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-gray-400 uppercase font-bold block">GRN Count</span>
                        <span className="font-bold text-gray-800 dark:text-gray-200">
                          {supplier.grn_count || 0} bills
                          {supplier.pending_grn_count ? ` (${supplier.pending_grn_count} unpaid)` : ''}
                        </span>
                      </div>
                    </div>

                    {supplier.notes && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic line-clamp-2 mb-3">
                        "{supplier.notes}"
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <button
                      onClick={() => openSupplierLedger(supplier)}
                      className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Ledger & Pay</span>
                    </button>
                    <button
                      onClick={() => openEditModal(supplier)}
                      className="p-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl text-gray-600 dark:text-gray-300 transition-colors cursor-pointer"
                      title="Edit Supplier"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteSupplier(supplier)}
                      className="p-2 border border-gray-300 dark:border-gray-600 hover:bg-rose-50 hover:border-rose-200 text-gray-500 hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
                      title="Delete Supplier"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Supplier Modal */}
      {showAddEditModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowAddEditModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <Truck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-wide">
                    {editingSupplier ? 'Edit Supplier' : 'Register New Supplier'}
                  </h3>
                  <p className="text-xs text-blue-100">Distributor or publisher details</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddEditModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  Company / Distributor Name *
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Atlas Axillia / Richard Trading / MD Gunasena"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                    Contact Person / Sales Rep
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ruwan Perera"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 0771234567"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Colombo 10"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="orders@supplier.lk"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  Payment Terms / Delivery Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Net 30 days credit, delivery on Mondays, cheque payments accepted"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3.5 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSupplier}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/25 disabled:opacity-50 cursor-pointer"
                >
                  {savingSupplier ? 'Saving...' : editingSupplier ? 'Update Supplier' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Ledger & Payment Statement Modal */}
      {selectedLedgerSupplier && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedLedgerSupplier(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-6 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase font-bold tracking-wider text-blue-200">Supplier Ledger & Statement</span>
                </div>
                <h3 className="text-2xl font-black">{selectedLedgerSupplier.name}</h3>
                <p className="text-xs text-blue-200 mt-0.5">
                  {selectedLedgerSupplier.contact_person ? `Rep: ${selectedLedgerSupplier.contact_person} • ` : ''}
                  Phone: {selectedLedgerSupplier.phone || 'No phone'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLedgerSupplier(null)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Balances bar */}
            <div className="grid grid-cols-3 gap-4 p-5 bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-700">
              <div className="bg-white dark:bg-gray-800 p-3.5 rounded-2xl border border-gray-200 dark:border-gray-700">
                <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Total Purchased</span>
                <span className="text-lg font-black text-gray-900 dark:text-gray-100">
                  {fmtRs(selectedLedgerSupplier.total_purchases || 0)}
                </span>
              </div>
              <div className="bg-white dark:bg-gray-800 p-3.5 rounded-2xl border border-gray-200 dark:border-gray-700">
                <span className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Total Paid to Date</span>
                <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                  {fmtRs(selectedLedgerSupplier.total_paid || 0)}
                </span>
              </div>
              <div className="bg-white dark:bg-gray-800 p-3.5 rounded-2xl border border-rose-200 dark:border-rose-900/50">
                <span className="text-[10px] uppercase font-bold text-rose-500 block mb-0.5">Current Balance Owed</span>
                <span className="text-lg font-black text-rose-600 dark:text-rose-400">
                  {fmtRs(selectedLedgerSupplier.total_outstanding || 0)}
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Record Payment Box */}
              <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-black text-blue-900 dark:text-blue-300 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    Record Supplier Payment
                  </h4>
                  {(selectedLedgerSupplier.total_outstanding || 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaymentAmount(String(selectedLedgerSupplier.total_outstanding))}
                      className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                    >
                      Pay Full Balance ({fmtRs(selectedLedgerSupplier.total_outstanding)})
                    </button>
                  )}
                </div>

                <form onSubmit={handleRecordPayment} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block mb-1">
                      Amount (Rs.) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block mb-1">
                      Payment Method *
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="CASH">Cash</option>
                      <option value="BANK_TRANSFER">Bank Transfer / Online</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block mb-1">
                      {paymentMethod === 'CHEQUE' ? 'Cheque No. & Bank' : 'Reference / Receipt No.'}
                    </label>
                    <input
                      type="text"
                      placeholder={paymentMethod === 'CHEQUE' ? 'e.g. Chq #4829 - Commercial' : 'e.g. Tx #84910'}
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block mb-1">
                      Payment Date
                    </label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {ledgerPendingGrns.length > 0 && (
                    <div className="md:col-span-2">
                      <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block mb-1">
                        Apply to Specific Pending Bill (Optional)
                      </label>
                      <select
                        value={paymentGrnId}
                        onChange={(e) => {
                          setPaymentGrnId(e.target.value);
                          if (e.target.value) {
                            const selected = ledgerPendingGrns.find(g => String(g.id) === e.target.value);
                            if (selected && !paymentAmount) {
                              setPaymentAmount(String(selected.total_amount));
                            }
                          }
                        }}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">— General Payment against Outstanding Balance —</option>
                        {ledgerPendingGrns.map(g => (
                          <option key={g.id} value={g.id}>
                            {g.grn_number} ({g.received_date}) — {fmtRs(g.total_amount)}
                            {g.supplier_invoice_no ? ` [Inv: ${g.supplier_invoice_no}]` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className={ledgerPendingGrns.length > 0 ? "md:col-span-2 flex items-end gap-2" : "md:col-span-4 flex items-end gap-2"}>
                    <input
                      type="text"
                      placeholder="Notes / Comments (Optional)"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={submittingPayment || !paymentAmount}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-600/25 disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      {submittingPayment ? 'Saving...' : 'Record Payment'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Transactions History Header & Tabs */}
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
                  <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">
                    Transaction History & Bills ({combinedTimeline.length})
                  </h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveLedgerTab('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeLedgerTab === 'ALL'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      All ({combinedTimeline.length})
                    </button>
                    <button
                      onClick={() => setActiveLedgerTab('GRN')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeLedgerTab === 'GRN'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      GRN Bills ({ledgerGrns.length})
                    </button>
                    <button
                      onClick={() => setActiveLedgerTab('PAYMENTS')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeLedgerTab === 'PAYMENTS'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      Payments ({ledgerPayments.length})
                    </button>
                  </div>
                </div>

                {ledgerLoading ? (
                  <div className="py-12 text-center text-sm text-gray-400">Loading ledger statement...</div>
                ) : combinedTimeline.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-400">
                    No Goods Received Notes or payment records found for this supplier.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-80 overflow-y-auto mt-2">
                    {combinedTimeline
                      .filter(t => {
                        if (activeLedgerTab === 'GRN') return t.type === 'GRN';
                        if (activeLedgerTab === 'PAYMENTS') return t.type === 'PAYMENT';
                        return true;
                      })
                      .map(item => (
                        <div key={item.id} className="py-3.5 flex items-center justify-between hover:bg-gray-50/50 dark:hover:bg-gray-750 px-2 rounded-xl transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              item.type === 'GRN'
                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                                : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                            }`}>
                              {item.type === 'GRN' ? (
                                <ArrowDownLeft className="w-5 h-5" />
                              ) : (
                                <ArrowUpRight className="w-5 h-5" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
                                  {item.title}
                                </span>
                                {item.status && (
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    item.status === 'PAID'
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                                  }`}>
                                    {item.status}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 font-mono mt-0.5">
                                {item.refNumber} • {item.date}
                              </p>
                              {item.notes && (
                                <p className="text-xs text-gray-400 italic mt-0.5">
                                  "{item.notes}"
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 text-right">
                            <div>
                              <span className={`text-base font-black ${
                                item.type === 'GRN'
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}>
                                {item.type === 'GRN' ? `+ ${fmtRs(item.amount)}` : `- ${fmtRs(item.amount)}`}
                              </span>
                              <span className="block text-[10px] uppercase font-bold text-gray-400">
                                {item.type === 'GRN' ? 'Bill Total' : 'Payment Made'}
                              </span>
                            </div>

                            {item.rawPayment && (
                              <button
                                onClick={() => handleDeletePayment(item.rawPayment!.id!)}
                                className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors cursor-pointer"
                                title="Delete payment entry"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
