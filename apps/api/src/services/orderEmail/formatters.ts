import type { ShippingAddress } from './types';

export const parseShippingAddress = (metadata: string | null): ShippingAddress | null => {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    return parsed.shipping || null;
  } catch {
    return null;
  }
};

export const formatDate = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

export const formatCurrency = (amount: number, currency: string): string => {
  if (currency === 'JPY') {
    return amount.toLocaleString('ja-JP');
  }
  return `${amount.toLocaleString()} ${currency}`;
};
