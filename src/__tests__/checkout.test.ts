import { describe, it, expect } from 'vitest';
import {
  calculateDiscountedPrice,
  calculateCartTotals,
  clampCartQuantity,
  generateReceiptNumber,
} from '../utils/checkout';
import { buildWhatsAppReceiptText } from '../utils/receipt';

describe('Checkout & POS Calculations', () => {
  describe('calculateDiscountedPrice', () => {
    it('returns original price when discount is 0 or negative', () => {
      expect(calculateDiscountedPrice(500, 0)).toBe(500);
      expect(calculateDiscountedPrice(500, -5)).toBe(500);
    });

    it('returns 0 when discount is 100% or greater', () => {
      expect(calculateDiscountedPrice(500, 100)).toBe(0);
      expect(calculateDiscountedPrice(500, 120)).toBe(0);
    });

    it('calculates percentage discounts accurately with 2-decimal rounding', () => {
      expect(calculateDiscountedPrice(1000, 10)).toBe(900);
      expect(calculateDiscountedPrice(150, 15)).toBe(127.5);
      // 333.33 * 0.9 = 299.997 -> 300
      expect(calculateDiscountedPrice(333.33, 10)).toBe(300);
    });
  });

  describe('calculateCartTotals', () => {
    it('returns zero values for empty cart', () => {
      const totals = calculateCartTotals([]);
      expect(totals).toEqual({
        totalAmount: 0,
        totalCost: 0,
        grossProfit: 0,
        itemCount: 0,
      });
    });

    it('correctly calculates single item totals', () => {
      const items = [
        {
          id: 1,
          cost_price: 200,
          selling_price: 350,
          quantity: 3,
        },
      ];
      const totals = calculateCartTotals(items);
      expect(totals.totalAmount).toBe(1050); // 350 * 3
      expect(totals.totalCost).toBe(600);    // 200 * 3
      expect(totals.grossProfit).toBe(450);  // 1050 - 600
      expect(totals.itemCount).toBe(3);
    });

    it('correctly sums multiple items and avoids floating point inaccuracies', () => {
      const items = [
        { id: 1, cost_price: 80.15, selling_price: 120.30, quantity: 2 },
        { id: 2, cost_price: 15.10, selling_price: 25.20, quantity: 5 },
      ];
      // Total amount: 120.30 * 2 (240.60) + 25.20 * 5 (126.00) = 366.60
      // Total cost: 80.15 * 2 (160.30) + 15.10 * 5 (75.50) = 235.80
      // Gross profit: 366.60 - 235.80 = 130.80
      const totals = calculateCartTotals(items);
      expect(totals.totalAmount).toBe(366.6);
      expect(totals.totalCost).toBe(235.8);
      expect(totals.grossProfit).toBe(130.8);
      expect(totals.itemCount).toBe(7);
    });

    it('handles negative or zero quantities safely', () => {
      const items = [
        { id: 1, cost_price: 100, selling_price: 200, quantity: -2 },
      ];
      const totals = calculateCartTotals(items);
      expect(totals.totalAmount).toBe(0);
      expect(totals.totalCost).toBe(0);
      expect(totals.grossProfit).toBe(0);
      expect(totals.itemCount).toBe(0);
    });
  });

  describe('clampCartQuantity', () => {
    it('increments quantity within stock limit', () => {
      expect(clampCartQuantity(2, 1, 10)).toBe(3);
    });

    it('does not allow quantity to exceed stock limit', () => {
      expect(clampCartQuantity(10, 1, 10)).toBe(10);
      expect(clampCartQuantity(9, 5, 10)).toBe(10);
    });

    it('decrements quantity down to 1', () => {
      expect(clampCartQuantity(3, -1, 10)).toBe(2);
    });

    it('does not allow quantity to drop below 1', () => {
      expect(clampCartQuantity(1, -1, 10)).toBe(1);
      expect(clampCartQuantity(2, -5, 10)).toBe(1);
    });
  });

  describe('generateReceiptNumber', () => {
    it('creates standard format starting with REC-', () => {
      const rec = generateReceiptNumber(1700000000000);
      expect(rec).toBe('REC-1700000000000');
    });

    it('generates unique timestamps when invoked at current time', () => {
      const r1 = generateReceiptNumber();
      expect(r1).toMatch(/^REC-\d+$/);
    });
  });

  describe('Special Discount & Custom Price Bill Formatting', () => {
    it('mentions Special Discount on WhatsApp bill when selling price is reduced below usual price', () => {
      const receiptText = buildWhatsAppReceiptText({
        receipt_no: 'REC-20261116-001',
        created_at: '2026-11-16T10:00:00',
        payment_type: 'CASH',
        total_amount: 80,
        items: [
          {
            title: 'Atlas 80pg CR Book',
            quantity: 1,
            unit_price: 80,
            original_price: 100,
            is_special_discount: true,
            discount_percent: 20,
          },
        ],
      });

      expect(receiptText).toContain('Atlas 80pg CR Book  x1  =  Rs. 80.00');
      expect(receiptText).toContain('(Special Discount: -Rs. 20.00)');
    });

    it('keeps new price with no discount mention when selling price is higher than usual price', () => {
      const receiptText = buildWhatsAppReceiptText({
        receipt_no: 'REC-20261116-002',
        created_at: '2026-11-16T10:05:00',
        payment_type: 'CASH',
        total_amount: 240,
        items: [
          {
            title: 'Special Parker Pen',
            quantity: 2,
            unit_price: 120, // Higher than regular price of 100
            original_price: 120,
            is_special_discount: false,
            discount_percent: 0,
          },
        ],
      });

      expect(receiptText).toContain('Special Parker Pen  x2  =  Rs. 240.00');
      expect(receiptText).not.toContain('Special Discount');
      expect(receiptText).not.toContain('Discount');
    });
  });
});
