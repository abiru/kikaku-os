import { test, expect } from '@playwright/test';

const apiBase = process.env.E2E_API_BASE ?? 'http://localhost:8787';
const adminKey = process.env.ADMIN_API_KEY ?? 'CHANGE_ME';

test.describe('API auth: admin endpoints require x-admin-key', () => {
  test('GET /inbox returns 401 without admin key', async ({ request }) => {
    const res = await request.get(`${apiBase}/inbox`);
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test('GET /inbox returns 200 with valid admin key', async ({ request }) => {
    const res = await request.get(`${apiBase}/inbox`, {
      headers: { 'x-admin-key': adminKey },
    });
    expect(res.status()).toBe(200);
  });

  test('GET /reports/daily returns 401 without admin key', async ({
    request,
  }) => {
    const res = await request.get(
      `${apiBase}/reports/daily?date=2026-01-15`
    );
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test('GET /reports/daily returns 200 with valid admin key', async ({
    request,
  }) => {
    const res = await request.get(
      `${apiBase}/reports/daily?date=2026-01-15`,
      {
        headers: { 'x-admin-key': adminKey },
      }
    );
    // May be 200 or 404 depending on data, but not 401
    expect(res.status()).not.toBe(401);
  });

  test('GET /ledger-entries returns 401 without admin key', async ({
    request,
  }) => {
    const res = await request.get(
      `${apiBase}/ledger-entries?date=2026-01-15`
    );
    expect(res.status()).toBe(401);
  });

  test('POST /dev/seed returns 401 without admin key', async ({
    request,
  }) => {
    const res = await request.post(`${apiBase}/dev/seed`, {
      headers: { 'content-type': 'application/json' },
      data: { date: '2026-01-01', orders: 1 },
    });
    expect(res.status()).toBe(401);
  });

  test('invalid admin key is rejected', async ({ request }) => {
    const res = await request.get(`${apiBase}/inbox`, {
      headers: { 'x-admin-key': 'WRONG_KEY_12345' },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('Storefront public routes accessible without auth', () => {
  test('home page is publicly accessible', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    await expect(page.locator('body')).toBeVisible();
  });

  test('products page is publicly accessible', async ({ page }) => {
    const response = await page.goto('/products');
    expect(response?.status()).toBe(200);

    await expect(page.locator('body')).toBeVisible();
  });

  test('cart page is publicly accessible', async ({ page }) => {
    const response = await page.goto('/cart');
    expect(response?.status()).toBe(200);

    await expect(page.locator('body')).toBeVisible();
  });

  test('checkout page is publicly accessible', async ({ page }) => {
    const response = await page.goto('/checkout');
    expect(response?.status()).toBe(200);

    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Admin pages', () => {
  test('admin dashboard page loads', async ({ page }) => {
    // Admin pages in this app don't require server-side auth redirect
    // but they do call authenticated API endpoints
    const response = await page.goto('/admin/');
    // The page should load (SSR doesn't block admin)
    expect(response?.status()).toBeLessThan(500);

    await expect(page.locator('body')).toBeVisible();
  });

  test('admin orders page loads', async ({ page }) => {
    const response = await page.goto('/admin/orders');
    expect(response?.status()).toBeLessThan(500);

    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('API storefront endpoints are public', () => {
  test('GET /store/products does not require auth', async ({ request }) => {
    const res = await request.get(`${apiBase}/store/products`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toBeTruthy();
  });

  test('GET /dev/ping is accessible', async ({ request }) => {
    const res = await request.get(`${apiBase}/dev/ping`);
    expect(res.status()).toBe(200);
  });
});
