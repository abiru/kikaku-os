import { describe, expect, it } from 'vitest';
import { buildStoreOrderUrl, resolveCheckoutOrderToken } from './checkoutSuccess';

describe('checkout success helpers', () => {
  const validToken = 'PublicTokenExample1234';

  it('resolves valid public tokens only', () => {
    expect(resolveCheckoutOrderToken(validToken)).toBe(validToken);
    expect(resolveCheckoutOrderToken('12345')).toBeNull();
    expect(resolveCheckoutOrderToken(null)).toBeNull();
  });

  it('builds storefront order API URLs', () => {
    expect(buildStoreOrderUrl('https://api.example.com/', validToken)).toBe(
      'https://api.example.com/store/orders/PublicTokenExample1234'
    );
    expect(buildStoreOrderUrl('https://api.example.com', validToken, true)).toBe(
      'https://api.example.com/store/orders/PublicTokenExample1234?poll=true'
    );
  });
});
