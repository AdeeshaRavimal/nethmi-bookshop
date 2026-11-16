import { useState, useEffect } from 'react';
import { db, type InventoryItem, type SaleItem } from '../db';
import { Megaphone, AlertCircle, TrendingUp } from 'lucide-react';
import { Skeleton, EmptyState } from '../components/Skeleton';

export default function Marketing() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [invRes, saleRes] = await Promise.all([
          db.inventory.getAll(),
          db.saleItems.getAll(),
        ]);
        setInventory(invRes.data ?? []);
        setSaleItems(saleRes.data ?? []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Calculate top selling and deadstock
  const salesMap: Record<number, number> = {};
  saleItems?.forEach(item => {
    salesMap[item.product_id] = (salesMap[item.product_id] || 0) + item.quantity;
  });

  // Items sitting on shelves (high quantity, low sales volume relative to stock)
  const deadstock = inventory?.filter(i => {
    const sold = salesMap[i.id!] || 0;
    return i.quantity > 5 && sold === 0; // Simple heuristic for mockup
  }).sort((a, b) => b.quantity - a.quantity) || [];

  // Top Sellers
  const topSellers = inventory?.map(i => ({
    ...i,
    sold_qty: salesMap[i.id!] || 0
  })).filter(i => i.sold_qty > 0).sort((a, b) => b.sold_qty - a.sold_qty).slice(0, 5) || [];

  const Panel = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-slate-200/90 dark:border-slate-800/90 flex flex-col overflow-hidden">
      {children}
    </div>
  );

  return (
    <div className="p-6 lg:p-8 h-full flex flex-col space-y-5">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900/50">
              <Megaphone className="w-4 h-4" />
            </div>
            <span>Practical Marketing & Inventory Velocity</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Identify slow-moving deadstock to clear out and protect high-velocity bestsellers
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 flex-1 overflow-hidden">

        {/* Deadstock Spotter */}
        <Panel>
          <div className="p-4 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-md">
                <AlertCircle className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Deadstock Spotter</h3>
            </div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold font-mono">{deadstock.length} Titles</span>
          </div>
          <div className="px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            Items sitting on shelves with high quantity and zero recent sales. Action: <strong>"Discount Table" or bundle offer</strong>.
          </div>
          <div className="overflow-y-auto flex-1 p-4">
            {loading ? (
              <div className="space-y-2.5">
                {[0,1,2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : deadstock.length === 0 ? (
              <EmptyState icon={<TrendingUp className="w-8 h-8" />} title="No deadstock detected!" subtitle="Inventory is moving well." />
            ) : (
              <ul className="space-y-2">
                {deadstock.map(item => (
                  <li key={item.id} className="p-3 border border-slate-200/80 dark:border-slate-800 rounded-lg bg-slate-50/40 dark:bg-slate-950/30 flex justify-between items-center">
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-xs">{item.title}</h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{item.barcode}</p>
                    </div>
                    <div className="text-right font-mono">
                      <span className="block font-bold text-rose-600 dark:text-rose-400 text-xs tabular-nums">{item.quantity} Units Stuck</span>
                      <span className="text-[10px] text-slate-400 tabular-nums">Valuation: Rs. {(item.cost_price * item.quantity).toFixed(2)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {/* Top Sellers */}
        <Panel>
          <div className="p-4 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-md">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Top-Selling Titles</h3>
            </div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold font-mono">Top Velocity</span>
          </div>
          <div className="px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            Your fastest moving products. Ensure these items never drop below the reorder threshold.
          </div>
          <div className="overflow-y-auto flex-1 p-4">
            {loading ? (
              <div className="space-y-2.5">
                {[0,1,2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : topSellers.length === 0 ? (
              <EmptyState icon={<TrendingUp className="w-8 h-8" />} title="No sales data yet" subtitle="Top sellers will appear once you make a few sales." />
            ) : (
              <ul className="space-y-2">
                {topSellers.map(item => (
                  <li key={item.id} className="p-3 border border-slate-200/80 dark:border-slate-800 rounded-lg bg-slate-50/40 dark:bg-slate-950/30 flex justify-between items-center">
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-xs">{item.title}</h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">Unit Margin: Rs. {(item.selling_price - item.cost_price).toFixed(2)}</p>
                    </div>
                    <div className="text-right font-mono">
                      <span className="block font-bold text-blue-600 dark:text-blue-400 text-xs tabular-nums">{item.sold_qty} Sold</span>
                      <span className="text-[10px] text-slate-400 tabular-nums">{item.quantity} in stock</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

      </div>
    </div>
  );
}
