import { describe, it, expect } from 'vitest';
import {
  calculateLineItemTax,
  calculateOrderTax,
  formatPriceWithTax,
  getApplicableTaxRate,
  type TaxCalculationInput
} from '../../../services/tax';

describe('Tax Service', () => {
  describe('calculateLineItemTax', () => {
    it('should calculate tax correctly for 10% standard rate', () => {
      const input: TaxCalculationInput = {
        unitPrice: 1100,  // ¥1,100 (tax-inclusive)
        quantity: 1,
        taxRate: 0.10
      };

      const result = calculateLineItemTax(input);

      expect(result).toEqual({
        subtotal: 1000,      // Tax-exclusive amount
        taxAmount: 100,      // Tax amount
        totalAmount: 1100,   // Tax-inclusive amount
        taxRate: 0.10
      });
    });

    it('should calculate tax correctly for 8% reduced rate', () => {
      const input: TaxCalculationInput = {
        unitPrice: 1080,  // ¥1,080 (tax-inclusive)
        quantity: 1,
        taxRate: 0.08
      };

      const result = calculateLineItemTax(input);

      expect(result).toEqual({
        subtotal: 1000,      // Tax-exclusive: 1080 / 1.08 = 1000
        taxAmount: 80,       // Tax: 1080 - 1000 = 80
        totalAmount: 1080,
        taxRate: 0.08
      });
    });

    it('should use floor rounding for subtotal (Japanese standard)', () => {
      const input: TaxCalculationInput = {
        unitPrice: 1001,  // Price that results in fractional subtotal
        quantity: 1,
        taxRate: 0.10
      };

      const result = calculateLineItemTax(input);

      // 1001 / 1.10 = 910.090909...
      // Floor: 910
      expect(result.subtotal).toBe(910);
      expect(result.taxAmount).toBe(91);  // 1001 - 910
      expect(result.totalAmount).toBe(1001);
    });

    it('should calculate correctly with multiple quantities', () => {
      const input: TaxCalculationInput = {
        unitPrice: 550,   // ¥550 per unit (tax-inclusive)
        quantity: 3,
        taxRate: 0.10
      };

      const result = calculateLineItemTax(input);

      // Total: 550 * 3 = 1650
      // Subtotal: floor(1650 / 1.10) = floor(1500) = 1500
      // Tax: 1650 - 1500 = 150
      expect(result).toEqual({
        subtotal: 1500,
        taxAmount: 150,
        totalAmount: 1650,
        taxRate: 0.10
      });
    });

    it('should handle edge case with zero price', () => {
      const input: TaxCalculationInput = {
        unitPrice: 0,
        quantity: 1,
        taxRate: 0.10
      };

      const result = calculateLineItemTax(input);

      expect(result).toEqual({
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
        taxRate: 0.10
      });
    });

    it('should handle large quantities', () => {
      const input: TaxCalculationInput = {
        unitPrice: 110,   // ¥110 per unit
        quantity: 100,
        taxRate: 0.10
      };

      const result = calculateLineItemTax(input);

      // Total: 110 * 100 = 11000
      // Subtotal: floor(11000 / 1.10) = 10000
      // Tax: 11000 - 10000 = 1000
      expect(result).toEqual({
        subtotal: 10000,
        taxAmount: 1000,
        totalAmount: 11000,
        taxRate: 0.10
      });
    });
  });

  describe('calculateOrderTax', () => {
    it('should calculate tax for multiple items with same tax rate', () => {
      const items: TaxCalculationInput[] = [
        { unitPrice: 1100, quantity: 1, taxRate: 0.10 },
        { unitPrice: 550, quantity: 2, taxRate: 0.10 }
      ];

      const result = calculateOrderTax(items);

      // Item 1: subtotal=1000, tax=100, total=1100
      // Item 2: subtotal=1000 (550*2/1.10), tax=100, total=1100
      expect(result.subtotal).toBe(2000);
      expect(result.taxAmount).toBe(200);
      expect(result.totalAmount).toBe(2200);
      expect(result.itemBreakdown).toHaveLength(2);
    });

    it('should calculate tax for mixed tax rates (standard + reduced)', () => {
      const items: TaxCalculationInput[] = [
        { unitPrice: 1100, quantity: 1, taxRate: 0.10 },  // Standard rate
        { unitPrice: 1080, quantity: 1, taxRate: 0.08 }   // Reduced rate
      ];

      const result = calculateOrderTax(items);

      // Item 1 (10%): subtotal=1000, tax=100
      // Item 2 (8%): subtotal=1000, tax=80
      expect(result.subtotal).toBe(2000);
      expect(result.taxAmount).toBe(180);
      expect(result.totalAmount).toBe(2180);
    });

    it('should handle empty cart', () => {
      const items: TaxCalculationInput[] = [];

      const result = calculateOrderTax(items);

      expect(result).toEqual({
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
        itemBreakdown: []
      });
    });

    it('should provide per-item breakdown', () => {
      const items: TaxCalculationInput[] = [
        { unitPrice: 1100, quantity: 1, taxRate: 0.10 },
        { unitPrice: 2200, quantity: 1, taxRate: 0.10 }
      ];

      const result = calculateOrderTax(items);

      expect(result.itemBreakdown[0]).toEqual({
        subtotal: 1000,
        taxAmount: 100,
        totalAmount: 1100,
        taxRate: 0.10
      });

      expect(result.itemBreakdown[1]).toEqual({
        subtotal: 2000,
        taxAmount: 200,
        totalAmount: 2200,
        taxRate: 0.10
      });
    });

    it('should handle rounding correctly across multiple items', () => {
      const items: TaxCalculationInput[] = [
        { unitPrice: 1001, quantity: 1, taxRate: 0.10 },
        { unitPrice: 1002, quantity: 1, taxRate: 0.10 },
        { unitPrice: 1003, quantity: 1, taxRate: 0.10 }
      ];

      const result = calculateOrderTax(items);

      // Each item rounds down independently
      // 1001/1.10 = 910.09... -> 910, tax = 91
      // 1002/1.10 = 910.90... -> 910, tax = 92
      // 1003/1.10 = 911.81... -> 911, tax = 92
      expect(result.subtotal).toBe(910 + 910 + 911);
      expect(result.taxAmount).toBe(91 + 92 + 92);
      expect(result.totalAmount).toBe(1001 + 1002 + 1003);
    });
  });

  describe('formatPriceWithTax', () => {
    it('should format JPY price with tax indicator', () => {
      const formatted = formatPriceWithTax(1100, 'JPY');
      expect(formatted).toBe('￥1,100 (税込)');  // Full-width yen symbol
    });

    it('should format large amounts with commas', () => {
      const formatted = formatPriceWithTax(123456, 'JPY');
      expect(formatted).toBe('￥123,456 (税込)');  // Full-width yen symbol
    });

    it('should handle zero price', () => {
      const formatted = formatPriceWithTax(0, 'JPY');
      expect(formatted).toBe('￥0 (税込)');  // Full-width yen symbol
    });
  });

  describe('getApplicableTaxRate', () => {
    const taxRates = [
      {
        id: 1,
        name: 'Standard Rate',
        rate: 0.10,
        applicable_from: '2019-10-01',
        applicable_to: null,
        is_active: 1
      },
      {
        id: 2,
        name: 'Reduced Rate',
        rate: 0.08,
        applicable_from: '2019-10-01',
        applicable_to: null,
        is_active: 1
      },
      {
        id: 3,
        name: 'Old Rate',
        rate: 0.08,
        applicable_from: '2014-04-01',
        applicable_to: '2019-09-30',
        is_active: 0
      }
    ];

    it('should find active tax rate for current date', () => {
      const rate = getApplicableTaxRate(taxRates, '2026-01-21', 0.10);
      expect(rate).toBeDefined();
      expect(rate?.rate).toBe(0.10);
      expect(rate?.name).toBe('Standard Rate');
    });

    it('should find reduced rate when specified', () => {
      const rate = getApplicableTaxRate(taxRates, '2026-01-21', 0.08);
      expect(rate).toBeDefined();
      expect(rate?.rate).toBe(0.08);
      expect(rate?.name).toBe('Reduced Rate');
    });

    it('should not return inactive rates', () => {
      const rate = getApplicableTaxRate(taxRates, '2015-01-01', 0.08);
      // Even though Old Rate applies to 2015, it's inactive
      expect(rate).toBeUndefined();
    });

    it('should respect applicable_to date range', () => {
      // If we had an active historical rate
      const ratesWithHistory = [
        ...taxRates,
        {
          id: 4,
          name: 'Active Old Rate',
          rate: 0.05,
          applicable_from: '2014-01-01',
          applicable_to: '2019-09-30',
          is_active: 1
        }
      ];

      const rate = getApplicableTaxRate(ratesWithHistory, '2015-01-01', 0.05);
      expect(rate).toBeDefined();
      expect(rate?.rate).toBe(0.05);

      // Should not apply after applicable_to
      const futureRate = getApplicableTaxRate(ratesWithHistory, '2020-01-01', 0.05);
      expect(futureRate).toBeUndefined();
    });

    it('should find any active rate if rateValue not specified', () => {
      const rate = getApplicableTaxRate(taxRates, '2026-01-21');
      expect(rate).toBeDefined();
      expect([0.10, 0.08]).toContain(rate?.rate);
    });
  });
});
