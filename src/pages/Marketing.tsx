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
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
      {children}
    </div>
  );

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center">
          <Megaphone className="mr-3 text-blue-600 dark:text-blue-400" />
          Practical Marketing & Analysis
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-8 flex-1 overflow-hidden">

        {/* Deadstock Spotter */}
        <Panel>
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/40 flex items-center">
            <AlertCircle className="text-red-500 mr-2" />
            <h3 className="text-lg font-bold text-red-900 dark:text-red-300">Deadstock Spotter</h3>
          </div>
          <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
            Items sitting on shelves with high quantity and zero recent sales. Recommended action: <strong>"Discount Table" or "Buy 2 for 15% off"</strong>.
          </div>
          <div className="overflow-y-auto flex-1 p-4">
            {loading ? (
              <div className="space-y-3">
                {[0,1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : deadstock.length === 0 ? (
              <EmptyState icon={<TrendingUp className="w-10 h-10" />} title="No deadstock detected!" subtitle="Inventory is moving well." />
            ) : (
              <ul className="space-y-3">
                {deadstock.map(item => (
                  <li key={item.id} className="p-4 border border-red-100 dark:border-red-900/40 rounded-lg bg-red-50/30 dark:bg-red-900/10 flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-gray-100">{item.title}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{item.barcode}</p>
                    </div>
                    <div className="text-right">
                      <span className="block font-bold text-red-600 dark:text-red-400">{item.quantity} Units Stuck</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Value: Rs. {(item.cost_price * item.quantity).toFixed(2)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {/* Top Sellers */}
        <Panel>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border-b border-green-100 dark:border-green-900/40 flex items-center">
            <TrendingUp className="text-green-600 mr-2" />
            <h3 className="text-lg font-bold text-green-900 dark:text-green-300">Top-Selling Titles</h3>
          </div>
          <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
            Your fastest moving products. Make sure these never drop below the reorder threshold.
          </div>
          <div className="overflow-y-auto flex-1 p-4">
            {loading ? (
              <div className="space-y-3">
                {[0,1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : topSellers.length === 0 ? (
              <EmptyState icon={<TrendingUp className="w-10 h-10" />} title="No sales data yet" subtitle="Top sellers will appear once you make a few sales." />
            ) : (
              <ul className="space-y-3">
                {topSellers.map(item => (
                  <li key={item.id} className="p-4 border border-green-100 dark:border-green-900/40 rounded-lg bg-green-50/30 dark:bg-green-900/10 flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-gray-100">{item.title}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Margin: Rs. {(item.selling_price - item.cost_price).toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <span className="block font-bold text-green-700 dark:text-green-400">{item.sold_qty} Sold</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{item.quantity} Left in Stock</span>
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
