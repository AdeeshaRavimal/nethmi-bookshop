export interface CartItem {
  lineId: string;
  id?: number;
  barcode: string;
  category?: string;
  title: string;
  selling_price: number;
  cost_price: number;
  quantity: number;
  stock_limit: number;
  discount_percent?: number;
  original_price?: number;
  catalog_price?: number;
  is_special_discount?: boolean;
}

export function addCartItem(cart: CartItem[], item: Omit<CartItem, 'lineId'>): CartItem[] {
  const sameProduct = (line: CartItem) => item.id != null ? line.id === item.id : line.barcode === item.barcode;
  const service = item.category === 'SERVICE' || item.barcode.startsWith('SRV-');
  const samePriceStock = (line: CartItem) => sameProduct(line) &&
    (line.original_price ?? line.selling_price) === (item.original_price ?? item.selling_price);
  if (!service && cart.filter(samePriceStock).reduce((sum, line) => sum + line.quantity, 0) + item.quantity > item.stock_limit) return cart;
  const existing = cart.find(line => sameProduct(line) && line.title === item.title &&
    line.selling_price === item.selling_price && line.cost_price === item.cost_price &&
    (line.discount_percent || 0) === (item.discount_percent || 0) && line.original_price === item.original_price);
  if (existing) return cart.map(line => line.lineId === existing.lineId ? { ...line, quantity: line.quantity + item.quantity } : line);
  return [...cart, {
    ...item,
    catalog_price: item.catalog_price ?? item.original_price ?? item.selling_price,
    lineId: crypto.randomUUID()
  }];
}
