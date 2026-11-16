import { useState, useEffect, useMemo } from 'react';
import { db, type Supplier, type SupplierPayment, type GRNHeader, type Cheque } from '../db';
import {
  Plus, Truck, Phone, Search, DollarSign, AlertCircle, CheckCircle2,
  Calendar, CreditCard, Building2, User, Mail, MapPin,
  FileText, Trash2, Edit2, X, ArrowUpRight, ArrowDownLeft,
  Clock, AlertTriangle, FileSpreadsheet, Check, Ban
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

  // View mode: Suppliers vs Cheques
  const [activeView, setActiveView] = useState<'SUPPLIERS' | 'CHEQUES'>('SUPPLIERS');

  // Cheque Management & Alert State
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [dueAlerts, setDueAlerts] = useState<Cheque[]>([]);
  const [loadingCheques, setLoadingCheques] = useState(false);
  const [chequeFilterStatus, setChequeFilterStatus] = useState<'ALL' | 'PENDING' | 'CLEARED' | 'BOUNCED'>('ALL');
  const [chequeFilterType, setChequeFilterType] = useState<'ALL' | 'ISSUED_TO_SUPPLIER' | 'RECEIVED_FROM_CUSTOMER'>('ALL');
  const [chequeSearch, setChequeSearch] = useState('');
  const [showAddChequeModal, setShowAddChequeModal] = useState(false);
  const [savingCheque, setSavingCheque] = useState(false);
  const [chequeFormData, setChequeFormData] = useState({
    cheque_number: '',
    bank_name: '',
    branch: '',
    amount: '',
    cheque_type: 'ISSUED_TO_SUPPLIER' as 'ISSUED_TO_SUPPLIER' | 'RECEIVED_FROM_CUSTOMER',
    payee_or_drawer: '',
    supplier_id: '',
    issue_date: todayStr(),
    due_date: todayStr(),
    notes: '',
  });

  // Additional Cheque fields in Ledger Payment drawer
  const [paymentChequeBank, setPaymentChequeBank] = useState('Commercial Bank');
  const [paymentChequeDueDate, setPaymentChequeDueDate] = useState(todayStr());
  const [pendingGrns, setPendingGrns] = useState<GRNHeader[]>([]);

  const fetchSuppliers = async () => {
    try {
      const [supRes, grnRes] = await Promise.all([
        db.suppliers.getAll(),
        db.grn.getPending(),
      ]);
      setSuppliers(supRes.data ?? []);
      if (grnRes?.success) setPendingGrns(grnRes.data ?? []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCheques = async () => {
    setLoadingCheques(true);
    try {
      const [allRes, alertRes] = await Promise.all([
        db.cheques.getAll(),
        db.cheques.getDueAlerts(),
      ]);
      if (allRes.success) setCheques(allRes.data ?? []);
      if (alertRes.success) setDueAlerts(alertRes.data ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCheques(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
    fetchCheques();
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

      // If payment is by Cheque, automatically register in Cheque ledger
      if (paymentMethod === 'CHEQUE' && paymentRef.trim()) {
        try {
          await db.cheques.create({
            cheque_number: paymentRef.trim(),
            bank_name: paymentChequeBank.trim() || 'Bank',
            amount: amountNum,
            cheque_type: 'ISSUED_TO_SUPPLIER',
            payee_or_drawer: selectedLedgerSupplier.name,
            supplier_id: selectedLedgerSupplier.id,
            issue_date: paymentDate,
            due_date: paymentChequeDueDate || paymentDate,
            status: 'PENDING',
            notes: paymentNotes.trim() || `Issued for ${selectedLedgerSupplier.name}`,
          });
          fetchCheques();
        } catch (chqErr) {
          console.warn('Auto cheque create warning:', chqErr);
        }
      }

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

  // Cheque Handlers
  const handleSaveCheque = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chequeFormData.cheque_number.trim()) {
      toast.error('Cheque number is required');
      return;
    }
    if (!chequeFormData.bank_name.trim()) {
      toast.error('Bank name is required');
      return;
    }
    const amt = parseFloat(chequeFormData.amount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Valid cheque amount is required');
      return;
    }
    if (!chequeFormData.due_date) {
      toast.error('Cheque due date is required');
      return;
    }

    setSavingCheque(true);
    try {
      const res = await db.cheques.create({
        cheque_number: chequeFormData.cheque_number.trim(),
        bank_name: chequeFormData.bank_name.trim(),
        branch: chequeFormData.branch.trim(),
        amount: amt,
        cheque_type: chequeFormData.cheque_type,
        payee_or_drawer: chequeFormData.payee_or_drawer.trim(),
        supplier_id: chequeFormData.supplier_id ? parseInt(chequeFormData.supplier_id, 10) : null,
        issue_date: chequeFormData.issue_date || todayStr(),
        due_date: chequeFormData.due_date,
        status: 'PENDING',
        notes: chequeFormData.notes.trim(),
      });
      if (!res.success) throw new Error(res.error || 'Failed to save cheque');
      toast.success(`Cheque #${chequeFormData.cheque_number} created successfully!`, 'Cheque Saved');
      setShowAddChequeModal(false);
      setChequeFormData({
        cheque_number: '',
        bank_name: '',
        branch: '',
        amount: '',
        cheque_type: 'ISSUED_TO_SUPPLIER',
        payee_or_drawer: '',
        supplier_id: '',
        issue_date: todayStr(),
        due_date: todayStr(),
        notes: '',
      });
      fetchCheques();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create cheque');
    } finally {
      setSavingCheque(false);
    }
  };

  const handleUpdateChequeStatus = async (id: number, status: string) => {
    try {
      const res = await db.cheques.updateStatus(id, status);
      if (!res.success) throw new Error(res.error || 'Failed to update status');
      toast.success(`Cheque marked as ${status}`);
      fetchCheques();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update cheque');
    }
  };

  const handleDeleteCheque = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this cheque record?')) return;
    try {
      const res = await db.cheques.delete(id);
      if (!res.success) throw new Error(res.error || 'Failed to delete cheque');
      toast.success('Cheque record deleted');
      fetchCheques();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete cheque');
    }
  };

  // Filtered Cheques
  const filteredCheques = useMemo(() => {
    const q = chequeSearch.toLowerCase().trim();
    return cheques.filter(c => {
      if (chequeFilterStatus !== 'ALL' && c.status !== chequeFilterStatus) return false;
      if (chequeFilterType !== 'ALL' && c.cheque_type !== chequeFilterType) return false;
      if (!q) return true;
      return (
        c.cheque_number.toLowerCase().includes(q) ||
        c.bank_name.toLowerCase().includes(q) ||
        (c.branch && c.branch.toLowerCase().includes(q)) ||
        c.payee_or_drawer.toLowerCase().includes(q) ||
        (c.supplier_name && c.supplier_name.toLowerCase().includes(q)) ||
        (c.customer_name && c.customer_name.toLowerCase().includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q))
      );
    });
  }, [cheques, chequeFilterStatus, chequeFilterType, chequeSearch]);

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

  // Debt Aging Breakdown for Pending GRN Bills
  const agingSummary = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let under15 = 0;
    let days15to30 = 0;
    let days30to60 = 0;
    let over60 = 0;

    let countUnder15 = 0;
    let count15to30 = 0;
    let count30to60 = 0;
    let countOver60 = 0;

    pendingGrns.forEach(g => {
      const refDate = new Date(g.received_date || g.created_at || today);
      refDate.setHours(0, 0, 0, 0);
      const ageDays = Math.max(0, Math.floor((today.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24)));
      const amt = g.total_amount || 0;

      if (ageDays < 15) {
        under15 += amt;
        countUnder15++;
      } else if (ageDays <= 30) {
        days15to30 += amt;
        count15to30++;
      } else if (ageDays <= 60) {
        days30to60 += amt;
        count30to60++;
      } else {
        over60 += amt;
        countOver60++;
      }
    });

    const totalAgingDebt = under15 + days15to30 + days30to60 + over60;

    return {
      under15,
      days15to30,
      days30to60,
      over60,
      countUnder15,
      count15to30,
      count30to60,
      countOver60,
      totalAgingDebt,
    };
  }, [pendingGrns]);

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

  // Cheque Metrics
  const chequeMetrics = useMemo(() => {
    const total = cheques.length;
    const pending = cheques.filter(c => c.status === 'PENDING');
    const cleared = cheques.filter(c => c.status === 'CLEARED');
    const bounced = cheques.filter(c => c.status === 'BOUNCED');

    const pendingTotal = pending.reduce((sum, c) => sum + (c.amount || 0), 0);
    const alertTotal = dueAlerts.reduce((sum, c) => sum + (c.amount || 0), 0);
    const clearedTotal = cleared.reduce((sum, c) => sum + (c.amount || 0), 0);

    return {
      total,
      pendingCount: pending.length,
      pendingTotal,
      alertCount: dueAlerts.length,
      alertTotal,
      clearedCount: cleared.length,
      clearedTotal,
      bouncedCount: bounced.length,
    };
  }, [cheques, dueAlerts]);

  const getChequeDueStatus = (dueDateStr: string, status: string) => {
    if (status !== 'PENDING') return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Overdue by ${Math.abs(diffDays)}d`, color: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border-rose-300 dark:border-rose-800', isOverdue: true };
    } else if (diffDays === 0) {
      return { label: 'Due Today', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-700', isDueSoon: true };
    } else if (diffDays <= 7) {
      return { label: `Due in ${diffDays}d`, color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800', isDueSoon: true };
    }
    return { label: `Due in ${diffDays}d`, color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600', isDueSoon: false };
  };

  return (
    <div className="p-6 lg:p-8 h-full flex flex-col overflow-y-auto space-y-4">
      {/* Top Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900/50">
              {activeView === 'SUPPLIERS' ? <Truck className="w-4 h-4" /> : <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
            </div>
            <span>{activeView === 'SUPPLIERS' ? 'Supplier Directory & Payables Ledger' : 'Cheque Management & Post-Dated Alerts'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {activeView === 'SUPPLIERS'
              ? 'Track book distributors, credit balances, and payment statements'
              : 'Manage supplier cheques, customer cheques, and track upcoming deposit maturities'}
          </p>
        </div>

        {activeView === 'SUPPLIERS' ? (
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-semibold text-xs shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Distributor</span>
          </button>
        ) : (
          <button
            onClick={() => {
              setChequeFormData({
                cheque_number: '',
                bank_name: 'Commercial Bank',
                branch: '',
                amount: '',
                cheque_type: 'ISSUED_TO_SUPPLIER',
                payee_or_drawer: '',
                supplier_id: '',
                issue_date: todayStr(),
                due_date: todayStr(),
                notes: '',
              });
              setShowAddChequeModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-semibold text-xs shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Issue / Add Cheque</span>
          </button>
        )}
      </div>

      {/* View Switcher Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-medium border border-slate-200/60 dark:border-slate-700/60 w-fit">
        <button
          onClick={() => setActiveView('SUPPLIERS')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
            activeView === 'SUPPLIERS'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          <span>Distributors & Ledger ({suppliers.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveView('CHEQUES');
            fetchCheques();
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer relative ${
            activeView === 'CHEQUES'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Cheques & Post-Dated Alerts ({cheques.length})</span>
          {dueAlerts.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white">
              {dueAlerts.length} Due
            </span>
          )}
        </button>
      </div>

      {activeView === 'SUPPLIERS' ? (
        <>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
              Total Suppliers
            </span>
            <span className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
              {metrics.totalCount}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center">
            <Building2 className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold text-rose-500 uppercase tracking-wider block mb-0.5">
              Outstanding Payables (Debt)
            </span>
            <span className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
              {fmtRs(metrics.totalDebt)}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <AlertCircle className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider block mb-0.5">
              Pending Credit Bills
            </span>
            <span className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
              {metrics.pendingBillsCount} GRNs
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Calendar className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
              Total Purchases
            </span>
            <span className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
              {fmtRs(metrics.totalPurchases)}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Supplier Debt Aging Breakdown (<15d, 15-30d, 30-60d, 60d+) */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800/90 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-xs font-semibold tracking-tight text-slate-900 dark:text-slate-100 block">
                Payables Debt Aging Analysis
              </span>
              <span className="text-[11px] text-slate-400">Aging breakdown across unpaid credit GRN invoices</span>
            </div>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            Pending Invoices Total: <strong className="text-slate-900 dark:text-slate-100 tabular-nums">{fmtRs(agingSummary.totalAgingDebt || metrics.totalDebt)}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="p-2.5 bg-slate-50/60 dark:bg-slate-950/40 rounded-lg border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              <span>&lt; 15 Days</span>
              <span className="text-[10px] bg-slate-200/70 dark:bg-slate-800 px-1 py-0.2 rounded font-mono">{agingSummary.countUnder15} bills</span>
            </div>
            <span className="text-base font-black text-emerald-700 dark:text-emerald-400 block">
              {fmtRs(agingSummary.under15)}
            </span>
            <span className="text-[10px] text-emerald-600/80 dark:text-emerald-500 font-medium mt-0.5 block">Recent purchases</span>
          </div>

          <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-900/50">
            <div className="flex items-center justify-between text-xs font-bold text-blue-800 dark:text-blue-300 mb-1">
              <span>15 – 30 Days</span>
              <span className="text-[10px] bg-blue-200/70 dark:bg-blue-900/60 px-1.5 py-0.5 rounded font-mono">{agingSummary.count15to30} bills</span>
            </div>
            <span className="text-base font-black text-blue-700 dark:text-blue-400 block">
              {fmtRs(agingSummary.days15to30)}
            </span>
            <span className="text-[10px] text-blue-600/80 dark:text-blue-500 font-medium mt-0.5 block">Standard monthly terms</span>
          </div>

          <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900/50">
            <div className="flex items-center justify-between text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">
              <span>30 – 60 Days</span>
              <span className="text-[10px] bg-amber-200/70 dark:bg-amber-900/60 px-1.5 py-0.5 rounded font-mono">{agingSummary.count30to60} bills</span>
            </div>
            <span className="text-base font-black text-amber-700 dark:text-amber-400 block">
              {fmtRs(agingSummary.days30to60)}
            </span>
            <span className="text-[10px] text-amber-600/80 dark:text-amber-500 font-medium mt-0.5 block">Payment priority</span>
          </div>

          <div className="p-3 bg-rose-50/70 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900/50">
            <div className="flex items-center justify-between text-xs font-bold text-rose-800 dark:text-rose-300 mb-1">
              <span>60+ Days Overdue</span>
              <span className="text-[10px] bg-rose-200/70 dark:bg-rose-900/60 px-1.5 py-0.5 rounded font-mono">{agingSummary.countOver60} bills</span>
            </div>
            <span className="text-base font-black text-rose-700 dark:text-rose-400 block">
              {fmtRs(agingSummary.over60)}
            </span>
            <span className="text-[10px] text-rose-600/80 dark:text-rose-500 font-medium mt-0.5 block">Urgent settlement required</span>
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
    </>
  ) : (
    /* ── Cheque Management & Alerts View ── */
    <div className="space-y-6 pb-12">
      {/* Due Alerts Banner */}
      {dueAlerts.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-amber-500/10 border-2 border-amber-400/60 dark:border-amber-500/40 rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <h3 className="font-black text-amber-900 dark:text-amber-200 text-base">
                  Post-Dated Cheques Due Soon or Overdue!
                </h3>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {dueAlerts.length} cheques totaling <strong>{fmtRs(chequeMetrics.alertTotal)}</strong> require bank deposit or clearing.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-amber-500 text-white text-xs font-black rounded-full uppercase tracking-wider">
              Urgent Attention
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            {dueAlerts.map(c => {
              const dueInfo = getChequeDueStatus(c.due_date, c.status);
              return (
                <div
                  key={c.id}
                  className="bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-900/50 p-4 rounded-2xl shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="font-mono font-bold text-sm text-gray-900 dark:text-gray-100">
                        Chq #{c.cheque_number}
                      </span>
                      {dueInfo && (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${dueInfo.color}`}>
                          {dueInfo.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-300">
                      {c.bank_name}{c.branch ? ` (${c.branch})` : ''}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                      Payee: <strong>{c.payee_or_drawer || c.supplier_name || 'N/A'}</strong>
                    </p>
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <span className="text-base font-black text-amber-600 dark:text-amber-400">
                      {fmtRs(c.amount)}
                    </span>
                    <button
                      onClick={() => handleUpdateChequeStatus(c.id!, 'CLEARED')}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Mark Cleared
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cheque KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Total Tracked Cheques
            </span>
            <span className="text-2xl font-black text-gray-900 dark:text-gray-100">
              {chequeMetrics.total}
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-amber-200 dark:border-amber-900/40 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-amber-500 uppercase tracking-wider block mb-1">
              Pending Cheques
            </span>
            <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {fmtRs(chequeMetrics.pendingTotal)}
            </span>
            <span className="text-xs text-gray-400 block mt-0.5">{chequeMetrics.pendingCount} cheques pending</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-rose-200 dark:border-rose-900/40 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-rose-500 uppercase tracking-wider block mb-1">
              Due in ≤ 7 Days / Overdue
            </span>
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {fmtRs(chequeMetrics.alertTotal)}
            </span>
            <span className="text-xs text-rose-500 font-bold block mt-0.5">{chequeMetrics.alertCount} cheques alert</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider block mb-1">
              Cleared Cheques
            </span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {fmtRs(chequeMetrics.clearedTotal)}
            </span>
            <span className="text-xs text-gray-400 block mt-0.5">{chequeMetrics.clearedCount} settled</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Cheque Filters & Search */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by cheque #, bank, payee, supplier..."
            value={chequeSearch}
            onChange={(e) => setChequeSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700/60 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={chequeFilterType}
            onChange={(e) => setChequeFilterType(e.target.value as any)}
            className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-200"
          >
            <option value="ALL">All Types</option>
            <option value="ISSUED_TO_SUPPLIER">Issued to Supplier</option>
            <option value="RECEIVED_FROM_CUSTOMER">Received from Customer</option>
          </select>

          <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
            {(['ALL', 'PENDING', 'CLEARED', 'BOUNCED'] as const).map(st => (
              <button
                key={st}
                onClick={() => setChequeFilterStatus(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  chequeFilterStatus === st
                    ? 'bg-white dark:bg-gray-800 text-amber-700 dark:text-amber-400 shadow-2xs'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                }`}
              >
                {st === 'ALL' ? 'All' : st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cheques List / Table */}
      {loadingCheques ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
        </div>
      ) : filteredCheques.length === 0 ? (
        <EmptyState
          icon={<Calendar className="w-12 h-12 text-gray-400" />}
          title="No Cheques Found"
          subtitle={chequeSearch ? 'No cheques match your search criteria.' : 'No post-dated cheques registered yet.'}
          action={
            <button
              onClick={() => setShowAddChequeModal(true)}
              className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Issue First Cheque
            </button>
          }
        />
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase tracking-wider font-bold">
                  <th className="py-3 px-4">Cheque Details</th>
                  <th className="py-3 px-4">Type & Payee</th>
                  <th className="py-3 px-4">Issue Date</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {filteredCheques.map(c => {
                  const dueInfo = getChequeDueStatus(c.due_date, c.status);
                  return (
                    <tr key={c.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-750/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-sm text-gray-900 dark:text-gray-100 block">
                          #{c.cheque_number}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400 text-[11px]">
                          {c.bank_name}{c.branch ? ` • ${c.branch}` : ''}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-bold text-gray-800 dark:text-gray-200 block truncate max-w-[180px]">
                          {c.payee_or_drawer || c.supplier_name || c.customer_name || 'N/A'}
                        </span>
                        <span className="text-[10px] text-gray-400 uppercase font-semibold">
                          {c.cheque_type === 'ISSUED_TO_SUPPLIER' ? 'Issued to Supplier' : 'From Customer'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-gray-600 dark:text-gray-400 font-medium">
                        {c.issue_date}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-gray-800 dark:text-gray-200">
                            {c.due_date}
                          </span>
                          {dueInfo && (
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border ${dueInfo.color}`}>
                              {dueInfo.label}
                            </span>
                          )}
                        </div>
                        {c.cleared_date && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block mt-0.5">
                            Cleared: {c.cleared_date}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <span className="font-black text-sm text-gray-900 dark:text-gray-100">
                          {fmtRs(c.amount)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                          c.status === 'CLEARED'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                            : c.status === 'BOUNCED'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-300 dark:border-rose-800'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                        }`}>
                          {c.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {c.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => handleUpdateChequeStatus(c.id!, 'CLEARED')}
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                title="Mark Cleared"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleUpdateChequeStatus(c.id!, 'BOUNCED')}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                title="Mark Bounced"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {(c.status === 'CLEARED' || c.status === 'BOUNCED') && (
                            <button
                              onClick={() => handleUpdateChequeStatus(c.id!, 'PENDING')}
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                            >
                              Reopen
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteCheque(c.id!)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                            title="Delete Record"
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
      )}
    </div>
  )}

  {/* Add / Issue Cheque Modal */}
  {showAddChequeModal && (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={() => setShowAddChequeModal(false)}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-wide">Record Post-Dated Cheque</h3>
              <p className="text-xs text-amber-100">Set due date alerts and track bank clearing</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddChequeModal(false)}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSaveCheque} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                Cheque Number *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 058291"
                value={chequeFormData.cheque_number}
                onChange={(e) => setChequeFormData({ ...chequeFormData, cheque_number: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-mono font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                Amount (Rs.) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={chequeFormData.amount}
                onChange={(e) => setChequeFormData({ ...chequeFormData, amount: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                Bank Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Commercial Bank"
                value={chequeFormData.bank_name}
                onChange={(e) => setChequeFormData({ ...chequeFormData, bank_name: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                Branch (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Avissawella"
                value={chequeFormData.branch}
                onChange={(e) => setChequeFormData({ ...chequeFormData, branch: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                Cheque Type
              </label>
              <select
                value={chequeFormData.cheque_type}
                onChange={(e) => setChequeFormData({ ...chequeFormData, cheque_type: e.target.value as any })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="ISSUED_TO_SUPPLIER">Issued to Supplier</option>
                <option value="RECEIVED_FROM_CUSTOMER">Received from Customer</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                Link Supplier (Optional)
              </label>
              <select
                value={chequeFormData.supplier_id}
                onChange={(e) => {
                  const supId = e.target.value;
                  const sup = suppliers.find(s => String(s.id) === supId);
                  setChequeFormData({
                    ...chequeFormData,
                    supplier_id: supId,
                    payee_or_drawer: sup ? sup.name : chequeFormData.payee_or_drawer,
                  });
                }}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">-- None / Custom Payee --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
              Payee / Drawer Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Sarasavi Publishers / Customer Name"
              value={chequeFormData.payee_or_drawer}
              onChange={(e) => setChequeFormData({ ...chequeFormData, payee_or_drawer: e.target.value })}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                Issue Date
              </label>
              <input
                type="date"
                value={chequeFormData.issue_date}
                onChange={(e) => setChequeFormData({ ...chequeFormData, issue_date: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                Due Date (Post-Dated) *
              </label>
              <input
                type="date"
                required
                value={chequeFormData.due_date}
                onChange={(e) => setChequeFormData({ ...chequeFormData, due_date: e.target.value })}
                className="w-full px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-xl text-sm font-bold text-amber-900 dark:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
              Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. For GRN-202611-002 book delivery"
              value={chequeFormData.notes}
              onChange={(e) => setChequeFormData({ ...chequeFormData, notes: e.target.value })}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="pt-3 flex gap-3">
            <button
              type="button"
              onClick={() => setShowAddChequeModal(false)}
              className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-sm transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingCheque}
              className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm shadow-md shadow-amber-600/25 transition-all cursor-pointer"
            >
              {savingCheque ? 'Saving...' : 'Save Cheque'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )}

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
                      {paymentMethod === 'CHEQUE' ? 'Cheque No. *' : 'Reference / Receipt No.'}
                    </label>
                    <input
                      type="text"
                      placeholder={paymentMethod === 'CHEQUE' ? 'e.g. 582910' : 'e.g. Tx #84910'}
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

                  {paymentMethod === 'CHEQUE' && (
                    <>
                      <div>
                        <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block mb-1">
                          Bank Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Commercial Bank"
                          value={paymentChequeBank}
                          onChange={(e) => setPaymentChequeBank(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block mb-1">
                          Cheque Due Date (Post-Dated)
                        </label>
                        <input
                          type="date"
                          value={paymentChequeDueDate}
                          onChange={(e) => setPaymentChequeDueDate(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl text-sm font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </>
                  )}

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
