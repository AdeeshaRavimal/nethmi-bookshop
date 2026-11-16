import { useState, useEffect, useMemo, useRef } from 'react';
import { db, type InventoryItem, type Supplier } from '../db';
import { useToast } from '../components/Toast';
import { 
  Plus, 
  Package, 
  AlertTriangle, 
  Edit, 
  Save, 
  X, 
  Search, 
  Truck, 
  Trash2, 
  DollarSign,
  FileSpreadsheet,
  Upload,
  Download,
  FileCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface InventoryItemWithSupplier extends InventoryItem {
  supplier_name?: string;
}

interface ParsedImportItem {
  barcode: string;
  title: string;
  category: string;
  cost_price: number;
  selling_price: number;
  discount_percent: number;
  quantity: number;
  reorder_level: number;
}

export default function Inventory() {
  const toast = useToast();
  const [inventory, setInventory] = useState<InventoryItemWithSupplier[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'BOOK' | 'STATIONERY' | 'SERVICE' | 'OTHER'>('ALL');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  // Form State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    barcode: '',
    title: '',
    category: 'BOOK',
    cost_price: '',
    selling_price: '',
    discount_percent: '0',
    quantity: '',
    reorder_level: '3',
    supplier_id: ''
  });

  // Import State & Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ParsedImportItem[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSuppliers = async () => {
    try {
      const res = await db.suppliers.getAll();
      setSuppliers(res.data ?? []);
    } catch (err) {
      console.error('Failed to fetch suppliers', err);
    }
  };

  const fetchInventory = async () => {
    try {
      const res = await db.inventory.getAll();
      setInventory(res.data ?? []);
    } catch (err) {
      console.error('Failed to fetch inventory', err);
    }
  };

  useEffect(() => {
    fetchInventory();
    fetchSuppliers();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      barcode: '',
      title: '',
      category: 'BOOK',
      cost_price: '',
      selling_price: '',
      discount_percent: '0',
      quantity: '',
      reorder_level: '3',
      supplier_id: ''
    });
  };

  const handleEdit = (item: InventoryItemWithSupplier) => {
    setEditingId(item.id!);
    setFormData({
      barcode: item.barcode,
      title: item.title,
      category: item.category,
      cost_price: item.cost_price.toString(),
      selling_price: item.selling_price.toString(),
      discount_percent: (item.discount_percent || 0).toString(),
      quantity: item.quantity.toString(),
      reorder_level: item.reorder_level.toString(),
      supplier_id: item.supplier_id ? item.supplier_id.toString() : ''
    });
  };

  const handleDelete = async (item: InventoryItemWithSupplier) => {
    if (!window.confirm(`Are you sure you want to delete "${item.title}"?`)) {
      return;
    }

    try {
      await db.inventory.delete(item.id!);
      if (editingId === item.id) {
        resetForm();
      }
      fetchInventory();
    } catch (error: any) {
      console.error('Failed to delete item', error);
      toast.error('Failed to delete item. Please check the database.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const supplierIdVal = formData.supplier_id ? parseInt(formData.supplier_id, 10) : null;
    const isServiceItem = formData.category === 'SERVICE' || formData.barcode.trim().startsWith('SRV-');
    
    try {
      await db.inventory.upsert({
        id: editingId ?? undefined,
        barcode: formData.barcode.trim(),
        title: formData.title.trim(),
        category: formData.category,
        cost_price: parseFloat(formData.cost_price) || 0,
        selling_price: parseFloat(formData.selling_price) || 0,
        discount_percent: parseFloat(formData.discount_percent) || 0,
        quantity: isServiceItem ? 0 : (parseInt(formData.quantity, 10) || 0),
        reorder_level: isServiceItem ? 0 : (parseInt(formData.reorder_level, 10) || 0),
        supplier_id: supplierIdVal,
      });
      if (editingId) toast.success('Item updated successfully!');
      resetForm();
      fetchInventory();
    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes('UNIQUE') || error?.message?.includes('barcode')) {
        toast.error('Barcode/ISBN already exists for another product.', 'Failed to save');
      } else {
        toast.error('Please verify the input values.', 'Failed to save');
      }
    }
  };

  // --- Excel / CSV Export ---
  const escapeCsv = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val).trim();
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const handleExportExcel = () => {
    if (inventory.length === 0) {
      toast.warning('No inventory items to export.');
      return;
    }

    const BOM = '\uFEFF';
    const headers = [
      'Barcode (ISBN)',
      'Title',
      'Category',
      'Cost Price (Rs.)',
      'Selling Price (Rs.)',
      'Discount (%)',
      'Stock Quantity',
      'Reorder Level',
      'Supplier',
      'Unit Margin (Rs.)',
      'Total Cost Value (Rs.)',
      'Total Retail Value (Rs.)'
    ];

    const rows = inventory.map(item => {
      const discount = item.discount_percent || 0;
      const finalPrice = item.selling_price * (1 - discount / 100);
      const unitMargin = finalPrice - item.cost_price;
      const totalCost = item.cost_price * item.quantity;
      const totalRetail = item.selling_price * item.quantity;

      return [
        escapeCsv(item.barcode),
        escapeCsv(item.title),
        escapeCsv(item.category),
        item.cost_price.toFixed(2),
        item.selling_price.toFixed(2),
        discount.toString(),
        item.quantity.toString(),
        item.reorder_level.toString(),
        escapeCsv(item.supplier_name || 'N/A'),
        unitMargin.toFixed(2),
        totalCost.toFixed(2),
        totalRetail.toFixed(2)
      ].join(',');
    });

    const totalQty = inventory.reduce((s, i) => s + i.quantity, 0);
    const totalCostVal = inventory.reduce((s, i) => s + (i.cost_price * i.quantity), 0);
    const totalRetailVal = inventory.reduce((s, i) => s + (i.selling_price * i.quantity), 0);

    const summaryRow = [
      'TOTALS',
      `"${inventory.length} Unique Titles"`,
      '',
      '',
      '',
      '',
      totalQty.toString(),
      '',
      '',
      '',
      totalCostVal.toFixed(2),
      totalRetailVal.toFixed(2)
    ].join(',');

    const csvContent = BOM + [headers.join(','), ...rows, summaryRow].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Hiru_Bookshop_Inventory_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- Excel / CSV Template Download ---
  const handleDownloadTemplate = () => {
    const BOM = '\uFEFF';
    const headers = 'Barcode,Title,Category,Cost Price,Selling Price,Discount Percent,Quantity,Reorder Level';
    const sampleRows = [
      '9789551234567,Grade 10 Mathematics,BOOK,650.00,800.00,0,30,5',
      'ST-CR-01,CR 120 Pages Ruled Book,STATIONERY,180.00,240.00,5,50,10',
      'ST-PEN-BLU,Atlas Chooty Blue Pen,STATIONERY,30.00,45.00,0,100,20'
    ];
    const csvContent = BOM + [headers, ...sampleRows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Hiru_Inventory_Import_Template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- Excel / CSV Import Handling ---
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          setImportError('Selected file is empty.');
          return;
        }

        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length < 2) {
          setImportError('File must contain at least a header row and one data row.');
          return;
        }

        const headerLine = lines[0].replace(/^\uFEFF/, '');
        const headers = parseCsvLine(headerLine).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

        const getIdx = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)));
        const barcodeIdx = getIdx(['barcode', 'isbn', 'code']);
        const titleIdx = getIdx(['title', 'name', 'product', 'item']);
        const categoryIdx = getIdx(['category', 'type']);
        const costIdx = getIdx(['costprice', 'cost', 'wholesale', 'buy']);
        const sellIdx = getIdx(['sellingprice', 'selling', 'sell', 'retail']);
        const discountIdx = getIdx(['discount']);
        const qtyIdx = getIdx(['quantity', 'qty', 'stock']);
        const reorderIdx = getIdx(['reorder', 'alert']);

        if (barcodeIdx === -1 || titleIdx === -1 || sellIdx === -1) {
          setImportError('Could not identify essential columns. Please ensure columns include Barcode, Title, and Selling Price.');
          return;
        }

        const parsedItems: ParsedImportItem[] = [];

        for (let i = 1; i < lines.length; i++) {
          const row = parseCsvLine(lines[i]);
          if (row.length === 0 || !row[barcodeIdx]) continue;

          const barcode = row[barcodeIdx];
          const title = row[titleIdx] || 'Untitled Item';
          let rawCat = categoryIdx !== -1 && row[categoryIdx] ? row[categoryIdx].toLowerCase().trim() : '';
          let category = 'BOOK';
          if (rawCat.includes('station')) category = 'STATIONERY';
          else if (rawCat.includes('other') || rawCat.includes('misc')) category = 'OTHER';
          else if (rawCat.includes('book') || rawCat === 'book' || rawCat === 'books') category = 'BOOK';
          const cost = costIdx !== -1 ? parseFloat(row[costIdx]) || 0 : 0;
          const sell = parseFloat(row[sellIdx]) || 0;
          const discount = discountIdx !== -1 ? parseFloat(row[discountIdx]) || 0 : 0;
          const qty = qtyIdx !== -1 ? parseInt(row[qtyIdx], 10) || 0 : 0;
          const reorder = reorderIdx !== -1 ? parseInt(row[reorderIdx], 10) || 3 : 3;

          parsedItems.push({
            barcode,
            title,
            category,
            cost_price: cost,
            selling_price: sell,
            discount_percent: discount,
            quantity: qty,
            reorder_level: reorder
          });
        }

        if (parsedItems.length === 0) {
          setImportError('No valid items found in the spreadsheet.');
          return;
        }

        setImportPreview(parsedItems);
        setIsImportModalOpen(true);
      } catch (err: any) {
        setImportError(`Error parsing spreadsheet: ${err.message}`);
      }
    };

    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (importPreview.length === 0) return;
    setImporting(true);

    try {
      await db.inventory.bulkUpsert(importPreview);
      toast.success(`Imported and updated ${importPreview.length} inventory items.`, 'Import complete');
      setIsImportModalOpen(false);
      setImportPreview([]);
      fetchInventory();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Import failed.', 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // Helper to identify service items
  const isService = (item: { category: string; barcode?: string }) =>
    item.category === 'SERVICE' || item.barcode?.startsWith('SRV-');

  // Filtered Inventory
  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesBarcode = item.barcode.toLowerCase().includes(query);
        const matchesSupplier = item.supplier_name?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesBarcode && !matchesSupplier) return false;
      }

      if (selectedCategory !== 'ALL') {
        if (selectedCategory === 'SERVICE') {
          if (!isService(item)) return false;
        } else if (item.category !== selectedCategory) {
          return false;
        }
      }

      if (showLowStockOnly && (isService(item) || item.quantity > item.reorder_level)) {
        return false;
      }

      return true;
    });
  }, [inventory, searchQuery, selectedCategory, showLowStockOnly]);

  // Pagination State for Instant High-Volume Rendering
  const [pageSize, setPageSize] = useState<number | 'ALL'>(50);
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to page 1 on search or filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, showLowStockOnly, pageSize]);

  const totalPages = pageSize === 'ALL' ? 1 : Math.max(1, Math.ceil(filteredInventory.length / pageSize));

  const paginatedInventory = useMemo(() => {
    if (pageSize === 'ALL') return filteredInventory;
    const start = (currentPage - 1) * pageSize;
    return filteredInventory.slice(start, start + pageSize);
  }, [filteredInventory, currentPage, pageSize]);

  // Summary Metrics (Physical Stock Only)
  const stockItems = inventory.filter(item => !isService(item));
  const totalStockCount = stockItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalStockValueCost = stockItems.reduce((sum, item) => sum + (item.cost_price * item.quantity), 0);
  const totalStockValueRetail = stockItems.reduce((sum, item) => sum + (item.selling_price * item.quantity), 0);
  const lowStockCount = stockItems.filter(item => item.quantity <= item.reorder_level).length;

  return (
    <div className="p-8 h-full flex flex-col">
      {/* Hidden File Input for Excel/CSV Import */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".csv, application/vnd.ms-excel, text/csv" 
        className="hidden" 
      />

      {/* Top Header & Quick Metrics */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center">
            <Package className="mr-3 text-blue-600 w-7 h-7" />
            Inventory Management
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage books, stationery, pricing, stock levels, and suppliers</p>
        </div>

        {/* Action Buttons: Export / Import Excel & Metrics */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Excel Export Button */}
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
            title="Export all stock to an Excel (.csv) file"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export to Excel</span>
          </button>

          {/* Excel Import Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl shadow-xs font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
            title="Import or update stock from an Excel (.csv) file"
          >
            <Upload className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            <span>Import Excel</span>
          </button>

          <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs text-gray-400 block font-medium">Total Titles</span>
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{inventory.length} <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({totalStockCount} units)</span></span>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <div className="p-2 bg-green-50 dark:bg-green-900/40 text-green-600 dark:text-green-400 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs text-gray-400 block font-medium">Stock Value (Cost)</span>
              <span className="text-sm font-bold text-green-700 dark:text-green-400">Rs. {totalStockValueCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          <button
            onClick={() => setShowLowStockOnly(prev => !prev)}
            className={`px-4 py-2 rounded-xl shadow-sm border transition-all flex items-center gap-2 cursor-pointer ${
              showLowStockOnly
                ? 'bg-red-600 text-white border-red-600 ring-2 ring-red-300'
                : lowStockCount > 0
                ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
            }`}
          >
            <AlertTriangle className={`w-4 h-4 ${showLowStockOnly ? 'text-white' : 'text-red-500'}`} />
            <div className="text-left">
              <span className="text-xs block font-medium">Low Stock</span>
              <span className="text-sm font-bold">{lowStockCount} {lowStockCount === 1 ? 'item' : 'items'}</span>
            </div>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 flex-1 overflow-hidden">
        
        {/* Left Side: Add/Edit Item Form (4 cols on xl) */}
        <div className="xl:col-span-4 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col overflow-y-auto">
          <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              {editingId ? (
                <>
                  <Edit className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  Edit Item #{editingId}
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  Add New Item
                </>
              )}
            </h3>
            {editingId && (
              <button 
                onClick={resetForm} 
                className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Cancel Edit"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4 flex-1">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Barcode / ISBN <span className="text-red-500">*</span>
              </label>
              <input 
                required 
                type="text" 
                placeholder="e.g. 9789551234567 or BK-101"
                value={formData.barcode} 
                onChange={e => setFormData({...formData, barcode: e.target.value})} 
                className="w-full p-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono text-sm" 
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Title / Product Name <span className="text-red-500">*</span>
              </label>
              <input 
                required 
                type="text" 
                placeholder="e.g. Grade 10 Mathematics"
                value={formData.title} 
                onChange={e => setFormData({...formData, title: e.target.value})} 
                className="w-full p-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm" 
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                <select 
                  value={formData.category} 
                  onChange={e => {
                    const cat = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      category: cat,
                      quantity: cat === 'SERVICE' ? '0' : (prev.quantity === '0' ? '' : prev.quantity),
                      reorder_level: cat === 'SERVICE' ? '0' : (prev.reorder_level === '0' ? '3' : prev.reorder_level),
                    }));
                  }} 
                  className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                >
                  <option value="BOOK">Book</option>
                  <option value="STATIONERY">Stationery</option>
                  <option value="SERVICE">Service</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-gray-400" />
                  Supplier
                </label>
                <select 
                  value={formData.supplier_id} 
                  onChange={e => setFormData({...formData, supplier_id: e.target.value})} 
                  className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                >
                  <option value="">-- No Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cost Price (Rs.)</label>
                <input 
                  required 
                  type="number" 
                  step="0.01" 
                  min="0"
                  placeholder="0.00"
                  value={formData.cost_price} 
                  onChange={e => setFormData({...formData, cost_price: e.target.value})} 
                  className="w-full p-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Selling Price (Rs.)</label>
                <input 
                  required 
                  type="number" 
                  step="0.01" 
                  min="0"
                  placeholder="0.00"
                  value={formData.selling_price} 
                  onChange={e => setFormData({...formData, selling_price: e.target.value})} 
                  className="w-full p-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-bold text-sm" 
                />
              </div>
            </div>

            {formData.category === 'SERVICE' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Discount %</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0" 
                    max="100"
                    placeholder="0"
                    value={formData.discount_percent} 
                    onChange={e => setFormData({...formData, discount_percent: e.target.value})} 
                    className="w-full p-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                  />
                </div>
                <div className="p-3 bg-purple-50 dark:bg-purple-950/40 rounded-lg text-xs text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-2">
                  <span className="text-base">📋</span>
                  <span>Services have no stock level — they are non-inventory items with unlimited availability at POS.</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Discount %</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0" 
                    max="100"
                    placeholder="0"
                    value={formData.discount_percent} 
                    onChange={e => setFormData({...formData, discount_percent: e.target.value})} 
                    className="w-full p-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity</label>
                  <input 
                    required 
                    type="number" 
                    min="0"
                    placeholder="0"
                    value={formData.quantity} 
                    onChange={e => setFormData({...formData, quantity: e.target.value})} 
                    className="w-full p-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-bold" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Reorder Alert</label>
                  <input 
                    required 
                    type="number" 
                    min="0"
                    value={formData.reorder_level} 
                    onChange={e => setFormData({...formData, reorder_level: e.target.value})} 
                    className="w-full p-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                  />
                </div>
              </div>
            )}

            {/* Profit Margin Preview */}
            {formData.cost_price && formData.selling_price && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg text-xs flex justify-between items-center text-blue-900 dark:text-blue-200 border border-blue-100 dark:border-blue-800">
                <span>Profit per unit:</span>
                <span className="font-bold">
                  Rs. {(
                    (parseFloat(formData.selling_price) || 0) * (1 - (parseFloat(formData.discount_percent) || 0) / 100) - 
                    (parseFloat(formData.cost_price) || 0)
                  ).toFixed(2)}
                </span>
              </div>
            )}
            
            <div className="pt-2 flex gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-1/3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button 
                type="submit" 
                className={`flex-1 flex justify-center items-center py-3 rounded-lg font-bold transition-all text-white shadow-sm cursor-pointer ${
                  editingId 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {editingId ? (
                  <><Save className="w-4 h-4 mr-2" /> Update Item</>
                ) : (
                  <><Plus className="w-4 h-4 mr-2" /> Add to Inventory</>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Side: Inventory Table & Filters (8 cols on xl) */}
        <div className="xl:col-span-8 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
          
          {/* Controls Bar: Search & Category Tabs */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search by title, barcode, or supplier..." 
                className="w-full pl-9 pr-8 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex bg-gray-200/80 dark:bg-gray-700/80 p-1 rounded-lg text-xs font-semibold">
              <button
                onClick={() => setSelectedCategory('ALL')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  selectedCategory === 'ALL'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                All ({inventory.length})
              </button>
              <button
                onClick={() => setSelectedCategory('BOOK')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  selectedCategory === 'BOOK'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Books ({inventory.filter(i => i.category === 'BOOK').length})
              </button>
              <button
                onClick={() => setSelectedCategory('STATIONERY')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  selectedCategory === 'STATIONERY'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Stationery ({inventory.filter(i => i.category === 'STATIONERY').length})
              </button>
              <button
                onClick={() => setSelectedCategory('SERVICE')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  selectedCategory === 'SERVICE'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Services ({inventory.filter(i => i.category === 'SERVICE' || i.barcode?.startsWith('SRV-')).length})
              </button>
              <button
                onClick={() => setSelectedCategory('OTHER')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  selectedCategory === 'OTHER'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Other ({inventory.filter(i => i.category === 'OTHER').length})
              </button>
            </div>
          </div>

          {/* Active filter banner if Low Stock view is ON */}
          {showLowStockOnly && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Showing only items below reorder threshold (<strong>{filteredInventory.length}</strong> items found).</span>
              </div>
              <button 
                onClick={() => setShowLowStockOnly(false)} 
                className="font-bold underline hover:text-amber-950 dark:hover:text-amber-100 cursor-pointer"
              >
                Show All Items
              </button>
            </div>
          )}

          {/* Table Container */}
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-left">
              <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Item & Supplier</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pricing</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Margin</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stock Level</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredInventory.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                      <Package className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="font-medium text-gray-700 dark:text-gray-300">No items match your criteria</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Try adjusting your search query or filter</p>
                    </td>
                  </tr>
                )}

                {paginatedInventory.map((item) => {
                  const discount = item.discount_percent || 0;
                  const finalSellingPrice = item.selling_price * (1 - discount / 100);
                  const margin = finalSellingPrice - item.cost_price;
                  const itemIsService = isService(item);
                  const isLowStock = !itemIsService && item.quantity <= item.reorder_level;
                  const isOutOfStock = !itemIsService && item.quantity === 0;

                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                        editingId === item.id 
                          ? 'bg-blue-50/60 dark:bg-blue-950/40' 
                          : isOutOfStock 
                          ? 'bg-red-50/20 dark:bg-red-950/20' 
                          : ''
                      }`}
                    >
                      {/* Title & Details */}
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{item.title}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300">{item.barcode}</span>
                          <span>•</span>
                          <span className="capitalize">{item.category.toLowerCase()}</span>
                          {item.supplier_name && (
                            <>
                              <span>•</span>
                              <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1 font-medium">
                                <Truck className="w-3 h-3" />
                                {item.supplier_name}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Pricing */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm text-gray-900 dark:text-gray-100 ${discount > 0 ? 'line-through opacity-50' : 'font-medium'}`}>
                          Rs. {item.selling_price.toFixed(2)}
                        </div>
                        {discount > 0 && (
                          <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
                            Rs. {finalSellingPrice.toFixed(2)} 
                            <span className="text-xs text-red-500 dark:text-red-400 ml-1 font-normal">(-{discount}%)</span>
                          </div>
                        )}
                        <div className="text-xs text-gray-400 dark:text-gray-500">Cost: Rs. {item.cost_price.toFixed(2)}</div>
                        {item.batches && item.batches.length > 1 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.batches.map((b, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                                title={`Batch: ${b.remaining_qty} in stock at Rs. ${b.selling_price.toFixed(2)} (Cost: Rs. ${b.unit_cost.toFixed(2)})`}
                              >
                                {b.remaining_qty} @ Rs. {b.selling_price.toFixed(2)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Margin */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 inline-flex text-xs font-semibold rounded-full border ${
                          margin >= 0 
                            ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800' 
                            : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800'
                        }`}>
                          +Rs. {margin.toFixed(2)}
                        </span>
                      </td>

                      {/* Stock Level */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {itemIsService ? (
                          <div>
                            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              Service (Unlimited)
                            </span>
                            <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">No stock tracking</div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold ${
                                isOutOfStock 
                                  ? 'text-red-700 dark:text-red-400' 
                                  : isLowStock 
                                  ? 'text-amber-600 dark:text-amber-400' 
                                  : 'text-gray-900 dark:text-gray-100'
                              }`}>
                                {item.quantity} in stock
                              </span>
                              
                              {isOutOfStock ? (
                                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                                  Out of stock
                                </span>
                              ) : isLowStock ? (
                                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1" title={`Reorder threshold is ${item.reorder_level}`}>
                                  <AlertTriangle className="w-3 h-3" /> Low
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Reorder alert: {item.reorder_level}</div>
                          </>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleEdit(item)} 
                            className="p-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                            title="Edit Item"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(item)} 
                            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                            title="Delete Item"
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

          {/* Table Footer with Pagination Controls */}
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex flex-wrap justify-between items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-3">
              <span>
                Showing {filteredInventory.length === 0 ? 0 : (pageSize === 'ALL' ? 1 : (currentPage - 1) * pageSize + 1)} - {pageSize === 'ALL' ? filteredInventory.length : Math.min(currentPage * pageSize, filteredInventory.length)} of {filteredInventory.length} items
                {filteredInventory.length !== inventory.length && ` (filtered from ${inventory.length})`}
              </span>
              <div className="flex items-center gap-1 bg-gray-200 dark:bg-gray-700 rounded-lg p-0.5">
                {[25, 50, 100, 'ALL' as const].map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setPageSize(size)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                      pageSize === size
                        ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {pageSize !== 'ALL' && totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer disabled:cursor-not-allowed transition-colors"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-bold text-gray-700 dark:text-gray-300">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-1 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer disabled:cursor-not-allowed transition-colors"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <span>Total Retail Valuation: Rs. {totalStockValueRetail.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>

        </div>

      </div>

      {/* Excel / CSV Import Preview Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-gray-100 dark:border-gray-700 flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-emerald-700 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-emerald-200" />
                <h3 className="font-bold text-lg">Preview Excel Stock Import</h3>
              </div>
              <button 
                onClick={() => { setIsImportModalOpen(false); setImportPreview([]); }}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800">
                <div>
                  <span className="text-emerald-900 dark:text-emerald-200 font-bold block">
                    Found {importPreview.length} inventory records
                  </span>
                  <span className="text-xs text-emerald-700 dark:text-emerald-300">
                    Existing barcodes will be updated; new barcodes will be created.
                  </span>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="text-xs text-emerald-800 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-emerald-100 font-bold flex items-center gap-1 underline cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Template
                </button>
              </div>

              {/* Preview Table */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold text-gray-500 dark:text-gray-400">Barcode</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-500 dark:text-gray-400">Title</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-500 dark:text-gray-400">Cat</th>
                      <th className="px-3 py-2 text-right font-bold text-gray-500 dark:text-gray-400">Cost</th>
                      <th className="px-3 py-2 text-right font-bold text-gray-500 dark:text-gray-400">Selling</th>
                      <th className="px-3 py-2 text-right font-bold text-gray-500 dark:text-gray-400">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                    {importPreview.slice(0, 8).map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">{item.barcode}</td>
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 truncate max-w-[180px]">{item.title}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{item.category}</td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">Rs. {item.cost_price.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900 dark:text-gray-100">Rs. {item.selling_price.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">{item.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importPreview.length > 8 && (
                <p className="text-center text-xs text-gray-400 dark:text-gray-500">...and {importPreview.length - 8} more items</p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <button
                onClick={() => { setIsImportModalOpen(false); setImportPreview([]); }}
                className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importing}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-sm transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {importing ? 'Importing...' : `Confirm & Import ${importPreview.length} Items`}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Import Error Alert if any */}
      {importError && (
        <div className="fixed bottom-6 right-6 z-50 bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 text-sm animate-in fade-in slide-in-from-bottom-4">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{importError}</span>
          <button onClick={() => setImportError(null)} className="ml-2 hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

    </div>
  );
}
