import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  MapPin,
  FileText,
  AlertCircle,
  CheckCircle2,
  X,
  CreditCard,
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  Trash2,
  Edit,
  Receipt,
  UserCheck,
  Award,
  MessageSquare,
} from 'lucide-react';
import { db } from '../db';
import type { CreditCustomer, CreditLedgerEntry } from '../db';
import { useToast } from '../components/Toast';

export default function CreditCustomers() {
  const toast = useToast();
  const [customers, setCustomers] = useState<CreditCustomer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Selected customer & Ledger drawer
  const [selectedCustomer, setSelectedCustomer] = useState<CreditCustomer | null>(null);
  const [ledger, setLedger] = useState<CreditLedgerEntry[]>([]);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    credit_limit: '',
    notes: '',
  });

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const fetchCustomers = async () => {
    try {
      setIsLoading(true);
      const res = await db.credit.getCustomers();
      if (res.success && res.data) {
        setCustomers(res.data);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load credit customers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const openLedger = async (customer: CreditCustomer) => {
    setSelectedCustomer(customer);
    setIsLoadingLedger(true);
    try {
      const res = await db.credit.getCustomerLedger(customer.id);
      if (res.success && res.data) {
        setSelectedCustomer(res.data.customer);
        setLedger(res.data.ledger);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch customer transactions');
    } finally {
      setIsLoadingLedger(false);
    }
  };

  const sendWhatsAppReminder = async (customer: CreditCustomer, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const cleanPhone = customer.phone?.replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 9) {
      toast.warning(`Please add a valid phone number for ${customer.name} first.`);
      return;
    }
    if ((customer.total_outstanding || 0) <= 0) {
      toast.info(`${customer.name} has no outstanding balance due.`);
      return;
    }

    const today = new Date().toLocaleDateString('en-GB');
    const dueAmt = Number(customer.total_outstanding || 0).toFixed(2);
    const points = customer.loyalty_points || 0;

    const msg = `*Hiru Bookshop & Communication*\nManiyangama, Avissawella (Tel: 070200042)\n----------------------------------------\n*STATEMENT OF OUTSTANDING BALANCE*\nDate: ${today}\nCustomer: ${customer.name}\n\nDear Customer,\nThis is a friendly reminder regarding your credit account balance with us:\n\n*TOTAL OUTSTANDING DUE: Rs. ${dueAmt}*\n${points > 0 ? `Loyalty Points: ${points} pts\n` : ''}----------------------------------------\nPlease arrange settlement at your earliest convenience.\n\nThank you for shopping with us!\nHiru Bookshop & Communication`;

    try {
      await db.whatsapp.openChat(cleanPhone, msg);
      toast.success(`WhatsApp reminder opened for ${customer.name}!`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to open WhatsApp');
    }
  };

  const handleOpenAdd = () => {
    setIsEditing(false);
    setEditId(null);
    setFormData({ name: '', phone: '', address: '', credit_limit: '', notes: '' });
    setShowAddModal(true);
  };

  const handleOpenEdit = (customer: CreditCustomer, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditId(customer.id);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      credit_limit: customer.credit_limit ? String(customer.credit_limit) : '',
      notes: customer.notes || '',
    });
    setShowAddModal(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Customer name is required');
      return;
    }

    try {
      if (isEditing && editId) {
        const res = await db.credit.updateCustomer({
          id: editId,
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          address: formData.address.trim(),
          credit_limit: parseFloat(formData.credit_limit) || 0,
          notes: formData.notes.trim(),
        });
        if (!res.success) throw new Error(res.error);
        toast.success('Customer updated successfully');
      } else {
        const res = await db.credit.createCustomer({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          address: formData.address.trim(),
          credit_limit: parseFloat(formData.credit_limit) || 0,
          notes: formData.notes.trim(),
        });
        if (!res.success) throw new Error(res.error);
        toast.success('Credit customer added');
      }

      setShowAddModal(false);
      fetchCustomers();
      if (selectedCustomer && isEditing && editId === selectedCustomer.id) {
        openLedger({ ...selectedCustomer, ...formData, credit_limit: parseFloat(formData.credit_limit) || 0 });
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving customer');
    }
  };

  const handleDeleteCustomer = async (customer: CreditCustomer, e: React.MouseEvent) => {
    e.stopPropagation();
    if (customer.total_outstanding > 0) {
      toast.error(`Cannot delete! Customer has Rs. ${customer.total_outstanding.toFixed(2)} outstanding.`);
      return;
    }
    if (!confirm(`Are you sure you want to delete "${customer.name}"?`)) return;

    try {
      const res = await db.credit.deleteCustomer(customer.id);
      if (!res.success) throw new Error(res.error);
      toast.success('Customer deleted');
      if (selectedCustomer?.id === customer.id) {
        setSelectedCustomer(null);
      }
      fetchCustomers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete customer');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }

    try {
      setIsSubmittingPayment(true);
      const res = await db.credit.recordPayment(selectedCustomer.id, amount, paymentNotes.trim());
      if (!res.success) throw new Error(res.error);
      toast.success(`Payment of Rs. ${amount.toFixed(2)} recorded!`);
      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentNotes('');
      // Refresh current customer view & list
      await openLedger(selectedCustomer);
      fetchCustomers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record payment');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  const totalOutstandingAll = customers.reduce((sum, c) => sum + (c.total_outstanding || 0), 0);
  const customersWithDebt = customers.filter(c => (c.total_outstanding || 0) > 0).length;

  return (
    <div className="flex h-[calc(100vh-1rem)] gap-4 p-4 max-w-[1700px] mx-auto overflow-hidden">
      {/* Left List Pane */}
      <div className={`flex flex-col flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden ${selectedCustomer ? 'hidden md:flex' : 'flex'}`}>
        {/* Header Stats */}
        <div className="p-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2.5">
                <Users className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                Customer Book & Loyalty
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Manage credit accounts, loyalty reward points & bill collections
              </p>
            </div>

            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-xl text-sm font-bold shadow-md cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Customer
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-800">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Accounts</span>
              <p className="text-lg font-black text-gray-900 dark:text-gray-100 mt-0.5">{customers.length}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-800">
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Active Debtors</span>
              <p className="text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5">{customersWithDebt}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-800">
              <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Total Due Amount</span>
              <p className="text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5">Rs. {totalOutstandingAll.toFixed(2)}</p>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative mt-4">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search customer by name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Customer List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">Loading customers...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30 text-purple-400" />
              <p className="font-semibold text-gray-600 dark:text-gray-300">No credit customers found</p>
              <p className="text-xs text-gray-400 mt-1">Add your first credit customer to enable credit billing in POS.</p>
            </div>
          ) : (
            filteredCustomers.map((cust) => {
              const isSelected = selectedCustomer?.id === cust.id;
              const hasDue = (cust.total_outstanding || 0) > 0;
              const isOverLimit = cust.credit_limit > 0 && cust.total_outstanding > cust.credit_limit;

              return (
                <div
                  key={cust.id}
                  onClick={() => openLedger(cust)}
                  className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-600'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-gray-900 dark:text-gray-100 text-base truncate">
                        {cust.name}
                      </span>
                      {isOverLimit && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-300">
                          OVER LIMIT
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {cust.phone ? (
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="w-3.5 h-3.5" />
                          {cust.phone}
                        </span>
                      ) : (
                        <span className="italic text-gray-400">No phone</span>
                      )}
                      {cust.credit_limit > 0 && (
                        <span>Limit: Rs. {cust.credit_limit.toFixed(0)}</span>
                      )}
                      <span className="flex items-center gap-1 font-bold text-purple-600 dark:text-purple-400">
                        <Award className="w-3.5 h-3.5" />
                        {cust.loyalty_points || 0} pts
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0 flex items-center gap-2.5">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">Balance Due</span>
                      <span className={`text-base font-black ${
                        hasDue ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        Rs. {(cust.total_outstanding || 0).toFixed(2)}
                      </span>
                    </div>
                    {hasDue && cust.phone && (
                      <button
                        onClick={(e) => sendWhatsAppReminder(cust, e)}
                        className="p-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                        title="Send 1-Click WhatsApp Debt Reminder"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Drawer / Detail Pane */}
      {selectedCustomer ? (
        <div className="flex flex-col w-full md:w-[540px] lg:w-[600px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
          {/* Drawer Header */}
          <div className="p-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-gray-900 dark:text-gray-100">
                    {selectedCustomer.name}
                  </h2>
                  <button
                    onClick={(e) => handleOpenEdit(selectedCustomer, e)}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500"
                    title="Edit Customer"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteCustomer(selectedCustomer, e)}
                    className="p-1 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded text-rose-500"
                    title="Delete Customer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {selectedCustomer.phone && (
                    <span className="flex items-center gap-1 font-mono">
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      {selectedCustomer.phone}
                    </span>
                  )}
                  {selectedCustomer.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-gray-400" />
                      {selectedCustomer.address}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Account Status Card */}
            <div className="mt-4 p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider block">
                  Current Outstanding Due
                </span>
                <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
                  Rs. {(selectedCustomer.total_outstanding || 0).toFixed(2)}
                </span>
                <div className="flex items-center gap-3 mt-1">
                  {selectedCustomer.credit_limit > 0 && (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 block">
                      Limit: Rs. {selectedCustomer.credit_limit.toFixed(2)}
                    </span>
                  )}
                  <span className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1">
                    <Award className="w-3.5 h-3.5" />
                    {selectedCustomer.loyalty_points || 0} Points Available
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {(selectedCustomer.total_outstanding || 0) > 0 && selectedCustomer.phone && (
                  <button
                    onClick={() => sendWhatsAppReminder(selectedCustomer)}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                    title="Send WhatsApp Debt Reminder"
                  >
                    <MessageSquare className="w-4 h-4" />
                    WhatsApp
                  </button>
                )}
                <button
                  onClick={() => setShowPaymentModal(true)}
                  disabled={(selectedCustomer.total_outstanding || 0) <= 0}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-sm font-bold shadow-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                >
                  <DollarSign className="w-4 h-4" />
                  Settle / Pay
                </button>
              </div>
            </div>
          </div>

          {/* Ledger History */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-xs font-bold uppercase text-gray-500 tracking-wider mb-3">
              Transaction History (Credit Sales & Payments)
            </h3>

            {isLoadingLedger ? (
              <div className="p-8 text-center text-gray-400">Loading ledger...</div>
            ) : ledger.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No transaction records yet</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {ledger.map((entry) => {
                  const isSale = entry.payment_type === 'SALE';
                  return (
                    <div
                      key={entry.id}
                      className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/50 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isSale
                            ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'
                            : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {isSale ? (
                            <ArrowUpRight className="w-5 h-5" />
                          ) : (
                            <ArrowDownLeft className="w-5 h-5" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
                              {isSale ? 'Credit Sale' : 'Payment Received'}
                            </span>
                            {entry.receipt_no && (
                              <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">
                                {entry.receipt_no}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-400 dark:text-gray-400 mt-0.5">
                            {new Date(entry.created_at).toLocaleString()}
                            {entry.notes && ` • ${entry.notes}`}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={`text-sm font-black ${
                          isSale ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {isSale ? '+' : '-'} Rs. {entry.amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-col items-center justify-center flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 text-center text-gray-400">
          <UserCheck className="w-16 h-16 mb-3 text-purple-400 opacity-40" />
          <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300">Select a Customer Account</h3>
          <p className="text-xs text-gray-400 max-w-sm mt-1">
            Click on any credit customer from the left list to review their statement, past invoices, and record debt payments.
          </p>
        </div>
      )}

      {/* Add / Edit Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-black text-gray-900 dark:text-gray-100">
                {isEditing ? 'Edit Customer' : 'Add Credit Customer'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-4 mt-4">
              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kamal Perera"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 0771234567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                  Address / Location
                </label>
                <input
                  type="text"
                  placeholder="e.g. Maniyangama, Avissawella"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                  Credit Limit (Rs.)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 5000 (0 for unlimited)"
                  value={formData.credit_limit}
                  onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional customer details..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3.5 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-bold text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm shadow-md"
                >
                  {isEditing ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-black text-gray-900 dark:text-gray-100">
                Record Payment
              </h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-center">
              <span className="text-xs text-gray-400">Total Outstanding for {selectedCustomer.name}:</span>
              <p className="text-xl font-black text-rose-600 dark:text-rose-400">
                Rs. {(selectedCustomer.total_outstanding || 0).toFixed(2)}
              </p>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                  Amount Received (Rs.) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  autoFocus
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl text-lg font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setPaymentAmount(String(selectedCustomer.total_outstanding || 0))}
                  className="mt-1 text-xs text-purple-600 dark:text-purple-400 font-bold hover:underline"
                >
                  Pay full amount (Rs. {(selectedCustomer.total_outstanding || 0).toFixed(2)})
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                  Payment Notes / Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paid in Cash / Check #123"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-bold text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md disabled:opacity-50"
                >
                  {isSubmittingPayment ? 'Saving...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
