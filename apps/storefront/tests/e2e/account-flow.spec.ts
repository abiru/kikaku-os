import { test, expect } from '@playwright/test';

// E2E test stubs for account flow (#677)
// Playwright is not yet configured — all tests are skipped until setup is complete.

test.describe.skip('Account Flow', () => {
  test('redirects to sign-in when not logged in', async ({ page }) => {
    const response = await page.goto('/account');
    // Should redirect to sign-in page
    expect(page.url()).toContain('/sign-in');
  });

  test('wishlist page loads', async ({ page }) => {
    const response = await page.goto('/wishlist');
    expect(response?.status()).toBe(200);

    const title = await page.title();
    expect(title).toBeTruthy();
  });

  // TODO: Auth-dependent tests require Clerk test session setup
  test.skip('authenticated user can view account dashboard', async ({ page }) => {
    // TODO: Set up authenticated session via Clerk test helpers
    // await page.goto('/account');
    // expect(page.url()).toContain('/account');
    // await expect(page.locator('text=ダッシュボード')).toBeVisible();
  });

  // TODO: Auth-dependent tests require Clerk test session setup
  test.skip('authenticated user can view order history', async ({ page }) => {
    // TODO: Set up authenticated session via Clerk test helpers
    // await page.goto('/account/orders');
    // await expect(page.locator('text=注文履歴')).toBeVisible();
  });

  // TODO: Auth-dependent tests require Clerk test session setup
  test.skip('authenticated user can edit profile', async ({ page }) => {
    // TODO: Set up authenticated session via Clerk test helpers
    // await page.goto('/account/profile');
    // await expect(page.locator('text=プロフィール')).toBeVisible();
  });
});
