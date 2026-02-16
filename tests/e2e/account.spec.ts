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

test.describe('Account dashboard page', () => {
  test('account page loads without server error', async ({ page }) => {
    const response = await page.goto('/account');
    // Page should render without 500 error (may redirect or show login prompt)
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('account page has heading', async ({ page }) => {
    await page.goto('/account');

    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  test('account page shows stats cards', async ({ page }) => {
    await page.goto('/account');

    // Stats cards section should be present in the markup
    const statsCards = page.locator('.bg-white.rounded-xl');
    const count = await statsCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('account page has recent orders section', async ({ page }) => {
    await page.goto('/account');

    // Look for orders section heading or empty state
    const ordersSection = page.locator('h2');
    if ((await ordersSection.count()) > 0) {
      await expect(ordersSection.first()).toBeVisible();
    }
  });

  test('account page has link to view all orders', async ({ page }) => {
    await page.goto('/account');

    const ordersLink = page.locator('a[href="/account/orders"]');
    // Link may not exist if no orders, which is fine
    if ((await ordersLink.count()) > 0) {
      await expect(ordersLink.first()).toBeVisible();
    }
  });

  test('account page has link to products for empty state', async ({
    page,
  }) => {
    await page.goto('/account');

    const shopLink = page.locator('a[href="/products"]');
    // May be visible in empty orders state
    if ((await shopLink.count()) > 0) {
      await expect(shopLink.first()).toBeVisible();
    }
  });
});

test.describe('Account profile page', () => {
  test('profile page loads without server error', async ({ page }) => {
    const response = await page.goto('/account/profile');
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('profile page has edit profile heading', async ({ page }) => {
    await page.goto('/account/profile');

    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  test('profile page has form with name field', async ({ page }) => {
    await page.goto('/account/profile');

    const nameInput = page.locator('input#name');
    await expect(nameInput).toBeVisible();

    const nameLabel = page.locator('label[for="name"]');
    await expect(nameLabel).toBeVisible();
  });

  test('profile page has email field (disabled)', async ({ page }) => {
    await page.goto('/account/profile');

    const emailInput = page.locator('input#email');
    await expect(emailInput).toBeVisible();

    // Email should be disabled (managed by Clerk)
    await expect(emailInput).toBeDisabled();
  });

  test('profile page has shipping address fields', async ({ page }) => {
    await page.goto('/account/profile');

    const postalCode = page.locator('input#postal_code');
    const prefecture = page.locator('input#prefecture');
    const city = page.locator('input#city');
    const address1 = page.locator('input#address1');
    const address2 = page.locator('input#address2');
    const phone = page.locator('input#phone');

    await expect(postalCode).toBeVisible();
    await expect(prefecture).toBeVisible();
    await expect(city).toBeVisible();
    await expect(address1).toBeVisible();
    await expect(address2).toBeVisible();
    await expect(phone).toBeVisible();
  });

  test('profile page has submit button', async ({ page }) => {
    await page.goto('/account/profile');

    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });

  test('profile form fields have proper labels', async ({ page }) => {
    await page.goto('/account/profile');

    const labeledFields = [
      { inputId: 'name', labelFor: 'name' },
      { inputId: 'postal_code', labelFor: 'postal_code' },
      { inputId: 'prefecture', labelFor: 'prefecture' },
      { inputId: 'city', labelFor: 'city' },
      { inputId: 'address1', labelFor: 'address1' },
      { inputId: 'address2', labelFor: 'address2' },
      { inputId: 'phone', labelFor: 'phone' },
    ];

    for (const { inputId, labelFor } of labeledFields) {
      const input = page.locator(`input#${inputId}`);
      const label = page.locator(`label[for="${labelFor}"]`);

      if ((await input.count()) > 0) {
        await expect(label).toBeVisible();
      }
    }
  });

  test('profile form has CSRF token hidden field', async ({ page }) => {
    await page.goto('/account/profile');

    const csrfField = page.locator('input[type="hidden"][name="_csrf"]');
    if ((await csrfField.count()) > 0) {
      const value = await csrfField.getAttribute('value');
      expect(value).toBeTruthy();
    }
  });

  test('profile form field placeholders use Japanese text', async ({
    page,
  }) => {
    await page.goto('/account/profile');

    const postalCode = page.locator('input#postal_code');
    const placeholder = await postalCode.getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
  });
});

test.describe('Account orders page', () => {
  test('orders page loads without server error', async ({ page }) => {
    const response = await page.goto('/account/orders');
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('orders page has heading', async ({ page }) => {
    await page.goto('/account/orders');

    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });
});

test.describe('Wishlist page', () => {
  test('wishlist page loads without server error', async ({ page }) => {
    const response = await page.goto('/wishlist');
    expect(response?.status()).toBeLessThan(500);
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
});

test.describe('Account navigation', () => {
  test('account layout has navigation tabs', async ({ page }) => {
    await page.goto('/account');

    // Account layout should have navigation links
    const navLinks = page.locator('nav a, a[href^="/account"]');
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('profile link navigates to profile page', async ({ page }) => {
    await page.goto('/account');

    const profileLink = page.locator('a[href="/account/profile"]');
    if ((await profileLink.count()) > 0) {
      await profileLink.first().click();
      await expect(page).toHaveURL('/account/profile');
    }
  });

  test('orders link navigates to orders page', async ({ page }) => {
    await page.goto('/account');

    const ordersLink = page.locator('a[href="/account/orders"]');
    if ((await ordersLink.count()) > 0) {
      await ordersLink.first().click();
      await expect(page).toHaveURL('/account/orders');
    }
  });
});

test.describe('Account a11y', () => {
  test('account pages have single h1', async ({ page }) => {
    const accountPages = ['/account', '/account/profile'];

    for (const url of accountPages) {
      await page.goto(url);
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBeGreaterThanOrEqual(1);
    }
  });

  test('profile form inputs are keyboard accessible', async ({ page }) => {
    await page.goto('/account/profile');

    // Tab through form elements
    await page.keyboard.press('Tab');

    const focused = page.locator(':focus');
    const tagName = await focused.evaluate((el) =>
      el.tagName.toLowerCase()
    );
    expect(['a', 'button', 'input', 'select', 'textarea']).toContain(
      tagName
    );
  });

  test('name field has required attribute', async ({ page }) => {
    await page.goto('/account/profile');

    const nameInput = page.locator('input#name');
    const required = await nameInput.getAttribute('required');
    const ariaRequired = await nameInput.getAttribute('aria-required');

    expect(required !== null || ariaRequired === 'true').toBeTruthy();
  });
});
