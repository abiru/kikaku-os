import { isPublicToken } from './publicToken';

export const resolveCheckoutOrderToken = (rawToken: string | null): string | null => {
  if (!rawToken) return null;
  return isPublicToken(rawToken) ? rawToken : null;
};

export const buildStoreOrderUrl = (
  apiBase: string,
  orderToken: string,
  poll: boolean = false
): string => {
  const base = apiBase.replace(/\/+$/, '');
  const path = `/store/orders/${encodeURIComponent(orderToken)}`;
  return poll ? `${base}${path}?poll=true` : `${base}${path}`;
};
