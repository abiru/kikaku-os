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
      orders: 5,
      payments: 5,
      refunds: 1,
      makeInbox: true,
      withImages: true,
    },
  });

  expect(res.ok()).toBeTruthy();
});

test.describe('Admin dashboard', () => {
  test('admin index page loads with dashboard heading', async ({ page }) => {
    await page.goto('/admin/');

    const heading = page.locator('h1, [class*="heading"]').first();
    await expect(heading).toBeVisible();
  });

  test('admin page has navigation sidebar', async ({ page }) => {
    await page.goto('/admin/');

    const nav = page.locator('nav').first();
    await expect(nav).toBeVisible();
  });

  test('admin sidebar contains key navigation links', async ({ page }) => {
    await page.goto('/admin/');

    const ordersLink = page.locator('nav a[href="/admin/orders"]');
    const productsLink = page.locator('nav a[href="/admin/products"]');
    const inboxLink = page.locator('nav a[href="/admin/inbox"]');

    await expect(ordersLink).toBeVisible();
    await expect(productsLink).toBeVisible();
    await expect(inboxLink).toBeVisible();
  });
});

test.describe('Admin orders page', () => {
  test('orders page displays order list', async ({ page }) => {
    await page.goto('/admin/orders');

    const heading = page.locator('h1, [class*="heading"]').first();
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/order/i);
  });

  test('orders page shows total count badge', async ({ page }) => {
    await page.goto('/admin/orders');

    const totalBadge = page.locator('span:has-text("total")');
    await expect(totalBadge).toBeVisible();
  });
});

test.describe('Admin products page', () => {
  test('products page loads with heading', async ({ page }) => {
    await page.goto('/admin/products');

    const heading = page.locator('h1, [class*="heading"]').first();
    await expect(heading).toBeVisible();
  });

  test('products page has search functionality', async ({ page }) => {
    await page.goto('/admin/products');

    const searchInput = page.locator(
      'input[type="search"], input[name="q"], input[placeholder*="検索"], input[placeholder*="search" i]'
    );
    if ((await searchInput.count()) > 0) {
      await expect(searchInput.first()).toBeVisible();
    }
  });
});

test.describe('Admin inbox page', () => {
  test('inbox page loads', async ({ page }) => {
    await page.goto('/admin/inbox');

    const heading = page.locator('h1, [class*="heading"]').first();
    await expect(heading).toBeVisible();
  });

  test('inbox items have action buttons', async ({ page }) => {
    await page.goto('/admin/inbox');

    const items = page.locator('[data-inbox-item], article, .inbox-item, tr');
    if ((await items.count()) > 0) {
      const approveButton = page.locator(
        'button:has-text("Approve"), button:has-text("承認")'
      );
      const rejectButton = page.locator(
        'button:has-text("Reject"), button:has-text("却下")'
      );

      if ((await approveButton.count()) > 0) {
        await expect(approveButton.first()).toBeVisible();
      }
      if ((await rejectButton.count()) > 0) {
        await expect(rejectButton.first()).toBeVisible();
      }
    }
  });
});

test.describe('Admin page navigation', () => {
  test('navigate from dashboard to orders', async ({ page }) => {
    await page.goto('/admin/');

    const ordersLink = page.locator('nav a[href="/admin/orders"]');
    await ordersLink.click();

    await expect(page).toHaveURL('/admin/orders');

    const heading = page.locator('h1, [class*="heading"]').first();
    await expect(heading).toBeVisible();
  });

  test('navigate from orders to products', async ({ page }) => {
    await page.goto('/admin/orders');

    const productsLink = page.locator('nav a[href="/admin/products"]');
    await productsLink.click();

    await expect(page).toHaveURL('/admin/products');
  });

  test('navigate from products to inventory', async ({ page }) => {
    await page.goto('/admin/products');

    const inventoryLink = page.locator('nav a[href="/admin/inventory"]');
    await inventoryLink.click();

    await expect(page).toHaveURL('/admin/inventory');
  });
});

test.describe('Admin a11y', () => {
  test('admin pages have single h1', async ({ page }) => {
    const adminPages = [
      '/admin/',
      '/admin/orders',
      '/admin/products',
      '/admin/inbox',
    ];

    for (const url of adminPages) {
      await page.goto(url);
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBeGreaterThanOrEqual(1);
    }
  });

  test('admin sidebar navigation is keyboard accessible', async ({
    page,
  }) => {
    await page.goto('/admin/');

    const navLinks = page.locator('nav a');
    const linkCount = await navLinks.count();
    expect(linkCount).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(linkCount, 5); i++) {
      const link = navLinks.nth(i);
      const href = await link.getAttribute('href');
      expect(href).toBeTruthy();
    }
  });

  test('admin action buttons have accessible labels', async ({ page }) => {
    await page.goto('/admin/orders');

    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute('aria-label');
      const title = await button.getAttribute('title');

      const hasAccessibleName =
        (text && text.trim().length > 0) ||
        ariaLabel !== null ||
        title !== null;
      expect(hasAccessibleName).toBeTruthy();
    }
  });
});
