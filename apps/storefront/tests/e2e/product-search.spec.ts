import { test, expect } from '@playwright/test';

// E2E test stubs for product search and category (#674)
// Playwright is not yet configured — all tests are skipped until setup is complete.

test.describe.skip('Product Search and Category', () => {
  test('products page loads', async ({ page }) => {
    const response = await page.goto('/products');
    expect(response?.status()).toBe(200);

    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('categories page loads', async ({ page }) => {
    const response = await page.goto('/categories');
    // Categories may redirect or show a listing
    expect(response?.status()).toBeLessThan(400);
  });

  test('search modal opens', async ({ page }) => {
    await page.goto('/products');
    // Click the search button/icon to open the search modal
    const searchButton = page.locator('[aria-label="検索"], button:has-text("検索")');
    await searchButton.first().click();

    // Verify search modal/input is visible
    const searchInput = page.locator('input[type="search"], input[placeholder*="検索"]');
    await expect(searchInput.first()).toBeVisible();
  });

  // TODO: Implement filter tests once product seeding is available
  test.skip('can filter products by category', async ({ page }) => {
    // await page.goto('/products');
    // TODO: Open filter panel, select a category, verify results update
  });

  // TODO: Implement sort tests once product seeding is available
  test.skip('can sort products by price', async ({ page }) => {
    // await page.goto('/products');
    // TODO: Select sort option, verify product order changes
  });

  // TODO: Implement price range filter tests
  test.skip('can filter products by price range', async ({ page }) => {
    // await page.goto('/products');
    // TODO: Set min/max price, verify results update
  });
});
