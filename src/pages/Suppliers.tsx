import { useState, useEffect } from 'react';
import { db, type Supplier } from '../db';
import { Plus, Truck, Phone } from 'lucide-react';
import { useToast } from '../components/Toast';
import { Skeleton, EmptyState } from '../components/Skeleton';

export default function Suppliers() {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

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

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await db.suppliers.upsert({ name: formData.name, phone: formData.phone, notes: formData.notes });
      toast.success(`"${formData.name}" saved.`, 'Supplier added');
      setFormData({ name: '', phone: '', notes: '' });
      fetchSuppliers();
    } catch (error) {
      console.error(error);
      toast.error('Failed to add supplier.');
    }
  };

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center">
          <Truck className="mr-3 text-blue-600 dark:text-blue-400" />
          Supplier Directory
        </h2>
      </div>

      <div className="grid grid-cols-3 gap-8 flex-1 overflow-hidden">

        {/* Left Side: Add Supplier Form */}
        <div className="col-span-1 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 border-b border-gray-100 dark:border-gray-700 pb-2">Add Distributor</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company / Rep Name</label>
              <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
              <input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Terms / Notes</label>
              <textarea rows={3} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="e.g. Net 30 terms, drops off every Tuesday" className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:ring-2 focus:ring-blue-500" />
            </div>

            <button type="submit" className="w-full mt-4 flex justify-center items-center py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors">
              <Plus className="w-5 h-5 mr-2" /> Save Supplier
            </button>
          </form>
        </div>

        {/* Right Side: Suppliers List */}
        <div className="col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 overflow-y-auto">
          {loading ? (
            <div className="grid grid-cols-2 gap-4">
              {[0,1,2,3].map(i => (
                <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : suppliers?.length === 0 ? (
            <EmptyState
              icon={<Truck className="w-12 h-12" />}
              title="No suppliers added yet"
              subtitle="Add book distributors and stationery wholesalers to link them with inventory."
            />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {suppliers?.map(supplier => (
                <div key={supplier.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-300 dark:hover:border-blue-600 transition-colors">
                  <h4 className="font-bold text-lg text-gray-800 dark:text-gray-100 mb-1">{supplier.name}</h4>
                  <div className="flex items-center text-gray-600 dark:text-gray-300 text-sm mb-3">
                    <Phone className="w-4 h-4 mr-2" />
                    {supplier.phone || 'No phone provided'}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-2 rounded">{supplier.notes || 'No specific terms.'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
