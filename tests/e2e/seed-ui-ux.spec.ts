import { test, expect } from '@playwright/test';

type SeedResponse = {
  ok: boolean;
  created?: {
    products?: number;
    heroSections?: number;
    images?: number;
  };
};

const apiBase = process.env.E2E_API_BASE ?? 'http://localhost:8787';
const adminKey = process.env.ADMIN_API_KEY ?? 'CHANGE_ME';

test.beforeAll(async ({ request }) => {
  const res = await request.post(`${apiBase}/dev/seed`, {
    headers: {
      'x-admin-key': adminKey,
      'content-type': 'application/json'
    },
    data: {
      date: '2026-01-15',
      orders: 8,
      payments: 8,
      refunds: 2,
      makeInbox: true,
      withImages: true
    }
  });

  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as SeedResponse;
  expect(body.ok).toBe(true);
});

test('home page shows seeded hero and featured category visuals', async ({ page }) => {
  await page.goto('/');

  const hero = page.locator('section.hero').first();
  await expect(hero).toBeVisible();
  await expect(hero).toHaveAttribute('style', /seed\/heroes\/hero-/);

  const categoryImage = page.locator('article.category-card img').first();
  await expect(categoryImage).toBeVisible();
  await expect(categoryImage).toHaveAttribute('src', /\/seed\/products\//);

  const naturalWidth = await categoryImage.evaluate((img) => (img as HTMLImageElement).naturalWidth);
  expect(naturalWidth).toBeGreaterThan(0);
});

test('products page renders seeded cards and product detail navigation', async ({ page }) => {
  await page.goto('/products');

  await page.waitForSelector('#product-grid:not(.hidden)');

  const cards = page.locator('#product-grid > div');
  await expect(cards.first()).toBeVisible();
  await expect.poll(async () => cards.count()).toBeGreaterThan(4);

  const seededImage = page.locator('#product-grid img[src*="/seed/products/"]').first();
  await expect(seededImage).toBeVisible();

  const firstProductLink = cards.first().locator('a[href^="/products/"]').first();
  await expect(firstProductLink).toBeVisible();
  const href = await firstProductLink.getAttribute('href');
  expect(href).toMatch(/^\/products\/\d+/);
});

test('mobile menu opens and closes correctly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const menuButton = page.locator('#mobile-menu-btn');
  const menu = page.locator('#mobile-menu');
  const closeButton = page.locator('#mobile-menu-close');

  await expect(menuButton).toBeVisible();
  await expect(menu).toHaveClass(/translate-x-full/);

  await menuButton.click();
  await expect(menu).not.toHaveClass(/translate-x-full/);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');

  await closeButton.click();
  await expect(menu).toHaveClass(/translate-x-full/);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
});
