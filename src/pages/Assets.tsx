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
    <div className="p-6 lg:p-8 h-full flex flex-col space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900/50">
              <Monitor className="w-4 h-4" />
            </div>
            <span>Assets & Shop Fixtures</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Track physical bookstore property, furniture, display racks, and electronic equipment
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 px-3.5 py-1.5 rounded-lg shadow-2xs border border-slate-200/90 dark:border-slate-800/90 text-xs font-mono">
          <span className="text-slate-500 dark:text-slate-400 font-sans">Total Asset Valuation: </span>
          <span className="font-bold text-blue-600 dark:text-blue-400 ml-1 tabular-nums">Rs. {totalAssetsValue.toFixed(2)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 flex-1 overflow-hidden">

        {/* Left Side: Add Asset Form */}
        <div className="col-span-1 bg-white dark:bg-slate-900 p-5 rounded-xl shadow-2xs border border-slate-200/90 dark:border-slate-800/90 flex flex-col">
          <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-3.5 border-b border-slate-200 dark:border-slate-800 pb-2.5">
            Record New Asset
          </h3>
          <form onSubmit={handleSubmit} className="space-y-3 flex-1">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Asset Name</label>
              <input required placeholder="e.g. Glass Display Counter" type="text" value={formData.asset_name} onChange={e => setFormData({...formData, asset_name: e.target.value})} className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-xs focus:outline-none focus:border-blue-600" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Cost / Value (Rs.)</label>
              <input required type="number" step="0.01" value={formData.cost_value} onChange={e => setFormData({...formData, cost_value: e.target.value})} className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-xs font-mono focus:outline-none focus:border-blue-600" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Purchase Date</label>
              <input required type="date" value={formData.purchase_date} onChange={e => setFormData({...formData, purchase_date: e.target.value})} className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-xs font-mono focus:outline-none focus:border-blue-600" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Physical Condition</label>
              <select value={formData.condition} onChange={e => setFormData({...formData, condition: e.target.value})} className="w-full px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg text-xs focus:outline-none focus:border-blue-600">
                <option value="EXCELLENT">Excellent</option>
                <option value="GOOD">Good</option>
                <option value="REPAIR">Needs Repair</option>
              </select>
            </div>

            <button type="submit" className="w-full mt-2 flex justify-center items-center py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-semibold text-xs transition-colors shadow-xs cursor-pointer">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Record Asset
            </button>
          </form>
        </div>

        {/* Right Side: Assets Table */}
        <div className="col-span-1 lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-slate-200/90 dark:border-slate-800/90 overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              <thead className="bg-slate-50/80 dark:bg-slate-950/50 sticky top-0 z-10 backdrop-blur-xs">
                <tr>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Asset Details</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date Acquired</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Condition</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Valuation</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                {loading && (
                  <>
                    {[0,1,2].map(r => (
                      <tr key={r}>
                        {[0,1,2,3].map(c => <td key={c} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}
                      </tr>
                    ))}
                  </>
                )}
                {!loading && assets?.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState
                        icon={<Monitor className="w-10 h-10" />}
                        title="No assets recorded yet"
                        subtitle="Add shop fixtures like racks, counters, or printers to track their value."
                      />
                    </td>
                  </tr>
                )}
                {!loading && assets?.map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3 font-semibold text-slate-900 dark:text-slate-100 text-xs">{asset.asset_name}</td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400 font-mono text-xs">{asset.purchase_date}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        asset.condition === 'REPAIR' 
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200 dark:border-rose-900/40' 
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40'
                      }`}>
                        {asset.condition === 'REPAIR' ? <AlertCircle className="w-3 h-3 mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                        {asset.condition}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">Rs. {asset.cost_value.toFixed(2)}</td>
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
