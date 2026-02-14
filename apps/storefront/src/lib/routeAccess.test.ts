import { describe, expect, it } from 'vitest';
import { isLoginPath, isProtectedPath } from './routeAccess';

describe('route access rules', () => {
  it('marks admin/account pages as protected', () => {
    expect(isProtectedPath('/admin')).toBe(true);
    expect(isProtectedPath('/admin/orders/1')).toBe(true);
    expect(isProtectedPath('/account/orders')).toBe(true);
  });

  it('marks admin proxy APIs as protected', () => {
    expect(isProtectedPath('/api/admin/orders')).toBe(true);
    expect(isProtectedPath('/api/inbox/1/approve')).toBe(true);
    expect(isProtectedPath('/api/r2')).toBe(true);
  });

  it('does not mark storefront public routes as protected', () => {
    expect(isProtectedPath('/')).toBe(false);
    expect(isProtectedPath('/products')).toBe(false);
    expect(isProtectedPath('/store/orders/abc123')).toBe(false);
  });

  it('keeps login pages publicly accessible', () => {
    expect(isLoginPath('/admin/login')).toBe(true);
    expect(isLoginPath('/sign-in')).toBe(true);
    expect(isLoginPath('/sign-up')).toBe(true);
    expect(isLoginPath('/admin/orders')).toBe(false);
  });
});
