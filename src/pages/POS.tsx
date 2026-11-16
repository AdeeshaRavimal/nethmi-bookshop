import { useState, useRef, useEffect } from 'react';
import { db } from '../db';
import type { CreditCustomer } from '../db';
import { Search, Plus, Minus, Trash2, CreditCard, Banknote, Printer, Keyboard, X, Coins, Check, Users, UserPlus, Clock, MessageSquare, Award, Copy, RotateCcw, Undo2 } from 'lucide-react';
import { calculateCartTotals, clampCartQuantity } from '../utils/checkout';
import { useToast } from '../components/Toast';
import { printReceipt, buildWhatsAppReceiptText, printReturnReceipt, type ReturnReceiptData } from '../utils/receipt';
import type { ReceiptData } from '../utils/receipt';

import { addCartItem, type CartItem } from '../utils/cart';

const SHORTCUTS = [
  { keys: 'Enter', desc: 'Scan / add highlighted item' },
  { keys: '+ or F1', desc: 'Cash Payment & Change Calculator' },
  { keys: '- or F2', desc: 'Checkout with Card (Single Key "-", no Fn needed)' },
  { keys: '↑ / ↓', desc: 'Navigate search results' },
  { keys: '?', desc: 'Show this shortcuts panel' },
  { keys: 'Esc', desc: 'Close dialogs / cancel' },
];

export default function POS() {
  const toast = useToast();
  const [cart, setCart] = useState<CartItem[]>([]);
  const checkoutPending = useRef(false);
  const checkoutRequestId = useRef<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [lastSale, setLastSale] = useState<any>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [discountType, setDiscountType] = useState<'AMOUNT' | 'PERCENT'>('AMOUNT');
  const [discountInput, setDiscountInput] = useState<string>('');
  const [itemDiscountSettings, setItemDiscountSettings] = useState<Record<string, { mode: '%' | 'Rs'; text: string }>>({});

  // Cash Payment & Change Modal state
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashReceived, setCashReceived] = useState<string>('');
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(true);
  const [changeBanner, setChangeBanner] = useState<{
    receiptNo: string;
    total: number;
    tendered: number;
    change: number;
    customerName?: string;
    customerPhone?: string;
    receiptData?: ReceiptData;
  } | null>(null);
  const cashInputRef = useRef<HTMLInputElement>(null);

  // Credit Customer Modal state
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditSearch, setCreditSearch] = useState('');
  const [creditCustomers, setCreditCustomers] = useState<CreditCustomer[]>([]);
  const [selectedCreditCustomer, setSelectedCreditCustomer] = useState<CreditCustomer | null>(null);
  const [isCreatingCreditCustomer, setIsCreatingCreditCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerLimit, setNewCustomerLimit] = useState('');
  const [isSubmittingCredit, setIsSubmittingCredit] = useState(false);
  const creditSearchInputRef = useRef<HTMLInputElement>(null);

  // Attached Customer for Loyalty & WhatsApp E-Bill
  const [attachedCustomer, setAttachedCustomer] = useState<CreditCustomer | null>(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customerPickerSearch, setCustomerPickerSearch] = useState('');
  const [redeemPoints, setRedeemPoints] = useState(false);
  const [isRegisteringLoyalty, setIsRegisteringLoyalty] = useState(false);
  const [loyaltyRegName, setLoyaltyRegName] = useState('');
  const [loyaltyRegPhone, setLoyaltyRegPhone] = useState('');
  const [loyaltyRegAddress, setLoyaltyRegAddress] = useState('');
  const [isSubmittingLoyalty, setIsSubmittingLoyalty] = useState(false);

  // E-Bill WhatsApp Modal state
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsAppPhone, setWhatsAppPhone] = useState('');
  const [whatsAppReceiptData, setWhatsAppReceiptData] = useState<ReceiptData | null>(null);

  // Item Return & Exchange Modal state
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReceiptSearch, setReturnReceiptSearch] = useState('');
  const [searchingReturnSale, setSearchingReturnSale] = useState(false);
  const [returnSale, setReturnSale] = useState<any | null>(null);
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

  const handleSearchReturnReceipt = async (explicitTerm?: string) => {
    const term = (explicitTerm ?? returnReceiptSearch).trim();
    if (!term) {
      toast.error('Please enter a receipt number');
      return;
    }
    setSearchingReturnSale(true);
    try {
      const salesRes = await db.sales.search(term, 10, 0);
      const matches = salesRes.data ?? [];
      const exact = matches.find((s: any) => s.receipt_no.toLowerCase() === term.toLowerCase()) || matches[0];
      if (!exact) {
        toast.error(`No sale found matching "${term}"`);
        setReturnSale(null);
        setReturnItems([]);
        return;
      }

      const [itemsRes, prevReturnsRes] = await Promise.all([
        db.saleItems.getBySale(exact.id),
        db.returns.getByReceipt(exact.receipt_no),
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

      setReturnSale(exact);
      setReturnItems(loadedItems);
      if (exact.payment_type === 'CREDIT') {
        setReturnRefundMethod('CREDIT');
      } else {
        setReturnRefundMethod('CASH');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to search receipt');
    } finally {
      setSearchingReturnSale(false);
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
      toast.success(`Return voucher ${voucherData.return_no} processed! Restocked items to shelves.`, 'Return Completed');

      if (returnRefundMethod === 'EXCHANGE') {
        toast.info(`Rs. ${totalRefund.toFixed(2)} exchange credit recorded for customer.`);
      }

      await handleSearchReturnReceipt();
    } catch (err: any) {
      toast.error(err.message || 'Failed to process return');
    } finally {
      setIsProcessingReturn(false);
    }
  };

  // Live Clock state
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSearchResults = async (term: string) => {
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await db.inventory.search(term);
      setSearchResults(res.data ?? []);
    } catch (e) {
      console.error(e);
    }
  };

  // Debounced search to prevent rapid IPC queries on every keystroke
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      fetchSearchResults(searchTerm);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchLastSale = async () => {
    try {
      const res = await db.sales.getRecent(1);
      const sale = res.data?.[0];
      if (!sale) { setLastSale(null); return; }
      const itemsRes = await db.saleItems.getBySale(sale.id!);
      const billDiscount = sale.bill_discount ?? 0;
      setLastSale({
        ...sale,
        items: itemsRes.data ?? [],
        bill_discount: billDiscount,
        subtotal: sale.total_amount + billDiscount,
      });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchLastSale();
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setIsDropdownOpen(true);
    setSelectedIndex(-1);
  };

  const isServiceItem = (item: any) =>
    item?.category === 'SERVICE' || item?.barcode?.startsWith('SRV-');

  const selectItem = (item: any) => {
    const isService = isServiceItem(item);
    if (!isService && item.quantity <= 0) {
      toast.warning('This item is out of stock!');
    } else {
      const discount = item.discount_percent || 0;
      const finalPrice = item.selling_price * (1 - discount / 100);

      addToCart({
        id: item.id!,
        category: item.category,
        barcode: item.barcode,
        title: item.title,
        selling_price: finalPrice,
        cost_price: item.cost_price,
        quantity: 1,
        stock_limit: isService ? 999999 : item.quantity,
        discount_percent: discount,
        original_price: item.selling_price,
        catalog_price: item.selling_price,
        is_special_discount: discount > 0,
      });
    }
    setSearchTerm('');
    setIsDropdownOpen(false);
    setSelectedIndex(-1);
  };

  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Single-key shortcuts when search input is empty (No Fn key required)
    if (!searchTerm.trim()) {
      if (e.key === '+' || e.key === 'Add' || e.key === 'End') {
        e.preventDefault();
        if (cart.length > 0) openCashModal();
        return;
      }
      if (e.key === '-' || e.key === 'Subtract' || e.key === 'Home') {
        e.preventDefault();
        if (cart.length > 0) handleCheckout('CARD');
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      if (!searchResults || searchResults.length === 0) return;
      e.preventDefault();
      setSelectedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      if (!searchResults || searchResults.length === 0) return;
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const term = searchTerm.trim();
      if (!term) return;

      // 1. If dropdown item was selected using arrow keys
      if (selectedIndex >= 0 && searchResults && selectedIndex < searchResults.length) {
        selectItem(searchResults[selectedIndex]);
        return;
      }

      // 2. Immediate direct barcode lookup via inventory search
      try {
        const res = await db.inventory.search(term);
        const directMatch = (res.data ?? []).find((i: any) => i.barcode === term);
        if (directMatch) {
          selectItem(directMatch);
          return;
        }
      } catch (err) {
        console.error('Barcode lookup error', err);
      }

      // 3. Fallback to existing search results
      if (searchResults && searchResults.length > 0) {
        const exactMatch = searchResults.find(i => i.barcode === term);
        selectItem(exactMatch || searchResults[0]);
      }
    }
  };

  const addToCart = (item: Omit<CartItem, 'lineId'>) => {
    if (checkoutPending.current) return;
    checkoutRequestId.current = null;
    setCart(prev => addCartItem(prev, item));
  };

  const [itemQtyInputs, setItemQtyInputs] = useState<Record<string, string>>({});

  const updateQuantity = (id: string, delta: number) => {
    if (checkoutPending.current) return;
    checkoutRequestId.current = null;
    setCart(prev => prev.map(i => {
      if (i.lineId === id) {
        const newQty = clampCartQuantity(i.quantity, delta, i.stock_limit);
        setItemQtyInputs(q => ({ ...q, [id]: String(newQty) }));
        const origPrice = i.original_price ?? i.selling_price;
        const currentMode = itemDiscountSettings[id]?.mode ?? (i.discount_percent && i.discount_percent > 0 ? '%' : 'Rs');
        const discountText = itemDiscountSettings[id]?.text;
        const val = parseFloat(discountText || '');

        let finalSellingPrice = origPrice;
        let discountPercent = 0;

        if (!isNaN(val) && val > 0 && newQty > 0) {
          const lineOrigTotal = origPrice * newQty;
          if (currentMode === '%') {
            discountPercent = Math.min(100, Math.max(0, val));
            finalSellingPrice = Math.round(origPrice * (1 - discountPercent / 100) * 100) / 100;
          } else {
            // Rs discount is the total discount for the whole item line (not per quantity)
            const totalLineDiscount = Math.min(lineOrigTotal, Math.max(0, val));
            discountPercent = Math.round(((totalLineDiscount / lineOrigTotal) * 100) * 100) / 100;
            const finalLineTotal = lineOrigTotal - totalLineDiscount;
            finalSellingPrice = Math.round((finalLineTotal / newQty) * 100) / 100;
          }
        } else if (!discountText && (i.discount_percent ?? 0) > 0) {
          discountPercent = i.discount_percent ?? 0;
          finalSellingPrice = Math.round(origPrice * (1 - discountPercent / 100) * 100) / 100;
        }

        return { ...i, quantity: newQty, selling_price: finalSellingPrice, discount_percent: discountPercent };
      }
      return i;
    }));
  };

  const handleQuantityInputChange = (id: string, rawVal: string) => {
    if (checkoutPending.current) return;
    checkoutRequestId.current = null;
    setItemQtyInputs(prev => ({ ...prev, [id]: rawVal }));

    const val = parseInt(rawVal, 10);
    if (isNaN(val) || val <= 0) return;

    setCart(prev => prev.map(i => {
      if (i.lineId === id) {
        const targetQty = Math.max(1, Math.min(val, i.stock_limit));
        const origPrice = i.original_price ?? i.selling_price;
        const currentMode = itemDiscountSettings[id]?.mode ?? (i.discount_percent && i.discount_percent > 0 ? '%' : 'Rs');
        const discountText = itemDiscountSettings[id]?.text;
        const discVal = parseFloat(discountText || '');

        let finalSellingPrice = origPrice;
        let discountPercent = 0;

        if (!isNaN(discVal) && discVal > 0 && targetQty > 0) {
          const lineOrigTotal = origPrice * targetQty;
          if (currentMode === '%') {
            discountPercent = Math.min(100, Math.max(0, discVal));
            finalSellingPrice = Math.round(origPrice * (1 - discountPercent / 100) * 100) / 100;
          } else {
            const totalLineDiscount = Math.min(lineOrigTotal, Math.max(0, discVal));
            discountPercent = Math.round(((totalLineDiscount / lineOrigTotal) * 100) * 100) / 100;
            const finalLineTotal = lineOrigTotal - totalLineDiscount;
            finalSellingPrice = Math.round((finalLineTotal / targetQty) * 100) / 100;
          }
        } else if (!discountText && (i.discount_percent ?? 0) > 0) {
          discountPercent = i.discount_percent ?? 0;
          finalSellingPrice = Math.round(origPrice * (1 - discountPercent / 100) * 100) / 100;
        }

        return { ...i, quantity: targetQty, selling_price: finalSellingPrice, discount_percent: discountPercent };
      }
      return i;
    }));
  };

  const handleQuantityBlur = (id: string) => {
    const item = cart.find(i => i.lineId === id);
    if (!item) return;
    const raw = itemQtyInputs[id];
    if (raw === undefined || raw.trim() === '' || isNaN(parseInt(raw, 10)) || parseInt(raw, 10) <= 0) {
      setItemQtyInputs(prev => ({ ...prev, [id]: String(item.quantity) }));
    } else {
      setItemQtyInputs(prev => ({ ...prev, [id]: String(item.quantity) }));
    }
  };

  const [itemPriceInputs, setItemPriceInputs] = useState<Record<string, string>>({});

  const handleSellingPriceChange = (lineId: string, rawVal: string) => {
    if (checkoutPending.current) return;
    checkoutRequestId.current = null;
    setItemPriceInputs(prev => ({ ...prev, [lineId]: rawVal }));

    const val = parseFloat(rawVal);
    if (isNaN(val) || val < 0) return;

    setCart(prev => prev.map(item => {
      if (item.lineId !== lineId) return item;
      const catalogPrice = item.catalog_price ?? item.original_price ?? item.selling_price;
      const newPrice = Math.round(val * 100) / 100;

      if (newPrice < catalogPrice) {
        // Price reduced below usual price -> Special Discount
        const discountPercent = catalogPrice > 0
          ? Math.round(((catalogPrice - newPrice) / catalogPrice) * 100 * 100) / 100
          : 0;
        return {
          ...item,
          catalog_price: catalogPrice,
          original_price: catalogPrice,
          selling_price: newPrice,
          discount_percent: discountPercent,
          is_special_discount: true,
        };
      } else {
        // Price equal or higher than usual price -> Keep new price on bill, no discount
        return {
          ...item,
          catalog_price: catalogPrice,
          original_price: newPrice,
          selling_price: newPrice,
          discount_percent: 0,
          is_special_discount: false,
        };
      }
    }));
  };

  const handleSellingPriceBlur = (lineId: string) => {
    const item = cart.find(i => i.lineId === lineId);
    if (!item) return;
    const raw = itemPriceInputs[lineId];
    if (raw === undefined || raw.trim() === '' || isNaN(parseFloat(raw))) {
      setItemPriceInputs(prev => ({ ...prev, [lineId]: String(item.selling_price) }));
    }
  };

  const removeItem = (id: string) => {
    if (checkoutPending.current) return;
    checkoutRequestId.current = null;
    setCart(prev => prev.filter(i => i.lineId !== id));
    setItemDiscountSettings(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setItemPriceInputs(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setItemQtyInputs(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const getItemDiscountMode = (item: CartItem): '%' | 'Rs' => {
    return itemDiscountSettings[item.lineId]?.mode ?? (item.discount_percent && item.discount_percent > 0 ? '%' : 'Rs');
  };

  const getItemDiscountValue = (item: CartItem): string => {
    if (itemDiscountSettings[item.lineId]) {
      return itemDiscountSettings[item.lineId].text;
    }
    return item.discount_percent && item.discount_percent > 0 ? String(item.discount_percent) : '';
  };

  const handleItemDiscountChange = (lineId: string, rawText: string) => {
    if (checkoutPending.current) return;
    checkoutRequestId.current = null;

    setCart(prev => prev.map(item => {
      if (item.lineId !== lineId) return item;
      const currentMode = itemDiscountSettings[lineId]?.mode ?? (item.discount_percent && item.discount_percent > 0 ? '%' : 'Rs');
      const origPrice = item.original_price ?? item.selling_price;
      const qty = Math.max(1, item.quantity);
      const lineOrigTotal = origPrice * qty;
      const val = parseFloat(rawText);

      let discountPercent = 0;
      let finalSellingPrice = origPrice;

      if (!isNaN(val) && val > 0 && lineOrigTotal > 0) {
        if (currentMode === '%') {
          discountPercent = Math.min(100, Math.max(0, val));
          finalSellingPrice = Math.round(origPrice * (1 - discountPercent / 100) * 100) / 100;
        } else {
          // Total discount for this whole item line (not multiplied by each quantity)
          const totalLineDiscount = Math.min(lineOrigTotal, Math.max(0, val));
          discountPercent = Math.round(((totalLineDiscount / lineOrigTotal) * 100) * 100) / 100;
          const finalLineTotal = lineOrigTotal - totalLineDiscount;
          finalSellingPrice = Math.round((finalLineTotal / qty) * 100) / 100;
        }
      }

      return {
        ...item,
        original_price: origPrice,
        discount_percent: discountPercent,
        selling_price: finalSellingPrice,
      };
    }));

    setItemDiscountSettings(prev => ({
      ...prev,
      [lineId]: {
        mode: prev[lineId]?.mode ?? (prev[lineId]?.text ? prev[lineId].mode : 'Rs'),
        text: rawText,
      },
    }));
  };

  const toggleItemDiscountMode = (lineId: string, newMode: '%' | 'Rs') => {
    if (checkoutPending.current) return;
    checkoutRequestId.current = null;

    const item = cart.find(i => i.lineId === lineId);
    if (!item) return;

    const origPrice = item.original_price ?? item.selling_price;
    const qty = Math.max(1, item.quantity);
    let newText = '';

    if (item.discount_percent && item.discount_percent > 0) {
      if (newMode === 'Rs') {
        const totalDiscountAmt = Math.round((((origPrice * qty) * item.discount_percent) / 100) * 100) / 100;
        newText = String(totalDiscountAmt);
      } else {
        newText = String(item.discount_percent);
      }
    }

    setItemDiscountSettings(prev => ({
      ...prev,
      [lineId]: {
        mode: newMode,
        text: newText,
      },
    }));
  };

  const { totalAmount: subtotal, totalCost, grossProfit: baseProfit } = calculateCartTotals(cart);

  const originalSubtotal = cart.reduce((sum, item) => sum + ((item.original_price ?? item.selling_price) * item.quantity), 0);
  const totalItemDiscounts = Math.max(0, Math.round((originalSubtotal - subtotal) * 100) / 100);

  const parsedDiscount = parseFloat(discountInput) || 0;
  let billDiscount = 0;
  if (parsedDiscount > 0 && subtotal > 0) {
    if (discountType === 'PERCENT') {
      const pct = Math.min(100, Math.max(0, parsedDiscount));
      billDiscount = Math.round(((subtotal * pct) / 100) * 100) / 100;
    } else {
      billDiscount = Math.min(subtotal, Math.round(parsedDiscount * 100) / 100);
    }
  }

  const netTotal = Math.max(0, Math.round((subtotal - billDiscount) * 100) / 100);
  const netProfit = Math.round((netTotal - totalCost) * 100) / 100;

  const openCashModal = () => {
    if (cart.length === 0 || isCheckingOut) return;
    setCashReceived('');
    setShowCashModal(true);
  };

  const getQuickNotes = (total: number) => {
    const notes = [100, 500, 1000, 2000, 5000];
    const candidates = new Set<number>();
    const nextHundred = Math.ceil(total / 100) * 100;
    if (nextHundred > total) candidates.add(nextHundred);
    for (const n of notes) {
      if (n >= total && candidates.size < 4) candidates.add(n);
    }
    return Array.from(candidates);
  };

  useEffect(() => {
    if (showCashModal) {
      const timer = setTimeout(() => {
        cashInputRef.current?.focus();
        cashInputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [showCashModal]);

  const openCreditModal = async () => {
    setShowCreditModal(true);
    setCreditSearch('');
    setSelectedCreditCustomer(null);
    setIsCreatingCreditCustomer(false);
    setNewCustomerName('');
    setNewCustomerPhone('');
    setNewCustomerLimit('');
    try {
      const res = await db.credit.getCustomers();
      if (res.success && res.data) {
        setCreditCustomers(res.data);
      }
    } catch (e) {
      console.error(e);
    }
    setTimeout(() => {
      creditSearchInputRef.current?.focus();
    }, 50);
  };

  const handleQuickCreateCreditCustomer = async () => {
    if (!newCustomerName.trim()) {
      toast.error('Customer name is required');
      return;
    }
    try {
      setIsSubmittingCredit(true);
      const res = await db.credit.createCustomer({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim(),
        credit_limit: parseFloat(newCustomerLimit) || 0,
      });
      if (!res.success || !res.id) throw new Error(res.error || 'Failed to create customer');
      const newCust: CreditCustomer = {
        id: res.id,
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim(),
        address: '',
        credit_limit: parseFloat(newCustomerLimit) || 0,
        total_outstanding: 0,
        notes: '',
        created_at: new Date().toISOString(),
      };
      setSelectedCreditCustomer(newCust);
      setIsCreatingCreditCustomer(false);
      // Refresh customer list
      const listRes = await db.credit.getCustomers();
      if (listRes.success && listRes.data) setCreditCustomers(listRes.data);
      toast.success(`Customer ${newCust.name} added!`);
    } catch (err: any) {
      toast.error(err.message || 'Error creating customer');
    } finally {
      setIsSubmittingCredit(false);
    }
  };

  const handleRegisterLoyaltyCustomer = async () => {
    if (!loyaltyRegName.trim()) {
      toast.error('Customer name is required');
      return;
    }
    try {
      setIsSubmittingLoyalty(true);
      const res = await db.credit.createCustomer({
        name: loyaltyRegName.trim(),
        phone: loyaltyRegPhone.trim(),
        address: loyaltyRegAddress.trim(),
        credit_limit: 0,
      });
      if (!res.success || !res.id) throw new Error(res.error || 'Failed to create customer');

      const newCust: CreditCustomer = {
        id: res.id,
        name: loyaltyRegName.trim(),
        phone: loyaltyRegPhone.trim(),
        address: loyaltyRegAddress.trim(),
        credit_limit: 0,
        total_outstanding: 0,
        loyalty_points: 0,
        notes: '',
        created_at: new Date().toISOString(),
      };

      setAttachedCustomer(newCust);
      setIsRegisteringLoyalty(false);
      setLoyaltyRegName('');
      setLoyaltyRegPhone('');
      setLoyaltyRegAddress('');
      setShowCustomerPicker(false);

      const listRes = await db.credit.getCustomers();
      if (listRes.success && listRes.data) setCreditCustomers(listRes.data);

      toast.success(`Loyalty customer "${newCust.name}" registered & attached to bill!`);
    } catch (err: any) {
      toast.error(err.message || 'Error registering loyalty customer');
    } finally {
      setIsSubmittingLoyalty(false);
    }
  };

  const handleCheckout = async (
    method: string,
    tenderedAmount?: number,
    shouldPrint: boolean = true,
    creditCustomer?: CreditCustomer | null,
    sendWhatsApp: boolean = false
  ) => {
    if (cart.length === 0 || checkoutPending.current) return;
    checkoutPending.current = true;
    setIsCheckingOut(true);
    checkoutRequestId.current ??= crypto.randomUUID();

    const now = new Date().toISOString();
    const finalCart = [...cart];
    const finalSubtotal = originalSubtotal;
    const finalBillDiscount = billDiscount;
    const finalNetTotal = netTotal;
    const finalTotalCost = totalCost;
    const finalNetProfit = netProfit;

    const activeCustomer = creditCustomer || attachedCustomer;
    const pointsToRedeem = redeemPoints && activeCustomer ? Math.min(activeCustomer.loyalty_points || 0, Math.floor(finalNetTotal)) : 0;
    const adjustedNetTotal = Math.max(0, finalNetTotal - pointsToRedeem);

    try {
      const res = await db.executeCheckout({
        requestId: checkoutRequestId.current,
        totalAmount: adjustedNetTotal,
        totalCost: finalTotalCost,
        grossProfit: finalNetProfit - pointsToRedeem,
        paymentType: method,
        createdAt: now,
        items: finalCart,
        billDiscount: finalBillDiscount + pointsToRedeem,
        customerId: activeCustomer?.id,
        pointsToRedeem,
      });

      if (!res.success) {
        checkoutRequestId.current = null;
        throw new Error(res.error || 'Checkout transaction failed');
      }

      const receiptNo = res.receiptNo || 'REC-?';
      const actualTendered = method === 'CASH' && tenderedAmount != null && tenderedAmount > 0
        ? tenderedAmount
        : adjustedNetTotal;
      const actualChange = Math.max(0, Math.round((actualTendered - adjustedNetTotal) * 100) / 100);

      const pointsEarned = res.pointsEarned ?? Math.floor(adjustedNetTotal / 100);
      const pointsBalance = activeCustomer
        ? (activeCustomer.loyalty_points || 0) - pointsToRedeem + pointsEarned
        : undefined;

      const creditDueAmount = (res as any)?.creditBalance != null
        ? (res as any).creditBalance
        : (method === 'CREDIT'
            ? ((activeCustomer?.total_outstanding || 0) + adjustedNetTotal)
            : (activeCustomer?.total_outstanding && activeCustomer.total_outstanding > 0 ? activeCustomer.total_outstanding : undefined));

      const receiptPayload: ReceiptData = {
        receipt_no: receiptNo,
        created_at: now,
        payment_type: method,
        total_amount: adjustedNetTotal,
        items: finalCart.map(item => ({
          title: item.title,
          quantity: item.quantity,
          unit_price: item.selling_price,
          discount_percent: item.discount_percent,
          original_price: item.original_price,
          is_special_discount: item.is_special_discount,
        })),
        bill_discount: finalBillDiscount + pointsToRedeem,
        subtotal: finalSubtotal,
        cash_tendered: actualTendered,
        change_amount: actualChange,
        customer_name: activeCustomer?.name,
        customer_phone: activeCustomer?.phone,
        points_earned: pointsEarned,
        points_balance: pointsBalance,
        credit_due_amount: creditDueAmount,
      };

      if (method === 'CASH') {
        setChangeBanner({
          receiptNo,
          total: adjustedNetTotal,
          tendered: actualTendered,
          change: actualChange,
          customerName: activeCustomer?.name,
          customerPhone: activeCustomer?.phone,
          receiptData: receiptPayload,
        });
      } else {
        setChangeBanner(null);
      }

      if (method === 'CREDIT' && creditCustomer) {
        const newBalance = (creditCustomer.total_outstanding || 0) + adjustedNetTotal;
        toast.success(
          `Credit Sale to ${creditCustomer.name} (Due: Rs.${newBalance.toFixed(2)}) • Receipt ${receiptNo}`,
          'Credit Bill Recorded'
        );
      } else {
        toast.success(
          `Receipt ${receiptNo} • ${method} • Rs.${adjustedNetTotal.toFixed(2)}${actualChange > 0 ? ` (Change: Rs.${actualChange.toFixed(2)})` : ''}`,
          'Sale completed'
        );
      }

      if (shouldPrint) {
        printReceipt(receiptPayload);
      }

      // 1-Click WhatsApp E-Bill Send
      if (sendWhatsApp && activeCustomer?.phone) {
        const msg = buildWhatsAppReceiptText(receiptPayload);
        await db.whatsapp.openChat(activeCustomer.phone.trim(), msg);
        toast.success(`WhatsApp opened for ${activeCustomer.name || activeCustomer.phone}!`);
      } else if (activeCustomer?.phone) {
        setWhatsAppReceiptData(receiptPayload);
        setWhatsAppPhone(activeCustomer.phone);
      }

      setCart([]);
      setDiscountInput('');
      setItemDiscountSettings({});
      setShowCashModal(false);
      setShowCreditModal(false);
      setSelectedCreditCustomer(null);
      setAttachedCustomer(null);
      setRedeemPoints(false);
      setCashReceived('');
      fetchLastSale();
      setSearchTerm('');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Database error', 'Checkout failed');
    } finally {
      checkoutPending.current = false;
      setIsCheckingOut(false);
    }
  };

  const handleOpenWhatsAppFromLast = async () => {
    if (!lastSale) {
      toast.info('No previous receipts found.');
      return;
    }
    const receiptPayload: ReceiptData = {
      receipt_no: lastSale.receipt_no,
      created_at: lastSale.created_at,
      payment_type: lastSale.payment_type,
      total_amount: lastSale.total_amount,
      items: (lastSale.items || []).map((i: any) => ({
        title: i.title,
        quantity: i.quantity,
        unit_price: Number(i.unit_price ?? i.selling_price ?? 0),
        discount_percent: i.discount_percent,
        original_price: i.original_price,
      })),
      bill_discount: lastSale.bill_discount ?? 0,
      subtotal: lastSale.subtotal ?? ((lastSale.total_amount ?? 0) + (lastSale.bill_discount ?? 0)),
      customer_name: lastSale.customer_name,
      customer_phone: lastSale.customer_phone,
      points_earned: lastSale.points_earned,
      points_balance: lastSale.points_balance,
      credit_due_amount: lastSale.customer_total_outstanding ?? lastSale.credit_due_amount,
    };

    const targetPhone = (lastSale.customer_phone || '').trim();
    if (targetPhone) {
      // 1-Click Direct Send! No popup modal needed when customer phone is attached.
      const msg = buildWhatsAppReceiptText(receiptPayload);
      await db.whatsapp.openChat(targetPhone, msg);
      toast.success(`WhatsApp opened for ${lastSale.customer_name || targetPhone}!`);
      return;
    }

    // Fallback: If no phone was attached to sale, open modal to input phone
    setWhatsAppReceiptData(receiptPayload);
    setWhatsAppPhone('');
    setShowWhatsAppModal(true);
  };

  const handleSendWhatsApp = async () => {
    if (!whatsAppPhone.trim()) {
      toast.error('Please enter customer WhatsApp phone number');
      return;
    }
    if (!whatsAppReceiptData) return;

    const msg = buildWhatsAppReceiptText(whatsAppReceiptData);
    await db.whatsapp.openChat(whatsAppPhone.trim(), msg);
    toast.success('WhatsApp opened with receipt text!');
    setShowWhatsAppModal(false);
  };

  const handlePrintLastReceipt = () => {
    if (!lastSale) {
      toast.info('No previous receipts found.');
      return;
    }
    printReceipt({
      receipt_no: lastSale.receipt_no,
      created_at: lastSale.created_at,
      payment_type: lastSale.payment_type,
      total_amount: lastSale.total_amount,
      items: lastSale.items || [],
      bill_discount: lastSale.bill_discount ?? 0,
      subtotal: lastSale.subtotal ?? ((lastSale.total_amount ?? 0) + (lastSale.bill_discount ?? 0)),
      customer_name: lastSale.customer_name,
      customer_phone: lastSale.customer_phone,
      credit_due_amount: lastSale.customer_total_outstanding ?? lastSale.credit_due_amount,
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      if (showCashModal) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowCashModal(false);
        }
        return;
      }

      // Checkout shortcuts
      if (e.key === 'F1' || (!isInput && (e.key === '+' || e.key === 'Add' || e.key === 'End'))) {
        e.preventDefault();
        if (cart.length > 0) openCashModal();
      } else if (e.key === 'F2' || (!isInput && (e.key === '-' || e.key === 'Subtract' || e.key === 'Home'))) {
        e.preventDefault();
        if (cart.length > 0) handleCheckout('CARD');
      } else if (e.key === '?' && !showShortcuts) {
        if (!isInput) {
          e.preventDefault();
          setShowShortcuts(true);
        }
      } else if (e.key === 'Escape') {
        if (showShortcuts) setShowShortcuts(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, handleCheckout, showShortcuts, showCashModal]);

  return (
    <>
      {/* POS UI - This section is completely hidden when printing */}
      <div className="flex h-full bg-gray-100 dark:bg-gray-900 p-6 gap-6 print:hidden">

        {/* Left Panel: Search & Cart */}
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-visible z-10">

          {/* Change to Return Banner (Persistent until dismissed or next sale) */}
          {changeBanner && (
            <div className="bg-emerald-600 text-white px-5 py-3.5 flex items-center justify-between border-b border-emerald-700 animate-in slide-in-from-top duration-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Coins className="w-5 h-5 text-white" />
                </div>
                <div>
                  <span className="text-[11px] uppercase font-black text-emerald-100 tracking-wider">
                    Receipt #{changeBanner.receiptNo} Completed
                  </span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                    <span className="text-xs text-emerald-100">
                      Paid: <strong>Rs. {changeBanner.tendered.toFixed(2)}</strong> (Total: Rs. {changeBanner.total.toFixed(2)})
                    </span>
                    <span className="text-xs font-bold text-emerald-300">•</span>
                    <span className="text-sm font-black text-white bg-emerald-800/70 px-2.5 py-0.5 rounded-lg shadow-xs">
                      Change to Return: Rs. {changeBanner.change.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {changeBanner.customerPhone && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (changeBanner.receiptData && changeBanner.customerPhone) {
                        const msg = buildWhatsAppReceiptText(changeBanner.receiptData);
                        await db.whatsapp.openChat(changeBanner.customerPhone.trim(), msg);
                        toast.success(`WhatsApp opened for ${changeBanner.customerName || changeBanner.customerPhone}!`);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl font-bold text-xs shadow-xs transition-colors cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    <span>WhatsApp Bill ({changeBanner.customerName?.split(' ')[0] || changeBanner.customerPhone})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setChangeBanner(null)}
                  className="p-1.5 hover:bg-white/20 rounded-lg text-emerald-100 hover:text-white transition-colors cursor-pointer"
                  title="Dismiss"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Search Bar with Dropdown & Live Clock */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center gap-3 relative" ref={searchRef}>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Scan barcode or type item title..."
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                value={searchTerm}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => setIsDropdownOpen(true)}
                autoFocus
              />

              {/* Dropdown Menu */}
              {isDropdownOpen && searchTerm.trim() && searchResults && searchResults.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50">
                  {searchResults.map((item, index) => {
                    const discount = item.discount_percent || 0;
                    const finalPrice = item.selling_price * (1 - discount / 100);
                    return (
                      <li
                        key={item.searchKey || `${item.id}-${item.selling_price}-${index}`}
                        onClick={() => selectItem(item)}
                        className={`p-3 cursor-pointer border-b last:border-0 border-gray-100 dark:border-gray-700 flex justify-between items-center transition-colors ${index === selectedIndex ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-200' : 'hover:bg-blue-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className={`font-bold ${index === selectedIndex ? 'text-blue-900 dark:text-blue-200' : 'text-gray-800 dark:text-gray-100'}`}>{item.title}</h4>
                            {item.batch_label && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${item.batch_label?.startsWith('OLD')
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                }`}>
                                {item.batch_label}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Barcode: {item.barcode}</p>
                        </div>
                        <div className="text-right">
                          {discount > 0 ? (
                            <>
                              <span className="font-bold text-blue-600 dark:text-blue-400">Rs. {finalPrice.toFixed(2)}</span>
                              <span className="text-xs text-red-500 ml-1 line-through">Rs. {item.selling_price.toFixed(2)}</span>
                            </>
                          ) : (
                            <span className="font-bold text-blue-600 dark:text-blue-400">Rs. {item.selling_price.toFixed(2)}</span>
                          )}
                          {isServiceItem(item) ? (
                            <span className="inline-block text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800 mt-1">
                              Service (Unlimited)
                            </span>
                          ) : (
                            <p className={`text-xs mt-1 ${item.quantity > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                              {item.quantity > 0 ? `${item.quantity} in stock` : 'Out of stock'}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {isDropdownOpen && searchTerm.trim() && searchResults?.length === 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-4 text-center text-gray-500 dark:text-gray-400 z-50">
                  No matching items found.
                </div>
              )}
            </div>

            <button
              onClick={() => setShowShortcuts(true)}
              title="Keyboard shortcuts (?)"
              className="ml-3 p-2.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Keyboard className="w-5 h-5" />
            </button>

            {/* Customer & Loyalty Picker Button */}
            <button
              onClick={async () => {
                setIsRegisteringLoyalty(false);
                setCustomerPickerSearch('');
                setLoyaltyRegName('');
                setLoyaltyRegPhone('');
                setLoyaltyRegAddress('');
                setShowCustomerPicker(true);
                try {
                  const res = await db.credit.getCustomers();
                  if (res.success && res.data) setCreditCustomers(res.data);
                } catch (e) { console.error(e); }
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${attachedCustomer
                ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700 shadow-xs'
                : 'bg-white dark:bg-gray-700/80 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-50'
                }`}
              title="Attach Customer for Loyalty Points & WhatsApp E-Bill"
            >
              <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <div className="text-left leading-tight">
                {attachedCustomer ? (
                  <>
                    <span className="block font-black truncate max-w-[100px]">{attachedCustomer.name}</span>
                    <span className="block text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                      {attachedCustomer.loyalty_points || 0} pts
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block font-bold">Customer</span>
                    <span className="block text-[10px] text-gray-400">Loyalty / E-Bill</span>
                  </>
                )}
              </div>
              {attachedCustomer && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAttachedCustomer(null);
                    setRedeemPoints(false);
                  }}
                  className="p-0.5 hover:bg-purple-200 dark:hover:bg-purple-800 rounded-full"
                  title="Detach Customer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </button>

            {/* POS Item Return & Exchange Button */}
            <button
              onClick={() => {
                setShowReturnModal(true);
                setLastProcessedReturn(null);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-all cursor-pointer shadow-xs"
              title="Return or Exchange Items by Receipt"
            >
              <RotateCcw className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <div className="text-left leading-tight">
                <span className="block font-bold">Return</span>
                <span className="block text-[10px] text-rose-500/80">Exchange</span>
              </div>
            </button>

            {/* Live POS Clock & Date */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700/80 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-200 shadow-xs">
              <Clock className="w-4 h-4 text-blue-500 animate-pulse" />
              <div className="text-right leading-tight">
                <span className="text-xs font-black font-mono block">
                  {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="text-[10px] text-gray-400 font-semibold block">
                  {currentTime.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>



          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-4 z-0 relative">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                <ShoppingCartIcon />
                <p className="text-lg">Cart is empty</p>
                <p className="text-sm">Scan an item to begin</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {cart.map(item => {
                  const catalogPrice = item.catalog_price ?? item.original_price ?? item.selling_price;
                  const origPrice = item.original_price ?? item.selling_price;
                  const isPriceReduced = catalogPrice > 0 && item.selling_price < catalogPrice;
                  const hasDiscount = (item.discount_percent ?? 0) > 0 || isPriceReduced || item.is_special_discount;
                  const discountMode = getItemDiscountMode(item);
                  const discountVal = getItemDiscountValue(item);
                  const itemDiscountTotal = ((catalogPrice - item.selling_price) * item.quantity);

                  return (
                    <li key={item.lineId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm rounded-lg hover:border-blue-100 dark:hover:border-blue-900/40 transition-colors">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-gray-800 dark:text-gray-100 text-base truncate">{item.title}</h4>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
                          <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-gray-700 dark:text-gray-300">{item.barcode}</span>
                          <span>•</span>
                          <span>
                            Cost: <strong className="text-gray-700 dark:text-gray-300">Rs. {item.cost_price.toFixed(2)}</strong>
                          </span>
                          <span>•</span>
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            Margin: Rs. {(item.selling_price - item.cost_price).toFixed(2)}/ea
                          </span>
                        </div>

                        {/* Editable Price & Special Discount / Item Disc Controls */}
                        <div className="flex flex-wrap items-center gap-2 mt-2.5">
                          <div className="flex items-center gap-1.5 bg-blue-50/70 dark:bg-blue-900/30 px-2 py-1 rounded-lg border border-blue-200 dark:border-blue-800">
                            <span className="text-xs font-semibold text-blue-800 dark:text-blue-300">Price: Rs.</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={itemPriceInputs[item.lineId] !== undefined ? itemPriceInputs[item.lineId] : item.selling_price}
                              onChange={(e) => handleSellingPriceChange(item.lineId, e.target.value)}
                              onBlur={() => handleSellingPriceBlur(item.lineId)}
                              className="w-20 px-1.5 py-0.5 text-xs font-bold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 rounded text-right focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              title="Edit selling price directly (reductions are treated as Special Discount)"
                            />
                          </div>

                          {isPriceReduced ? (
                            <div className="flex items-center gap-1.5 animate-in fade-in">
                              <span className="text-xs text-gray-400 line-through">
                                Rs. {catalogPrice.toFixed(2)}
                              </span>
                              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-700">
                                ★ Special Discount: -Rs. {itemDiscountTotal.toFixed(2)} ({item.discount_percent}%)
                              </span>
                            </div>
                          ) : (item.selling_price > catalogPrice) ? (
                            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                              Custom Rate
                            </span>
                          ) : (
                            /* Item-wise Discount Controls */
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                Disc:
                              </span>
                              <div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 overflow-hidden shadow-2xs">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  placeholder="0"
                                  value={discountVal}
                                  onChange={(e) => handleItemDiscountChange(item.lineId, e.target.value)}
                                  className="w-14 px-1.5 py-0.5 text-xs font-bold text-gray-900 dark:text-gray-100 bg-transparent focus:outline-none text-right"
                                />
                                <div className="flex bg-gray-200 dark:bg-gray-600 p-0.5 text-[10px] font-bold">
                                  <button
                                    type="button"
                                    onClick={() => toggleItemDiscountMode(item.lineId, 'Rs')}
                                    title="Fixed Rupee discount on this item"
                                    className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${discountMode === 'Rs'
                                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 font-bold shadow-2xs'
                                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                      }`}
                                  >
                                    Rs
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleItemDiscountMode(item.lineId, '%')}
                                    title="Percentage discount on this item"
                                    className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${discountMode === '%'
                                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 font-bold shadow-2xs'
                                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                      }`}
                                  >
                                    %
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 self-end sm:self-center">
                        <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.lineId, -1)}
                            className="p-2 hover:bg-white dark:hover:bg-gray-600 rounded shadow-sm text-gray-600 dark:text-gray-300 cursor-pointer"
                            title="Decrease quantity"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            max={item.stock_limit}
                            value={itemQtyInputs[item.lineId] !== undefined ? itemQtyInputs[item.lineId] : item.quantity}
                            onChange={(e) => handleQuantityInputChange(item.lineId, e.target.value)}
                            onBlur={() => handleQuantityBlur(item.lineId)}
                            onFocus={(e) => e.target.select()}
                            className="w-14 py-1 text-center font-bold text-base text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded mx-1 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            title="Type quantity directly (e.g. 50, 100)"
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.lineId, 1)}
                            disabled={item.quantity >= item.stock_limit}
                            className="p-2 hover:bg-white dark:hover:bg-gray-600 rounded shadow-sm text-gray-600 dark:text-gray-300 disabled:opacity-30 cursor-pointer"
                            title="Increase quantity"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="w-28 text-right">
                          <p className="font-bold text-lg text-gray-900 dark:text-gray-100">Rs. {(item.selling_price * item.quantity).toFixed(2)}</p>
                          {isPriceReduced && (
                            <p className="text-xs text-gray-400 line-through">Rs. {(catalogPrice * item.quantity).toFixed(2)}</p>
                          )}
                        </div>
                        <button onClick={() => removeItem(item.lineId)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors cursor-pointer" title="Remove item">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Right Panel: Checkout Summary */}
        <div className="w-96 flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 z-0">
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700 pb-4 mb-4">Order Summary</h3>

          <div className="flex-1 space-y-4">
            {totalItemDiscounts > 0 && (
              <>
                <div className="flex justify-between text-gray-500 dark:text-gray-400 text-sm">
                  <span>Original Total</span>
                  <span className="line-through">Rs. {originalSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
                  <span>Item Discounts</span>
                  <span>- Rs. {totalItemDiscounts.toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-gray-600 dark:text-gray-300">
              <span>Subtotal</span>
              <span className="font-medium">Rs. {subtotal.toFixed(2)}</span>
            </div>

            {/* Bill Discount Section */}
            <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  Bill Discount
                </span>
                <div className="flex bg-gray-200 dark:bg-gray-600 rounded-lg p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setDiscountType('AMOUNT')}
                    className={`px-2 py-0.5 rounded-md transition-all ${discountType === 'AMOUNT' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 font-bold shadow-xs' : 'text-gray-600 dark:text-gray-300'}`}
                  >
                    Rs.
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('PERCENT')}
                    className={`px-2 py-0.5 rounded-md transition-all ${discountType === 'PERCENT' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 font-bold shadow-xs' : 'text-gray-600 dark:text-gray-300'}`}
                  >
                    %
                  </button>
                </div>
              </div>

              <div className="relative flex items-center">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={discountType === 'PERCENT' ? 'Enter % discount...' : 'Enter Rs. discount...'}
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  disabled={cart.length === 0}
                  className="w-full pl-3 pr-8 py-2 text-sm font-semibold rounded-lg border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                {discountInput && (
                  <button
                    type="button"
                    onClick={() => setDiscountInput('')}
                    className="absolute right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {billDiscount > 0 && (
                <div className="flex justify-between items-center text-xs mt-2 text-red-600 dark:text-red-400 font-medium">
                  <span>Discount Applied:</span>
                  <span className="font-bold">- Rs. {billDiscount.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between text-gray-600 dark:text-gray-300">
              <span>Tax (0%)</span>
              <span className="font-medium">Rs. 0.00</span>
            </div>

            {/* Loyalty Points Redemption Option */}
            {attachedCustomer && (attachedCustomer.loyalty_points || 0) > 0 && (
              <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-xl border border-purple-200 dark:border-purple-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                    <Award className="w-4 h-4" />
                    Redeem Loyalty Points
                  </span>
                  <p className="text-[11px] text-gray-500">
                    Available: <strong>{attachedCustomer.loyalty_points} pts</strong> (Value: Rs. {attachedCustomer.loyalty_points})
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={redeemPoints}
                    onChange={(e) => setRedeemPoints(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-purple-700 dark:text-purple-300">
                    {redeemPoints ? 'Applied' : 'Redeem'}
                  </span>
                </label>
              </div>
            )}

            {redeemPoints && attachedCustomer && (
              <div className="flex justify-between items-center text-xs text-purple-600 dark:text-purple-400 font-bold">
                <span>Points Discount:</span>
                <span>- Rs. {Math.min(attachedCustomer.loyalty_points || 0, Math.floor(netTotal)).toFixed(2)}</span>
              </div>
            )}

            <div className="pt-4 border-t border-gray-100 dark:border-gray-700 mt-auto">
              <div className="flex justify-between items-end mb-1">
                <span className="text-gray-500 dark:text-gray-400 text-sm uppercase tracking-wider">Total Amount</span>
                <span className="text-4xl font-black text-gray-900 dark:text-gray-100">Rs. {netTotal.toFixed(2)}</span>
              </div>
              {cart.length > 0 && (
                <p className="text-right text-xs text-green-600 dark:text-green-400 font-medium">Est. Gross Profit: Rs. {netProfit.toFixed(2)}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 mt-8">
            <button
              onClick={openCashModal}
              disabled={cart.length === 0 || isCheckingOut}
              className="flex flex-col items-center justify-center p-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed h-24 shadow-md cursor-pointer active:scale-98"
              title="Cash Payment & Change Calculator (press + or F1)"
            >
              <Banknote className="w-6 h-6 mb-1" />
              <span className="text-sm font-extrabold flex items-center gap-1">
                Cash
                <span className="text-[10px] bg-green-700/60 px-1.5 py-0.2 rounded font-mono">+</span>
              </span>
              <span className="text-[9px] text-green-100 font-normal mt-0.5">Calculate Change</span>
            </button>
            <button
              onClick={() => handleCheckout('CARD')}
              disabled={cart.length === 0 || isCheckingOut}
              className="flex flex-col items-center justify-center p-2.5 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed h-24 shadow-md cursor-pointer active:scale-98"
              title="Checkout with Card (1-Click or press - or F2)"
            >
              <CreditCard className="w-6 h-6 mb-1" />
              <span className="text-sm font-extrabold flex items-center gap-1">
                Card
                <span className="text-[10px] bg-blue-700/60 px-1.5 py-0.2 rounded font-mono">-</span>
              </span>
              <span className="text-[9px] text-blue-100 font-normal mt-0.5">1-Click Card</span>
            </button>
            <button
              onClick={openCreditModal}
              disabled={cart.length === 0 || isCheckingOut}
              className="flex flex-col items-center justify-center p-2.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed h-24 shadow-md cursor-pointer active:scale-98"
              title="Credit Payment (Assign bill to a credit customer account)"
            >
              <Users className="w-6 h-6 mb-1" />
              <span className="text-sm font-extrabold flex items-center gap-1">
                Credit
              </span>
              <span className="text-[9px] text-purple-200 font-normal mt-0.5">Customer Book</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              onClick={handlePrintLastReceipt}
              disabled={!lastSale}
              className="flex items-center justify-center p-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Printer className="w-4 h-4 mr-1.5" />
              Print Receipt
            </button>
            <button
              onClick={handleOpenWhatsAppFromLast}
              disabled={!lastSale}
              className="flex items-center justify-center p-3 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl font-bold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title={lastSale?.customer_phone ? `1-Click: Send WhatsApp to ${lastSale.customer_name || lastSale.customer_phone}` : 'Send WhatsApp E-Bill'}
            >
              <MessageSquare className="w-4 h-4 mr-1.5 text-emerald-600 dark:text-emerald-400" />
              {lastSale?.customer_name ? `WhatsApp (${lastSale.customer_name.split(' ')[0]})` : 'WhatsApp E-Bill'}
            </button>
          </div>
        </div>

      </div>

      {/* Cash Payment & Change Calculator Modal */}
      {showCashModal && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden"
          onClick={() => setShowCashModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-green-600 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Banknote className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-wide">Cash Payment & Change</h3>
                  <p className="text-xs text-green-100 font-medium">Enter cash received from customer</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCashModal(false)}
                className="p-1.5 hover:bg-white/20 rounded-xl text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Total Due Display */}
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Payable</span>
                  {billDiscount > 0 && (
                    <span className="ml-2 text-xs text-red-500 font-semibold">(Disc: Rs. {billDiscount.toFixed(2)})</span>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{cart.length} item(s) in cart</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-black text-gray-900 dark:text-gray-100">
                    Rs. {netTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Cash Received Input */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                  Cash Received / Tendered (Rs.)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-400">Rs.</span>
                  <input
                    ref={cashInputRef}
                    type="number"
                    step="any"
                    placeholder={netTotal.toFixed(2)}
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = parseFloat(cashReceived) || netTotal;
                        if (val >= netTotal) {
                          handleCheckout('CASH', val, autoPrintReceipt);
                        } else {
                          toast.error(`Cash received is less than total by Rs. ${(netTotal - val).toFixed(2)}`);
                        }
                      } else if (e.key === 'Escape') {
                        setShowCashModal(false);
                      }
                    }}
                    className="w-full pl-14 pr-4 py-3 text-3xl font-black text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 border-2 border-emerald-500 dark:border-emerald-600 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/20 text-right tracking-tight placeholder-gray-300 dark:placeholder-gray-600"
                  />
                </div>

                {/* Quick Cash Note Buttons */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => setCashReceived(String(netTotal))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${(parseFloat(cashReceived) || 0) === netTotal
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                  >
                    Exact (Rs. {netTotal.toFixed(2)})
                  </button>

                  {getQuickNotes(netTotal).map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCashReceived(String(amt))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${parseFloat(cashReceived) === amt
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                        }`}
                    >
                      Rs. {amt.toLocaleString()}
                    </button>
                  ))}

                  <div className="flex items-center gap-1.5 ml-auto">
                    {[100, 500, 1000].map((add) => (
                      <button
                        key={add}
                        type="button"
                        onClick={() => {
                          const curr = parseFloat(cashReceived) || 0;
                          setCashReceived(String(curr + add));
                        }}
                        className="px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-[11px] font-semibold cursor-pointer"
                        title={`Add Rs. ${add}`}
                      >
                        +{add}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live Change Calculation Box */}
              {(() => {
                const isProvided = cashReceived.trim() !== '';
                const received = parseFloat(cashReceived) || 0;
                const change = Math.round((received - netTotal) * 100) / 100;
                const short = Math.round((netTotal - received) * 100) / 100;

                if (!isProvided) {
                  return (
                    <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 flex items-center justify-between text-blue-800 dark:text-blue-300">
                      <div className="flex items-center gap-2">
                        <Coins className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-medium">Type cash given or click a note. (Press Enter for Exact)</span>
                      </div>
                      <span className="text-xs font-bold bg-blue-200 dark:bg-blue-800 px-2 py-0.5 rounded">Enter = Exact</span>
                    </div>
                  );
                }

                if (change >= 0) {
                  return (
                    <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500 dark:border-emerald-600 flex items-center justify-between shadow-xs">
                      <div>
                        <span className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                          Change to Return
                        </span>
                        <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                          Hand back to customer
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                          Rs. {change.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">
                        Insufficient Amount
                      </span>
                      <p className="text-xs text-amber-700 dark:text-amber-500">Customer still owes:</p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-black text-amber-700 dark:text-amber-400">
                        - Rs. {short.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Print Receipt Toggle */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-600 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={autoPrintReceipt}
                    onChange={(e) => setAutoPrintReceipt(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span>Automatically Print Receipt on Complete</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCashModal(false)}
                  className="py-3 px-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold rounded-2xl transition-all cursor-pointer text-xs"
                >
                  Cancel (Esc)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const val = parseFloat(cashReceived) || netTotal;
                    if (val >= netTotal) {
                      handleCheckout('CASH', val, autoPrintReceipt);
                    } else {
                      toast.error(`Cash received is less than total by Rs. ${(netTotal - val).toFixed(2)}`);
                    }
                  }}
                  disabled={isCheckingOut || (cashReceived.trim() !== '' && (parseFloat(cashReceived) || 0) < netTotal)}
                  className="flex-1 py-3 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black rounded-2xl transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 text-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>Complete (Enter)</span>
                </button>
                {attachedCustomer?.phone && (
                  <button
                    type="button"
                    onClick={() => {
                      const val = parseFloat(cashReceived) || netTotal;
                      if (val >= netTotal) {
                        handleCheckout('CASH', val, autoPrintReceipt, undefined, true);
                      } else {
                        toast.error(`Cash received is less than total by Rs. ${(netTotal - val).toFixed(2)}`);
                      }
                    }}
                    disabled={isCheckingOut || (cashReceived.trim() !== '' && (parseFloat(cashReceived) || 0) < netTotal)}
                    className="flex-1 py-3 px-3 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-black rounded-2xl transition-all shadow-lg shadow-teal-600/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 text-xs"
                    title="1-Click: Complete sale and open WhatsApp receipt directly"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Bill & WhatsApp 💬</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Customer Picker Modal (Loyalty & E-Bill) with Inline Registration */}
      {showCustomerPicker && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden"
          onClick={() => setShowCustomerPicker(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-700 to-indigo-800 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-wide">
                    {isRegisteringLoyalty ? 'Register Customer' : 'Attach Customer'}
                  </h3>
                  <p className="text-xs text-purple-200">
                    {isRegisteringLoyalty ? 'Create customer for loyalty points & e-bill' : 'Earn loyalty points & send WhatsApp e-bill'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomerPicker(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!isRegisteringLoyalty ? (
              <div className="p-5 space-y-3">
                {/* Search Bar + Register Button */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search by name or phone..."
                      value={customerPickerSearch}
                      onChange={(e) => setCustomerPickerSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      autoFocus
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (/^\+?\d+$/.test(customerPickerSearch.trim())) {
                        setLoyaltyRegPhone(customerPickerSearch.trim());
                        setLoyaltyRegName('');
                      } else {
                        setLoyaltyRegName(customerPickerSearch.trim());
                        setLoyaltyRegPhone('');
                      }
                      setIsRegisteringLoyalty(true);
                    }}
                    className="px-3.5 py-2.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>+ New</span>
                  </button>
                </div>

                {/* Customer List */}
                <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-2xl bg-gray-50/50 dark:bg-gray-900/40">
                  {creditCustomers.filter(c =>
                    c.name.toLowerCase().includes(customerPickerSearch.toLowerCase()) ||
                    c.phone.includes(customerPickerSearch)
                  ).length === 0 ? (
                    <div className="p-6 text-center space-y-3">
                      <p className="text-xs text-gray-400">
                        {customerPickerSearch.trim()
                          ? `No customer found for "${customerPickerSearch}".`
                          : 'No loyalty customers registered yet.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          if (/^\+?\d+$/.test(customerPickerSearch.trim())) {
                            setLoyaltyRegPhone(customerPickerSearch.trim());
                            setLoyaltyRegName('');
                          } else {
                            setLoyaltyRegName(customerPickerSearch.trim());
                            setLoyaltyRegPhone('');
                          }
                          setIsRegisteringLoyalty(true);
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Register New Customer</span>
                      </button>
                    </div>
                  ) : (
                    creditCustomers
                      .filter(c =>
                        c.name.toLowerCase().includes(customerPickerSearch.toLowerCase()) ||
                        c.phone.includes(customerPickerSearch)
                      )
                      .map(cust => (
                        <div
                          key={cust.id}
                          onClick={() => {
                            setAttachedCustomer(cust);
                            setShowCustomerPicker(false);
                            toast.success(`Customer "${cust.name}" attached to bill`);
                          }}
                          className="p-3 flex items-center justify-between cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors"
                        >
                          <div>
                            <span className="font-bold text-sm text-gray-900 dark:text-gray-100 block">{cust.name}</span>
                            <span className="text-xs text-gray-400">{cust.phone || 'No phone'}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-purple-600 dark:text-purple-400 flex items-center gap-1 justify-end">
                              <Award className="w-3.5 h-3.5" />
                              {cust.loyalty_points || 0} pts
                            </span>
                            {(cust.total_outstanding || 0) > 0 && (
                              <span className="text-[10px] text-rose-500 font-semibold block">
                                Due: Rs. {cust.total_outstanding.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            ) : (
              /* Inline Loyalty Customer Registration Form */
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Register Loyalty Customer</span>
                  <button
                    type="button"
                    onClick={() => setIsRegisteringLoyalty(false)}
                    className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-semibold cursor-pointer"
                  >
                    ← Back to search
                  </button>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Nimal Silva"
                    value={loyaltyRegName}
                    onChange={(e) => setLoyaltyRegName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                    WhatsApp / Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 0771234567"
                    value={loyaltyRegPhone}
                    onChange={(e) => setLoyaltyRegPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <span className="text-[10px] text-gray-400 mt-1 block">
                    Used for WhatsApp E-Bills and looking up loyalty points
                  </span>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                    Address (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Avissawella"
                    value={loyaltyRegAddress}
                    onChange={(e) => setLoyaltyRegAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRegisteringLoyalty(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingLoyalty || !loyaltyRegName.trim()}
                    onClick={handleRegisterLoyaltyCustomer}
                    className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/25 disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingLoyalty ? 'Saving...' : 'Register & Attach'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Credit Bill & Customer Selection Modal */}
      {showCreditModal && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden"
          onClick={() => setShowCreditModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-700 to-indigo-800 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-xs">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-wide">Select Credit Customer</h3>
                  <p className="text-xs text-purple-200">Bill will be added to customer's credit ledger</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreditModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Bill Amount Reminder */}
              <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-2xl border border-purple-200 dark:border-purple-800 flex justify-between items-center">
                <span className="text-xs font-bold uppercase text-purple-800 dark:text-purple-300">Total Credit Amount:</span>
                <span className="text-2xl font-black text-purple-700 dark:text-purple-300">Rs. {netTotal.toFixed(2)}</span>
              </div>

              {!isCreatingCreditCustomer ? (
                <>
                  {/* Search Customer Input & Add Button */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        ref={creditSearchInputRef}
                        type="text"
                        placeholder="Search customer by name or phone..."
                        value={creditSearch}
                        onChange={(e) => setCreditSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCreatingCreditCustomer(true)}
                      className="px-3 py-2.5 bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/50 dark:hover:bg-purple-900/80 text-purple-700 dark:text-purple-300 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <UserPlus className="w-4 h-4" />
                      New
                    </button>
                  </div>

                  {/* Customer Results List */}
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-2xl bg-gray-50/50 dark:bg-gray-900/40">
                    {creditCustomers.filter(c =>
                      c.name.toLowerCase().includes(creditSearch.toLowerCase()) ||
                      c.phone.includes(creditSearch)
                    ).length === 0 ? (
                      <div className="p-6 text-center text-gray-400 text-xs">
                        No credit customer found for "{creditSearch}". Click <strong>+ New</strong> to register.
                      </div>
                    ) : (
                      creditCustomers
                        .filter(c =>
                          c.name.toLowerCase().includes(creditSearch.toLowerCase()) ||
                          c.phone.includes(creditSearch)
                        )
                        .map(cust => {
                          const isSelected = selectedCreditCustomer?.id === cust.id;
                          return (
                            <div
                              key={cust.id}
                              onClick={() => setSelectedCreditCustomer(cust)}
                              className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${isSelected
                                ? 'bg-purple-100 dark:bg-purple-900/40 border-l-4 border-purple-600'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
                                }`}
                            >
                              <div>
                                <span className="font-bold text-sm text-gray-900 dark:text-gray-100 block">{cust.name}</span>
                                <span className="text-xs text-gray-400">{cust.phone || 'No phone'}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-gray-400 uppercase font-semibold block">Outstanding</span>
                                <span className="text-xs font-black text-rose-600 dark:text-rose-400">
                                  Rs. {(cust.total_outstanding || 0).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>

                  {/* Selected Customer Preview */}
                  {selectedCreditCustomer && (
                    <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-300 dark:border-purple-700 flex items-center justify-between">
                      <div>
                        <span className="text-xs text-purple-700 dark:text-purple-300 font-bold">Selected:</span>
                        <p className="text-sm font-black text-gray-900 dark:text-gray-100">{selectedCreditCustomer.name}</p>
                        <p className="text-[11px] text-gray-500">
                          Current Due: Rs. {(selectedCreditCustomer.total_outstanding || 0).toFixed(2)} → New Due: <strong className="text-rose-600">Rs. {((selectedCreditCustomer.total_outstanding || 0) + netTotal).toFixed(2)}</strong>
                        </p>
                      </div>
                      <Check className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreditModal(false)}
                      className="py-3 px-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-bold rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!selectedCreditCustomer || isCheckingOut}
                      onClick={() => {
                        if (selectedCreditCustomer) {
                          handleCheckout('CREDIT', undefined, true, selectedCreditCustomer);
                        }
                      }}
                      className="flex-1 py-3 px-3 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-black rounded-2xl transition-all shadow-lg shadow-purple-600/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                    >
                      <Check className="w-4 h-4" />
                      <span>Confirm Credit Bill</span>
                    </button>
                    {selectedCreditCustomer?.phone && (
                      <button
                        type="button"
                        disabled={!selectedCreditCustomer || isCheckingOut}
                        onClick={() => {
                          if (selectedCreditCustomer) {
                            handleCheckout('CREDIT', undefined, true, selectedCreditCustomer, true);
                          }
                        }}
                        className="flex-1 py-3 px-3 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-black rounded-2xl transition-all shadow-lg shadow-teal-600/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                        title="1-Click: Confirm credit bill and open WhatsApp receipt directly"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>Bill & WhatsApp 💬</span>
                      </button>
                    )}
                  </div>
                </>
              ) : (
                /* Inline Add Customer Form */
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Register New Customer</span>
                    <button
                      type="button"
                      onClick={() => setIsCreatingCreditCustomer(false)}
                      className="text-xs text-purple-600 dark:text-purple-400 font-semibold"
                    >
                      Back to search
                    </button>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">Customer Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Nimal Silva"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">Phone Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 0771234567"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">Credit Limit (Rs.)</label>
                    <input
                      type="number"
                      placeholder="0 for unlimited"
                      value={newCustomerLimit}
                      onChange={(e) => setNewCustomerLimit(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCreatingCreditCustomer(false)}
                      className="flex-1 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-xs font-bold text-gray-700 dark:text-gray-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingCredit}
                      onClick={handleQuickCreateCreditCustomer}
                      className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md disabled:opacity-50"
                    >
                      {isSubmittingCredit ? 'Saving...' : 'Save & Select'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}



      {/* WhatsApp E-Bill Modal with Image Preview */}
      {showWhatsAppModal && whatsAppReceiptData && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden"
          onClick={() => setShowWhatsAppModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-wide">WhatsApp E-Bill</h3>
                  <p className="text-xs text-emerald-100">Send formatted text receipt via WhatsApp</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWhatsAppModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 block mb-1.5">
                  Customer WhatsApp Phone Number *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 0771234567 or +94771234567"
                  value={whatsAppPhone}
                  onChange={(e) => setWhatsAppPhone(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-base font-mono font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>

              {/* Message Text Preview */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Receipt Message Preview (Text Only)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const text = buildWhatsAppReceiptText(whatsAppReceiptData);
                      navigator.clipboard.writeText(text);
                      toast.success('Receipt text copied to clipboard!');
                    }}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy Text
                  </button>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-3.5 max-h-56 overflow-y-auto">
                  <pre className="font-mono text-xs whitespace-pre-wrap text-gray-700 dark:text-gray-300 leading-relaxed select-all">
                    {buildWhatsAppReceiptText(whatsAppReceiptData)}
                  </pre>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWhatsAppModal(false)}
                  className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-bold rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-700 text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  disabled={!whatsAppPhone.trim()}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black rounded-2xl shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Send to WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Item Return & Exchange System Modal */}
      {showReturnModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowReturnModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-rose-600 to-rose-700 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <RotateCcw className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-wide">POS Item Return & Exchange</h3>
                  <p className="text-xs text-rose-100">Restock returned goods, issue cash refunds, or exchange items</p>
                </div>
              </div>
              <button
                onClick={() => setShowReturnModal(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Receipt Search Bar */}
              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  Lookup by Receipt / Invoice Number *
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="e.g. REC-20261116-001 or scan receipt barcode..."
                      value={returnReceiptSearch}
                      onChange={(e) => setReturnReceiptSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearchReturnReceipt();
                        }
                      }}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-mono font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSearchReturnReceipt()}
                    disabled={searchingReturnSale}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    {searchingReturnSale ? 'Searching...' : 'Find Sale'}
                  </button>
                </div>
              </div>

              {/* Receipt Details & Items */}
              {returnSale && (
                <div className="space-y-4">
                  {/* Sale Summary Banner */}
                  <div className="bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-mono font-bold text-sm text-gray-900 dark:text-gray-100 block">
                        Receipt: {returnSale.receipt_no}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        Date: {new Date(returnSale.created_at).toLocaleString()} • Original Payment: <strong>{returnSale.payment_type}</strong>
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">Original Sale Total</span>
                      <span className="text-base font-black text-gray-900 dark:text-gray-100">
                        Rs. {Number(returnSale.total_amount).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Return Items Selection Table */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                      Select Items to Return & Quantity
                    </h4>
                    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-750 text-gray-500 dark:text-gray-400 uppercase font-bold border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className="py-2.5 px-3">Item</th>
                            <th className="py-2.5 px-2 text-center">Sold Qty</th>
                            <th className="py-2.5 px-2 text-center">Prev. Returned</th>
                            <th className="py-2.5 px-3 text-center">Return Qty</th>
                            <th className="py-2.5 px-3 text-right">Refund Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-750">
                          {returnItems.map((item, idx) => {
                            const isFullyReturned = item.max_return_qty <= 0;
                            return (
                              <tr key={idx} className={isFullyReturned ? 'bg-gray-50/50 dark:bg-gray-800/50 opacity-60' : 'hover:bg-rose-50/30'}>
                                <td className="py-2.5 px-3">
                                  <span className="font-bold text-gray-900 dark:text-gray-100 block">
                                    {item.title}
                                  </span>
                                  <span className="text-[10px] text-gray-400 font-mono">
                                    {item.barcode || 'N/A'} • Rs. {Number(item.unit_price).toFixed(2)}/ea
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 text-center font-bold text-gray-700 dark:text-gray-300">
                                  {item.sold_qty}
                                </td>
                                <td className="py-2.5 px-2 text-center font-bold text-amber-600 dark:text-amber-400">
                                  {item.already_returned_qty}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {isFullyReturned ? (
                                    <span className="text-[10px] font-bold text-gray-400">Returned</span>
                                  ) : (
                                    <input
                                      type="number"
                                      min="0"
                                      max={item.max_return_qty}
                                      value={item.return_qty}
                                      onChange={(e) => handleReturnQtyChange(idx, e.target.value)}
                                      className="w-16 px-2 py-1 text-center font-bold text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                                    />
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-black text-rose-600 dark:text-rose-400 text-sm">
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                        Return Reason *
                      </label>
                      <input
                        type="text"
                        value={returnReason}
                        onChange={(e) => setReturnReason(e.target.value)}
                        placeholder="e.g. Defective, Wrong Book, Customer Exchange"
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-semibold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {['Defective', 'Wrong Item', 'Exchange', 'Changed Mind'].map(r => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setReturnReason(r)}
                            className="px-2 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-600 dark:text-gray-300 cursor-pointer"
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                        Refund / Settlement Method *
                      </label>
                      <select
                        value={returnRefundMethod}
                        onChange={(e) => setReturnRefundMethod(e.target.value as any)}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                      >
                        <option value="CASH">Cash Refund (Drawer Outflow)</option>
                        <option value="EXCHANGE">POS Exchange (Restock & Issue Credit)</option>
                        <option value="CREDIT">Customer Debt Reduction (Credit)</option>
                      </select>
                    </div>
                  </div>

                  {/* Refund Summary Banner */}
                  <div className="bg-gray-50 dark:bg-gray-750 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400 block">
                        Total Items Returning: <strong>{returnItems.reduce((sum, i) => sum + i.return_qty, 0)} units</strong>
                      </span>
                      <span className="text-[11px] text-gray-400">
                        Items will immediately be restored to stock batches.
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">Total Refund Due</span>
                      <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
                        Rs. {returnItems.reduce((sum, i) => sum + i.refund_amount, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Last Processed Return Voucher Banner */}
              {lastProcessedReturn && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-2xl p-4 flex items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-600 text-white rounded-xl">
                      <Check className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-bold text-emerald-900 dark:text-emerald-200 text-sm block">
                        Return {lastProcessedReturn.return_no} Processed Successfully!
                      </span>
                      <span className="text-xs text-emerald-700 dark:text-emerald-400">
                        Refund: <strong>Rs. {lastProcessedReturn.total_refund.toFixed(2)}</strong> ({lastProcessedReturn.refund_method})
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => printReturnReceipt(lastProcessedReturn)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Voucher
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 dark:bg-gray-750 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowReturnModal(false)}
                className="px-5 py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
              {returnSale && (
                <button
                  type="button"
                  onClick={handleExecuteReturn}
                  disabled={isProcessingReturn || returnItems.reduce((sum, i) => sum + i.return_qty, 0) === 0}
                  className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-md shadow-rose-600/25 transition-all cursor-pointer flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{isProcessingReturn ? 'Processing...' : 'Confirm Return & Restock'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Help Overlay */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4 print:hidden" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-blue-600" />
                Keyboard Shortcuts
              </h3>
              <button onClick={() => setShowShortcuts(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <ul className="space-y-2">
              {SHORTCUTS.map(s => (
                <li key={s.keys} className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 dark:text-gray-300">{s.desc}</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono font-bold text-gray-700 dark:text-gray-200">{s.keys}</kbd>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function ShoppingCartIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-4 text-gray-300 dark:text-gray-600">
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}
