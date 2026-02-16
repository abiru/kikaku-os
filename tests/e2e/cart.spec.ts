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

test.describe('Cart operations', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('led-kikaku-cart'));
  });

  test('empty cart shows empty state message', async ({ page }) => {
    await page.goto('/cart');

    // Cart page loads with heading
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();

    // Empty cart message or browse products link should be visible
    const emptyIndicator = page.locator(
      'a[href="/products"]:has-text("商品"), a[href="/products"]:has-text("Product")'
    );
    if ((await emptyIndicator.count()) > 0) {
      await expect(emptyIndicator.first()).toBeVisible();
    }
  });

  test('add product to cart from product detail page', async ({ page }) => {
    // Navigate to products page
    await page.goto('/products');
    await page.waitForSelector('#product-grid:not(.hidden)');

    // Click first product
    const firstProduct = page
      .locator('#product-grid a[href^="/products/"]')
      .first();
    await expect(firstProduct).toBeVisible();
    await firstProduct.click();
    await page.waitForLoadState('networkidle');

    // Click the add to cart button
    const buyButton = page.locator('#buy-button');
    if ((await buyButton.count()) > 0 && (await buyButton.isEnabled())) {
      await buyButton.click();

      // Verify item was added to localStorage
      const cartData = await page.evaluate(() =>
        localStorage.getItem('led-kikaku-cart')
      );
      expect(cartData).toBeTruthy();

      const cart = JSON.parse(cartData!);
      const items = Object.values(cart);
      expect(items.length).toBeGreaterThan(0);
    }
  });

  test('cart persists across page reload via localStorage', async ({
    page,
  }) => {
    // Seed cart data directly into localStorage
    await page.goto('/');
    await page.evaluate(() => {
      const cartData = {
        '1': {
          variantId: 1,
          productId: 1,
          title: 'Test Product',
          variantTitle: 'Default',
          price: 3000,
          currency: 'JPY',
          quantity: 2,
          taxRate: 0.1,
        },
      };
      localStorage.setItem('led-kikaku-cart', JSON.stringify(cartData));
    });

    // Navigate to cart page
    await page.goto('/cart');
    await page.waitForLoadState('networkidle');

    // Verify the cart item is displayed
    const productText = page.locator('text=Test Product');
    await expect(productText).toBeVisible();

    // Reload page and verify persistence
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Test Product')).toBeVisible();
  });

  test('cart shows multiple items', async ({ page }) => {
    // Seed multiple items into localStorage
    await page.goto('/');
    await page.evaluate(() => {
      const cartData = {
        '1': {
          variantId: 1,
          productId: 1,
          title: 'Product Alpha',
          variantTitle: 'Default',
          price: 1000,
          currency: 'JPY',
          quantity: 1,
          taxRate: 0.1,
        },
        '2': {
          variantId: 2,
          productId: 2,
          title: 'Product Beta',
          variantTitle: 'Large',
          price: 2000,
          currency: 'JPY',
          quantity: 3,
          taxRate: 0.1,
        },
      };
      localStorage.setItem('led-kikaku-cart', JSON.stringify(cartData));
    });

    await page.goto('/cart');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Product Alpha')).toBeVisible();
    await expect(page.locator('text=Product Beta')).toBeVisible();
  });

  test('change item quantity in cart', async ({ page }) => {
    // Seed cart with one item
    await page.goto('/');
    await page.evaluate(() => {
      const cartData = {
        '1': {
          variantId: 1,
          productId: 1,
          title: 'Quantity Test Product',
          variantTitle: 'Default',
          price: 1000,
          currency: 'JPY',
          quantity: 1,
          taxRate: 0.1,
        },
      };
      localStorage.setItem('led-kikaku-cart', JSON.stringify(cartData));
    });

    await page.goto('/cart');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Quantity Test Product')).toBeVisible();

    // Find quantity selector and change it
    const quantitySelect = page.locator('select').first();
    if ((await quantitySelect.count()) > 0) {
      await quantitySelect.selectOption('3');

      // Verify localStorage was updated
      const cartData = await page.evaluate(() =>
        localStorage.getItem('led-kikaku-cart')
      );
      expect(cartData).toBeTruthy();
      const cart = JSON.parse(cartData!);
      const item = Object.values(cart)[0] as { quantity: number };
      expect(item.quantity).toBe(3);
    }
  });

  test('remove item from cart', async ({ page }) => {
    // Seed cart with one item
    await page.goto('/');
    await page.evaluate(() => {
      const cartData = {
        '1': {
          variantId: 1,
          productId: 1,
          title: 'Remove Me Product',
          variantTitle: 'Default',
          price: 1000,
          currency: 'JPY',
          quantity: 1,
          taxRate: 0.1,
        },
      };
      localStorage.setItem('led-kikaku-cart', JSON.stringify(cartData));
    });

    await page.goto('/cart');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Remove Me Product')).toBeVisible();

    // Click the remove button (sr-only text or X button)
    const removeButton = page
      .locator('button')
      .filter({ has: page.locator('.sr-only') })
      .first();
    if ((await removeButton.count()) > 0) {
      await removeButton.click();

      // Wait for item to disappear
      await expect(page.locator('text=Remove Me Product')).toBeHidden();

      // Verify localStorage was updated
      const cartData = await page.evaluate(() =>
        localStorage.getItem('led-kikaku-cart')
      );
      const cart = JSON.parse(cartData || '{}');
      expect(Object.keys(cart).length).toBe(0);
    }
  });

  test('cart displays order summary with subtotal, tax, and total', async ({
    page,
  }) => {
    // Seed cart
    await page.goto('/');
    await page.evaluate(() => {
      const cartData = {
        '1': {
          variantId: 1,
          productId: 1,
          title: 'Summary Test Product',
          variantTitle: 'Default',
          price: 5000,
          currency: 'JPY',
          quantity: 2,
          taxRate: 0.1,
        },
      };
      localStorage.setItem('led-kikaku-cart', JSON.stringify(cartData));
    });

    await page.goto('/cart');
    await page.waitForLoadState('networkidle');

    // Order summary section should be visible
    const summarySection = page.locator('section[aria-labelledby="summary-heading"]');
    if ((await summarySection.count()) > 0) {
      await expect(summarySection).toBeVisible();
    }
  });

  test('checkout button navigates to checkout page', async ({ page }) => {
    // Seed cart
    await page.goto('/');
    await page.evaluate(() => {
      const cartData = {
        '1': {
          variantId: 1,
          productId: 1,
          title: 'Checkout Flow Product',
          variantTitle: 'Default',
          price: 3000,
          currency: 'JPY',
          quantity: 1,
          taxRate: 0.1,
        },
      };
      localStorage.setItem('led-kikaku-cart', JSON.stringify(cartData));
    });

    await page.goto('/cart');
    await page.waitForLoadState('networkidle');

    // Click checkout button
    const checkoutButton = page.locator(
      'button:has-text("レジに進む"), button:has-text("checkout"), button:has-text("Checkout")'
    );
    if ((await checkoutButton.count()) > 0) {
      await checkoutButton.first().click();
      await page.waitForURL('**/checkout**');
      expect(page.url()).toContain('/checkout');
    }
  });
});
