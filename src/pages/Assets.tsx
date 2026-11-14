import { useState, useEffect } from 'react';
import { db, type Asset } from '../db';
import { Plus, Monitor, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '../components/Toast';
import { Skeleton, EmptyState } from '../components/Skeleton';

export default function Assets() {
  const toast = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssets = async () => {
    try {
      const res = await db.assets.getAll();
      setAssets(res.data ?? []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load assets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const [formData, setFormData] = useState({
    asset_name: '',
    cost_value: '',
    purchase_date: new Date().toISOString().split('T')[0],
    condition: 'GOOD'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await db.assets.upsert({
        asset_name: formData.asset_name,
        cost_value: parseFloat(formData.cost_value),
        purchase_date: formData.purchase_date,
        condition: formData.condition,
      });
      toast.success(`"${formData.asset_name}" recorded.`, 'Asset added');
      setFormData({ ...formData, asset_name: '', cost_value: '', condition: 'GOOD' });
      fetchAssets();
    } catch (error) {
      console.error(error);
      toast.error('Failed to add asset.');
    }
  };

  const totalAssetsValue = assets?.reduce((sum, asset) => sum + asset.cost_value, 0) || 0;

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center">
          <Monitor className="mr-3 text-blue-600 dark:text-blue-400" />
          Assets & Shop Fixtures
        </h2>
        <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 font-bold text-lg text-gray-900 dark:text-gray-100">
          Total Net Worth: <span className="text-blue-600 dark:text-blue-400">Rs. {totalAssetsValue.toFixed(2)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-8 flex-1 overflow-hidden">

        {/* Left Side: Add Asset Form */}
        <div className="col-span-1 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 border-b border-gray-100 dark:border-gray-700 pb-2">Record New Asset</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Asset Name</label>
              <input required placeholder="e.g. Glass Display Counter" type="text" value={formData.asset_name} onChange={e => setFormData({...formData, asset_name: e.target.value})} className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cost / Value</label>
              <input required type="number" step="0.01" value={formData.cost_value} onChange={e => setFormData({...formData, cost_value: e.target.value})} className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Purchase Date</label>
              <input required type="date" value={formData.purchase_date} onChange={e => setFormData({...formData, purchase_date: e.target.value})} className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Physical Condition</label>
              <select value={formData.condition} onChange={e => setFormData({...formData, condition: e.target.value})} className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:ring-2 focus:ring-blue-500">
                <option value="EXCELLENT">Excellent</option>
                <option value="GOOD">Good</option>
                <option value="REPAIR">Needs Repair</option>
              </select>
            </div>

            <button type="submit" className="w-full mt-4 flex justify-center items-center py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors">
              <Plus className="w-5 h-5 mr-2" /> Record Asset
            </button>
          </form>
        </div>

        {/* Right Side: Assets Table */}
        <div className="col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Asset Details</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date Acquired</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Condition</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Valuation</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {loading && (
                  <>
                    {[0,1,2].map(r => (
                      <tr key={r}>
                        {[0,1,2,3].map(c => <td key={c} className="px-6 py-4"><Skeleton className="h-5 w-full" /></td>)}
                      </tr>
                    ))}
                  </>
                )}
                {!loading && assets?.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState
                        icon={<Monitor className="w-12 h-12" />}
                        title="No assets recorded yet"
                        subtitle="Add shop fixtures like racks, counters, or printers to track their value."
                      />
                    </td>
                  </tr>
                )}
                {!loading && assets?.map((asset) => (
                  <tr key={asset.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 font-bold text-gray-900 dark:text-gray-100">{asset.asset_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{asset.purchase_date}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${asset.condition === 'REPAIR' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                        {asset.condition === 'REPAIR' ? <AlertCircle className="w-3 h-3 mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                        {asset.condition}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-gray-100">Rs. {asset.cost_value.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
