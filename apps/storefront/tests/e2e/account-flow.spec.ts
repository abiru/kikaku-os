import { test, expect } from '@playwright/test';

// E2E tests for account management flow (#677)
// Tests auth guard, order-status page, and wishlist localStorage interactions.
// These tests do NOT require authentication — they verify public behavior.

test.describe('Auth guard: unauthenticated access', () => {
  test('account page loads without server error', async ({ page }) => {
    const response = await page.goto('/account');
    // Should render (may show login prompt or redirect) but not crash
    expect(response?.status()).toBeLessThan(500);
  });

  test('account orders page loads without server error', async ({ page }) => {
    const response = await page.goto('/account/orders');
    expect(response?.status()).toBeLessThan(500);
  });

  test('account profile page loads without server error', async ({ page }) => {
    const response = await page.goto('/account/profile');
    expect(response?.status()).toBeLessThan(500);
  });
});

test.describe('Order status page', () => {
  test('order status page loads successfully', async ({ page }) => {
    const response = await page.goto('/order-status');
    expect(response?.status()).toBe(200);
    await expect(page.locator('body')).toBeVisible();
  });

  test('order status page has heading', async ({ page }) => {
    await page.goto('/order-status');
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  test('order status page has token search form', async ({ page }) => {
    await page.goto('/order-status');
    const form = page.locator('#order-search-form');
    await expect(form).toBeVisible();

    const tokenInput = page.locator('#order-token');
    await expect(tokenInput).toBeVisible();
    await expect(tokenInput).toHaveAttribute('required', '');
  });

  test('order status page has submit button', async ({ page }) => {
    await page.goto('/order-status');
    const submitButton = page.locator('#order-search-form button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });

  test('order status page has link to order history', async ({ page }) => {
    await page.goto('/order-status');
    const ordersLink = page.locator('a[href="/account/orders"]');
    await expect(ordersLink).toBeVisible();
  });

  test('order status page has sign-in link', async ({ page }) => {
    await page.goto('/order-status');
    const signInLink = page.locator('a[href="/sign-in"]');
    await expect(signInLink).toBeVisible();
  });

  test('order status page has contact link', async ({ page }) => {
    await page.goto('/order-status');
    const contactLink = page.locator('a[href="/contact"]');
    await expect(contactLink).toBeVisible();
  });

  test('token search form navigates on submit', async ({ page }) => {
    await page.goto('/order-status');

    const tokenInput = page.locator('#order-token');
    await tokenInput.fill('test-token-123');

    const submitButton = page.locator('#order-search-form button[type="submit"]');
    await submitButton.click();

    await page.waitForURL(/\/orders\/test-token-123/);
    expect(page.url()).toContain('/orders/test-token-123');
  });
});

test.describe('Wishlist page', () => {
  test('wishlist page loads successfully', async ({ page }) => {
    const response = await page.goto('/wishlist');
    expect(response?.status()).toBe(200);
    await expect(page.locator('body')).toBeVisible();
  });

  test('wishlist page has heading', async ({ page }) => {
    await page.goto('/wishlist');
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  test('wishlist page has breadcrumb navigation', async ({ page }) => {
    await page.goto('/wishlist');
    const breadcrumb = page.locator('nav[aria-label]').first();
    await expect(breadcrumb).toBeVisible();

    const homeLink = breadcrumb.locator('a[href="/"]');
    await expect(homeLink).toBeVisible();
  });

  test('empty wishlist shows browse products link', async ({ page }) => {
    // Clear localStorage to ensure empty state
    await page.goto('/wishlist');
    await page.evaluate(() => {
      localStorage.removeItem('led-kikaku-wishlist');
    });
    await page.reload();

    const browseLink = page.locator('a[href="/products"]');
    await expect(browseLink.first()).toBeVisible();
  });

  test('wishlist persists items via localStorage', async ({ page }) => {
    await page.goto('/wishlist');

    // Seed wishlist via localStorage
    await page.evaluate(() => {
      const item = {
        '1': {
          productId: 1,
          title: 'Test Product',
          price: 1000,
          currency: 'JPY',
          addedAt: Date.now(),
        },
      };
      localStorage.setItem('led-kikaku-wishlist', JSON.stringify(item));
    });

    await page.reload();

    // The React component should pick up the seeded item
    const listItems = page.locator('ul[role="list"] li');
    const count = await listItems.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('wishlist shows product title from localStorage', async ({ page }) => {
    await page.goto('/wishlist');

    await page.evaluate(() => {
      const item = {
        '42': {
          productId: 42,
          title: 'E2E Test Widget',
          price: 2500,
          currency: 'JPY',
          addedAt: Date.now(),
        },
      };
      localStorage.setItem('led-kikaku-wishlist', JSON.stringify(item));
    });

    await page.reload();

    await expect(page.locator('text=E2E Test Widget')).toBeVisible();
  });

  test('wishlist clears when localStorage is emptied', async ({ page }) => {
    await page.goto('/wishlist');

    // First seed an item
    await page.evaluate(() => {
      const item = {
        '99': {
          productId: 99,
          title: 'Temp Product',
          price: 500,
          currency: 'JPY',
          addedAt: Date.now(),
        },
      };
      localStorage.setItem('led-kikaku-wishlist', JSON.stringify(item));
    });

    await page.reload();

    // Verify item is shown
    const listItems = page.locator('ul[role="list"] li');
    expect(await listItems.count()).toBeGreaterThanOrEqual(1);

    // Now clear
    await page.evaluate(() => {
      localStorage.removeItem('led-kikaku-wishlist');
    });

    await page.reload();

    // Should show empty state with browse products link
    const browseLink = page.locator('a[href="/products"]');
    await expect(browseLink.first()).toBeVisible();
  });
});
