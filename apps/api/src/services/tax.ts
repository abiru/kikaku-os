/**
 * Tax Calculation Service
 *
 * Pure functions for Japanese consumption tax calculations.
 * All prices are tax-inclusive (税込).
 *
 * Japanese Tax Rules:
 * - Tax amounts are rounded down (Math.floor)
 * - Tax is calculated per line item, then summed
 * - Standard rate: 10% (since 2019-10-01)
 * - Reduced rate: 8% (food/beverages)
 */

export type TaxCalculationInput = {
  unitPrice: number;     // Tax-inclusive price (INTEGER)
  quantity: number;
  taxRate: number;       // e.g., 0.10 for 10%, 0.08 for 8%
};

export type TaxCalculationResult = {
  subtotal: number;      // Tax-exclusive amount
  taxAmount: number;     // Tax amount
  totalAmount: number;   // Tax-inclusive amount (same as unitPrice * quantity)
  taxRate: number;
};

export type OrderTaxCalculation = {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  itemBreakdown: TaxCalculationResult[];
};

/**
 * Calculate tax for a single line item
 *
 * Input price is tax-inclusive. We reverse-calculate the tax-exclusive subtotal.
 * Japanese convention: round down (floor) the subtotal.
 *
 * Formula:
 *   totalIncludingTax = unitPrice × quantity
 *   subtotal = floor(totalIncludingTax / (1 + taxRate))
 *   taxAmount = totalIncludingTax - subtotal
 *
 * Example (10% tax):
 *   unitPrice = ¥1,100 (tax-inclusive)
 *   quantity = 1
 *   taxRate = 0.10
 *
 *   totalIncludingTax = 1100
 *   subtotal = floor(1100 / 1.10) = floor(1000) = 1000
 *   taxAmount = 1100 - 1000 = 100
 *
 * @param input - Line item details with tax-inclusive price
 * @returns Tax breakdown for the line item
 */
export const calculateLineItemTax = (input: TaxCalculationInput): TaxCalculationResult => {
  const { unitPrice, quantity, taxRate } = input;

  const totalIncludingTax = unitPrice * quantity;

  // Use integer arithmetic to avoid floating point precision issues
  // For 10% tax: subtotal = floor(total * 100 / 110)
  // For 8% tax: subtotal = floor(total * 100 / 108)
  const taxRatePercent = Math.round(taxRate * 100);
  const subtotal = Math.floor((totalIncludingTax * 100) / (100 + taxRatePercent));
  const taxAmount = totalIncludingTax - subtotal;

  return {
    subtotal,
    taxAmount,
    totalAmount: totalIncludingTax,
    taxRate
  };
};

/**
 * Calculate total tax across multiple line items
 *
 * Calculates tax for each line item individually, then sums them.
 * This ensures proper rounding behavior per Japanese tax regulations.
 *
 * @param items - Array of line items to calculate tax for
 * @returns Total tax breakdown with per-item details
 */
export const calculateOrderTax = (items: TaxCalculationInput[]): OrderTaxCalculation => {
  const itemBreakdown = items.map(calculateLineItemTax);

  return {
    subtotal: itemBreakdown.reduce((sum, item) => sum + item.subtotal, 0),
    taxAmount: itemBreakdown.reduce((sum, item) => sum + item.taxAmount, 0),
    totalAmount: itemBreakdown.reduce((sum, item) => sum + item.totalAmount, 0),
    itemBreakdown
  };
};

/**
 * Format price with tax indicator (税込)
 *
 * All products in the system use tax-inclusive pricing.
 *
 * @param amount - Price amount (INTEGER)
 * @param currency - Currency code (e.g., 'JPY')
 * @returns Formatted price string with tax indicator
 */
export const formatPriceWithTax = (amount: number, currency: string): string => {
  const formatter = new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0
  });

  return `${formatter.format(amount)} (税込)`;
};

/**
 * Get the active tax rate for a given date
 *
 * Finds the tax rate applicable on a specific date based on
 * applicable_from and applicable_to dates.
 *
 * @param taxRates - Array of tax rates from database
 * @param date - Date to check (YYYY-MM-DD format)
 * @param rateValue - Optional specific rate value to find (e.g., 0.10)
 * @returns The applicable tax rate, or undefined if not found
 */
export const getApplicableTaxRate = (
  taxRates: Array<{
    id: number;
    name: string;
    rate: number;
    applicable_from: string;
    applicable_to: string | null;
    is_active: number;
  }>,
  date: string,
  rateValue?: number
): typeof taxRates[0] | undefined => {
  const targetDate = new Date(date);

  return taxRates.find(rate => {
    // Skip inactive rates
    if (!rate.is_active) return false;

    // Check if rate value matches (if specified)
    if (rateValue !== undefined && rate.rate !== rateValue) return false;

    // Check if date is within applicable range
    const from = new Date(rate.applicable_from);
    const to = rate.applicable_to ? new Date(rate.applicable_to) : null;

    const isAfterStart = targetDate >= from;
    const isBeforeEnd = !to || targetDate <= to;

    return isAfterStart && isBeforeEnd;
  });
};
