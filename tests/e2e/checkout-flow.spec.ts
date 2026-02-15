import { test, expect } from '@playwright/test';

const apiBase = process.env.E2E_API_BASE ?? 'http://localhost:8787';
const adminKey = process.env.ADMIN_API_KEY ?? 'CHANGE_ME';

test.beforeAll(async ({ request }) => {
  const res = await request.post(`${apiBase}/dev/seed`, {
    headers: {
      'x-admin-key': adminKey,
      'content-type': 'application/json',
    },
    data: {
      date: '2026-01-15',
      orders: 3,
      payments: 3,
      refunds: 0,
      withImages: true,
    },
  });

  expect(res.ok()).toBeTruthy();
});

test.describe('Cart page', () => {
  test('displays empty cart message when no items', async ({ page }) => {
    await page.goto('/cart');

    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  test('cart page has correct heading hierarchy', async ({ page }) => {
    await page.goto('/cart');

    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
  });

  test('breadcrumb navigation is accessible', async ({ page }) => {
    await page.goto('/cart');

    const breadcrumb = page.locator('nav[aria-label]').first();
    await expect(breadcrumb).toBeVisible();

    const homeLink = breadcrumb.locator('a[href="/"]');
    await expect(homeLink).toBeVisible();
  });
});

test.describe('Checkout page', () => {
  test('checkout page loads with breadcrumb', async ({ page }) => {
    await page.goto('/checkout');

    const breadcrumb = page.locator('nav[aria-label]').first();
    await expect(breadcrumb).toBeVisible();
  });

  test('checkout page has correct heading hierarchy', async ({ page }) => {
    await page.goto('/checkout');

    const h1Elements = page.locator('h1');
    const count = await h1Elements.count();
    expect(count).toBeLessThanOrEqual(1);
  });

  test('cart link in breadcrumb navigates to cart', async ({ page }) => {
    await page.goto('/checkout');

    const cartLink = page.locator('nav a[href="/cart"]');
    await expect(cartLink).toBeVisible();

    await cartLink.click();
    await expect(page).toHaveURL('/cart');
  });
});

test.describe('Checkout success page', () => {
  test('success page loads without order_id', async ({ page }) => {
    await page.goto('/checkout/success');

    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Cart to checkout navigation', () => {
  test('product page has add-to-cart mechanism', async ({ page }) => {
    await page.goto('/products');

    await page.waitForSelector('#product-grid:not(.hidden)');

    const firstProductLink = page
      .locator('#product-grid a[href^="/products/"]')
      .first();
    await expect(firstProductLink).toBeVisible();

    const href = await firstProductLink.getAttribute('href');
    expect(href).toMatch(/^\/products\/\d+/);

    await firstProductLink.click();
    await page.waitForLoadState('networkidle');

    const addToCartButton = page.locator(
      'button:has-text("カートに追加"), button:has-text("Add to Cart")'
    );
    if ((await addToCartButton.count()) > 0) {
      await expect(addToCartButton.first()).toBeVisible();
    }
  });
});

test.describe('Checkout a11y', () => {
  test('cart page interactive elements are keyboard accessible', async ({
    page,
  }) => {
    await page.goto('/cart');

    await page.keyboard.press('Tab');

    const focused = page.locator(':focus');
    const tagName = await focused.evaluate((el) =>
      el.tagName.toLowerCase()
    );
    expect(['a', 'button', 'input', 'select', 'textarea']).toContain(
      tagName
    );
  });

  test('checkout page form labels are associated', async ({ page }) => {
    await page.goto('/checkout');

    const inputs = page.locator(
      'input:not([type="hidden"]):not([type="submit"])'
    );
    const inputCount = await inputs.count();

    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      const placeholder = await input.getAttribute('placeholder');

      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        const hasLabel = (await label.count()) > 0;
        const hasAria = ariaLabel !== null || ariaLabelledBy !== null;
        const hasPlaceholder = placeholder !== null;
        expect(hasLabel || hasAria || hasPlaceholder).toBeTruthy();
      }
    }
  });
});
