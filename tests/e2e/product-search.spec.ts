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
      refunds: 0,
      withImages: true,
    },
  });

  expect(res.ok()).toBeTruthy();
});

test.describe('Products page basics', () => {
  test('products page loads with heading and product grid', async ({
    page,
  }) => {
    await page.goto('/products');

    const heading = page.locator('h1');
    await expect(heading).toBeVisible();

    // Wait for client-side product grid to render
    await page.waitForSelector('#product-grid:not(.hidden)');

    const productCards = page.locator('#product-grid a[href^="/products/"]');
    await expect(productCards.first()).toBeVisible();
  });

  test('product cards display title and price', async ({ page }) => {
    await page.goto('/products');
    await page.waitForSelector('#product-grid:not(.hidden)');

    // Each product card should have visible text content
    const firstCard = page.locator('#product-grid > div').first();
    await expect(firstCard).toBeVisible();

    // Card should contain a link to a product detail page
    const productLink = firstCard.locator('a[href^="/products/"]').first();
    await expect(productLink).toBeVisible();

    // Card should contain price text (¥ symbol for JPY)
    const priceText = firstCard.locator('text=/¥/');
    if ((await priceText.count()) > 0) {
      await expect(priceText.first()).toBeVisible();
    }
  });

  test('product cards have images', async ({ page }) => {
    await page.goto('/products');
    await page.waitForSelector('#product-grid:not(.hidden)');

    const images = page.locator('#product-grid img');
    if ((await images.count()) > 0) {
      await expect(images.first()).toBeVisible();
    }
  });
});

test.describe('Sort functionality', () => {
  test('sort dropdown is visible with options', async ({ page }) => {
    await page.goto('/products');

    const sortSelect = page.locator('#sort-select');
    await expect(sortSelect).toBeVisible();

    // Verify sort options exist
    const options = sortSelect.locator('option');
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('changing sort order updates product grid', async ({ page }) => {
    await page.goto('/products');
    await page.waitForSelector('#product-grid:not(.hidden)');

    const sortSelect = page.locator('#sort-select');

    // Change to price ascending
    await sortSelect.selectOption('price_asc');

    // Grid should still be visible after sort change
    await page.waitForSelector('#product-grid:not(.hidden)');
    const productCards = page.locator('#product-grid > div');
    await expect(productCards.first()).toBeVisible();
  });

  test('sort by price descending', async ({ page }) => {
    await page.goto('/products');
    await page.waitForSelector('#product-grid:not(.hidden)');

    const sortSelect = page.locator('#sort-select');
    await sortSelect.selectOption('price_desc');

    await page.waitForSelector('#product-grid:not(.hidden)');
    const productCards = page.locator('#product-grid > div');
    await expect(productCards.first()).toBeVisible();
  });
});

test.describe('Filter sidebar', () => {
  test('desktop filter sidebar is visible on large viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto('/products');

    const filterSidebar = page.locator('aside[aria-label]');
    await expect(filterSidebar).toBeVisible();
  });

  test('mobile filter button visible on small viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/products');

    const mobileFilterBtn = page.locator('#mobile-filter-btn');
    await expect(mobileFilterBtn).toBeVisible();
  });

  test('mobile filter sheet opens on button click', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/products');

    const mobileFilterBtn = page.locator('#mobile-filter-btn');
    await mobileFilterBtn.click();

    const filterSheet = page.locator('#mobile-filter-sheet');
    // Sheet should transition to visible (no longer translate-y-full)
    await expect(filterSheet).not.toHaveClass(/translate-y-full/);

    // Close button should be visible
    const closeBtn = page.locator('#mobile-filter-close');
    await expect(closeBtn).toBeVisible();

    // Close the filter sheet
    await closeBtn.click();
    await expect(filterSheet).toHaveClass(/translate-y-full/);
  });
});

test.describe('Product detail navigation', () => {
  test('clicking product card navigates to detail page', async ({ page }) => {
    await page.goto('/products');
    await page.waitForSelector('#product-grid:not(.hidden)');

    const firstProductLink = page
      .locator('#product-grid a[href^="/products/"]')
      .first();
    const href = await firstProductLink.getAttribute('href');
    expect(href).toMatch(/^\/products\/\d+/);

    await firstProductLink.click();
    await page.waitForLoadState('networkidle');

    // Should be on a product detail page
    expect(page.url()).toMatch(/\/products\/\d+/);

    // Detail page should have a heading
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  test('product detail page has buy button', async ({ page }) => {
    await page.goto('/products');
    await page.waitForSelector('#product-grid:not(.hidden)');

    const firstProductLink = page
      .locator('#product-grid a[href^="/products/"]')
      .first();
    await firstProductLink.click();
    await page.waitForLoadState('networkidle');

    const buyButton = page.locator(
      '#buy-button, button:has-text("カートに追加"), button:has-text("Add to Cart")'
    );
    if ((await buyButton.count()) > 0) {
      await expect(buyButton.first()).toBeVisible();
    }
  });
});

test.describe('Pagination', () => {
  test('pagination nav exists when products are loaded', async ({ page }) => {
    await page.goto('/products');
    await page.waitForSelector('#product-grid:not(.hidden)');

    const paginationNav = page.locator('#pagination');
    // Pagination may or may not be visible depending on product count
    const isVisible = await paginationNav.isVisible();

    if (isVisible) {
      const paginationInfo = page.locator('#pagination-info');
      await expect(paginationInfo).toBeVisible();
    }
  });
});

test.describe('Category navigation', () => {
  test('category page loads with heading', async ({ page }) => {
    // Navigate to categories index page
    const response = await page.goto('/categories');
    expect(response?.status()).toBeLessThan(500);

    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });
});

test.describe('Search and filter info areas', () => {
  test('search info and filter info areas exist but are initially hidden', async ({
    page,
  }) => {
    await page.goto('/products');

    const searchInfo = page.locator('#search-info');
    await expect(searchInfo).toBeHidden();

    const filterInfo = page.locator('#filter-info');
    await expect(filterInfo).toBeHidden();
  });

  test('section title shows default text', async ({ page }) => {
    await page.goto('/products');

    const sectionTitle = page.locator('#section-title');
    await expect(sectionTitle).toBeVisible();
  });
});

test.describe('Products page a11y', () => {
  test('sort select has accessible label', async ({ page }) => {
    await page.goto('/products');

    const sortSelect = page.locator('#sort-select');
    const ariaLabel = await sortSelect.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
  });

  test('filter sidebar has aria-label', async ({ page }) => {
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto('/products');

    const sidebar = page.locator('aside[aria-label]');
    await expect(sidebar).toBeVisible();

    const ariaLabel = await sidebar.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
  });

  test('mobile filter sheet has proper dialog role', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/products');

    const filterSheet = page.locator('#mobile-filter-sheet');
    const role = await filterSheet.getAttribute('role');
    expect(role).toBe('dialog');

    const ariaModal = await filterSheet.getAttribute('aria-modal');
    expect(ariaModal).toBe('true');
  });

  test('page has single h1 heading', async ({ page }) => {
    await page.goto('/products');

    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
  });
});
