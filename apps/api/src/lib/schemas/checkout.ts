/**
 * Shared checkout types and validation used by checkout and quotation routes.
 */

export type CheckoutItem = {
  variantId: number;
  quantity: number;
};

export type VariantPriceRow = {
  variant_id: number;
  variant_title: string;
  product_id: number;
  product_title: string;
  price_id: number;
  amount: number;
  currency: string;
  provider_price_id: string | null;
  provider_product_id: string | null;
};

export const validateItem = (item: unknown): CheckoutItem | null => {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const variantId = Number(obj.variantId);
  const quantity = Number(obj.quantity ?? 1);
  if (!Number.isInteger(variantId) || variantId <= 0) return null;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return null;
  return { variantId, quantity };
};
