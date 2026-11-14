export interface CartCalculationItem {
  id?: number;
  cost_price: number;
  selling_price: number;
  quantity: number;
  stock_limit?: number;
  discount_percent?: number;
}

export interface CartTotals {
  totalAmount: number;
  totalCost: number;
  grossProfit: number;
  itemCount: number;
}

/**
 * Calculates net selling price of an item given base price and discount percentage
 */
export function calculateDiscountedPrice(basePrice: number, discountPercent: number = 0): number {
  if (discountPercent <= 0) return basePrice;
  if (discountPercent >= 100) return 0;
  const discounted = basePrice * (1 - discountPercent / 100);
  return Math.round(discounted * 100) / 100;
}

/**
 * Calculates checkout totals: total revenue, total cost, gross profit, and total quantity
 */
export function calculateCartTotals(items: CartCalculationItem[]): CartTotals {
  let totalAmount = 0;
  let totalCost = 0;
  let itemCount = 0;

  for (const item of items) {
    const qty = Math.max(0, item.quantity);
    const itemTotal = item.selling_price * qty;
    const itemCost = item.cost_price * qty;

    totalAmount += itemTotal;
    totalCost += itemCost;
    itemCount += qty;
  }

  // Round to 2 decimal places to avoid floating point precision issues
  totalAmount = Math.round(totalAmount * 100) / 100;
  totalCost = Math.round(totalCost * 100) / 100;
  const grossProfit = Math.round((totalAmount - totalCost) * 100) / 100;

  return {
    totalAmount,
    totalCost,
    grossProfit,
    itemCount,
  };
}

/**
 * Validates stock quantity adjustment within bounds [1, stock_limit]
 */
export function clampCartQuantity(currentQty: number, delta: number, stockLimit: number): number {
  const target = currentQty + delta;
  return Math.max(1, Math.min(stockLimit, target));
}

/**
 * Generates standard POS receipt identifier
 */
export function generateReceiptNumber(timestamp: number = Date.now()): string {
  return `REC-${timestamp}`;
}
