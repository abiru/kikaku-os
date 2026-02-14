import { describe, expect, it } from 'vitest';
import { buildStoreOrderUrl, resolveCheckoutOrderToken } from './checkoutSuccess';

describe('checkout success helpers', () => {
  it('resolves valid public tokens only', () => {
    expect(resolveCheckoutOrderToken('AbC123def456GhI789jKl012')).toBe('AbC123def456GhI789jKl012');
    expect(resolveCheckoutOrderToken('12345')).toBeNull();
    expect(resolveCheckoutOrderToken(null)).toBeNull();
  });

  it('builds storefront order API URLs', () => {
    const token = 'AbC123def456GhI789jKl012';
    expect(buildStoreOrderUrl('https://api.example.com/', token)).toBe(
      'https://api.example.com/store/orders/AbC123def456GhI789jKl012'
    );
    expect(buildStoreOrderUrl('https://api.example.com', token, true)).toBe(
      'https://api.example.com/store/orders/AbC123def456GhI789jKl012?poll=true'
    );
  });
});
