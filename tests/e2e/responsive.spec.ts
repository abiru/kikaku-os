import { test, expect } from '@playwright/test';

const apiBase = process.env.E2E_API_BASE ?? 'http://localhost:8787';
const adminKey = process.env.ADMIN_API_KEY ?? 'CHANGE_ME';

const viewports = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
} as const;

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

test.describe('Home page responsive', () => {
  for (const [name, size] of Object.entries(viewports)) {
    test(`renders correctly at ${name} (${size.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto('/');

      const hero = page.locator('section.hero, [class*="hero"]').first();
      await expect(hero).toBeVisible();

      const heroBox = await hero.boundingBox();
      expect(heroBox).toBeTruthy();
      expect(heroBox!.width).toBeLessThanOrEqual(size.width + 1);
    });
  }

  test('mobile shows hamburger menu button', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto('/');

    const menuButton = page.locator('#mobile-menu-btn');
    await expect(menuButton).toBeVisible();
  });

  test('desktop hides hamburger menu button', async ({ page }) => {
    await page.setViewportSize(viewports.desktop);
    await page.goto('/');

    const menuButton = page.locator('#mobile-menu-btn');
    await expect(menuButton).toBeHidden();
  });

  test('tablet navigation adapts', async ({ page }) => {
    await page.setViewportSize(viewports.tablet);
    await page.goto('/');

    const body = page.locator('body');
    await expect(body).toBeVisible();

    const bodyBox = await body.boundingBox();
    expect(bodyBox).toBeTruthy();
  });
});

test.describe('Products page responsive', () => {
  for (const [name, size] of Object.entries(viewports)) {
    test(`product grid adapts at ${name} (${size.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto('/products');

      await page.waitForSelector('#product-grid:not(.hidden)');

      const grid = page.locator('#product-grid');
      await expect(grid).toBeVisible();

      const gridBox = await grid.boundingBox();
      expect(gridBox).toBeTruthy();
      expect(gridBox!.width).toBeLessThanOrEqual(size.width + 1);
    });
  }

  test('product cards do not overflow on mobile', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto('/products');

    await page.waitForSelector('#product-grid:not(.hidden)');

    const cards = page.locator('#product-grid > div');
    const cardCount = await cards.count();

    for (let i = 0; i < Math.min(cardCount, 4); i++) {
      const card = cards.nth(i);
      const box = await card.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.width).toBeLessThanOrEqual(viewports.mobile.width + 1);
    }
  });
});

test.describe('Cart page responsive', () => {
  for (const [name, size] of Object.entries(viewports)) {
    test(`cart page displays at ${name} (${size.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto('/cart');

      const heading = page.locator('h1');
      await expect(heading).toBeVisible();

      const headingBox = await heading.boundingBox();
      expect(headingBox).toBeTruthy();
      expect(headingBox!.width).toBeLessThanOrEqual(size.width + 1);
    });
  }
});

test.describe('Checkout page responsive', () => {
  for (const [name, size] of Object.entries(viewports)) {
    test(`checkout page adapts at ${name} (${size.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto('/checkout');

      const body = page.locator('body');
      await expect(body).toBeVisible();

      const isHorizontallyScrollable = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(isHorizontallyScrollable).toBe(false);
    });
  }
});

test.describe('Admin pages responsive', () => {
  for (const [name, size] of Object.entries(viewports)) {
    test(`admin dashboard at ${name} (${size.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto('/admin/');

      const heading = page.locator('h1, [class*="heading"]').first();
      await expect(heading).toBeVisible();

      const isHorizontallyScrollable = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(isHorizontallyScrollable).toBe(false);
    });
  }

  test('admin sidebar collapses on mobile', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto('/admin/');

    const menuToggle = page.locator(
      'button[aria-label*="menu" i], button[aria-label*="メニュー"], [data-sidebar-toggle]'
    );
    if ((await menuToggle.count()) > 0) {
      await expect(menuToggle.first()).toBeVisible();
    }
  });

  test('admin sidebar visible on desktop', async ({ page }) => {
    await page.setViewportSize(viewports.desktop);
    await page.goto('/admin/');

    const nav = page.locator('nav').first();
    await expect(nav).toBeVisible();
  });
});

test.describe('Responsive a11y', () => {
  test('viewport meta tag is present on all pages', async ({ page }) => {
    const pages = ['/', '/products', '/cart', '/checkout'];

    for (const url of pages) {
      await page.goto(url);

      const viewportMeta = page.locator('meta[name="viewport"]');
      await expect(viewportMeta).toHaveCount(1);

      const content = await viewportMeta.getAttribute('content');
      expect(content).toContain('width=device-width');
    }
  });

  test('touch targets meet minimum size on mobile', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto('/');

    const links = page.locator('header a, nav a');
    const linkCount = await links.count();

    for (let i = 0; i < Math.min(linkCount, 5); i++) {
      const link = links.nth(i);
      if (await link.isVisible()) {
        const box = await link.boundingBox();
        if (box) {
          expect(box.height).toBeGreaterThanOrEqual(24);
        }
      }
    }
  });

  test('text is readable without horizontal scrolling on mobile', async ({
    page,
  }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto('/');

    const isHorizontallyScrollable = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isHorizontallyScrollable).toBe(false);
  });

  test('mobile menu keyboard navigation', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto('/');

    const menuButton = page.locator('#mobile-menu-btn');
    await expect(menuButton).toBeVisible();

    await menuButton.focus();
    await page.keyboard.press('Enter');

    const menu = page.locator('#mobile-menu');
    await expect(menu).not.toHaveClass(/translate-x-full/);

    const menuLinks = menu.locator('a');
    const menuLinkCount = await menuLinks.count();
    expect(menuLinkCount).toBeGreaterThan(0);
  });
});
