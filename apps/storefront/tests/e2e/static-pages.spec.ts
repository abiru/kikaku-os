import { test, expect } from '@playwright/test';

// E2E test stubs for static pages (#680)
// These tests verify that each static page returns 200 and has a title.
// Playwright is not yet configured — all tests are skipped until setup is complete.

const staticPages = [
  { path: '/about', name: 'About' },
  { path: '/faq', name: 'FAQ' },
  { path: '/privacy', name: 'Privacy Policy' },
  { path: '/terms', name: 'Terms of Use' },
  { path: '/legal', name: 'Legal' },
  { path: '/legal-notice', name: 'Legal Notice' },
  { path: '/refund', name: 'Refund Policy' },
  { path: '/shipping', name: 'Shipping Policy' },
];

test.describe.skip('Static Pages', () => {
  for (const page of staticPages) {
    test(`${page.name} page (${page.path}) loads successfully`, async ({ page: browserPage }) => {
      const response = await browserPage.goto(page.path);
      expect(response?.status()).toBe(200);

      const title = await browserPage.title();
      expect(title).toBeTruthy();
    });
  }
});
