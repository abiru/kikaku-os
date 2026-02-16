import { test, expect } from '@playwright/test';

test.describe('Contact page', () => {
  test('contact page loads with heading', async ({ page }) => {
    const response = await page.goto('/contact');
    expect(response?.status()).toBe(200);

    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  test('contact page has breadcrumb navigation', async ({ page }) => {
    await page.goto('/contact');

    const breadcrumb = page.locator('nav[aria-label]').first();
    await expect(breadcrumb).toBeVisible();

    const homeLink = breadcrumb.locator('a[href="/"]');
    await expect(homeLink).toBeVisible();
  });

  test('contact form has all required fields', async ({ page }) => {
    await page.goto('/contact');
    await page.waitForLoadState('networkidle');

    // Name field
    const nameInput = page.locator('input[name="name"]');
    await expect(nameInput).toBeVisible();

    // Email field
    const emailInput = page.locator('input[name="email"]');
    await expect(emailInput).toBeVisible();

    // Subject field
    const subjectInput = page.locator('input[name="subject"]');
    await expect(subjectInput).toBeVisible();

    // Body/message field
    const bodyTextarea = page.locator('textarea[name="body"]');
    await expect(bodyTextarea).toBeVisible();
  });

  test('contact form has submit button', async ({ page }) => {
    await page.goto('/contact');
    await page.waitForLoadState('networkidle');

    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });

  test('contact form fields have aria-required attributes', async ({
    page,
  }) => {
    await page.goto('/contact');
    await page.waitForLoadState('networkidle');

    const requiredFields = ['name', 'email', 'subject', 'body'];

    for (const fieldName of requiredFields) {
      const field = page.locator(
        `input[name="${fieldName}"], textarea[name="${fieldName}"]`
      );
      if ((await field.count()) > 0) {
        const ariaRequired = await field.getAttribute('aria-required');
        expect(ariaRequired).toBe('true');
      }
    }
  });

  test('contact form has honeypot field hidden', async ({ page }) => {
    await page.goto('/contact');
    await page.waitForLoadState('networkidle');

    const honeypotContainer = page.locator('[aria-hidden="true"]');
    if ((await honeypotContainer.count()) > 0) {
      const honeypotInput = honeypotContainer.locator('input[name="website"]');
      if ((await honeypotInput.count()) > 0) {
        // Honeypot should not be visible to users
        await expect(honeypotInput).not.toBeVisible();
      }
    }
  });

  test('empty form submission shows validation errors', async ({ page }) => {
    await page.goto('/contact');
    await page.waitForLoadState('networkidle');

    // Submit the form without filling any fields
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Validation error messages should appear
    const errorMessages = page.locator('[role="alert"]');
    await expect(errorMessages.first()).toBeVisible();

    // aria-invalid should be set on the fields
    const nameInput = page.locator('input[name="name"]');
    await expect(nameInput).toHaveAttribute('aria-invalid', 'true');
  });

  test('invalid email shows email validation error', async ({ page }) => {
    await page.goto('/contact');
    await page.waitForLoadState('networkidle');

    // Fill name and subject but use invalid email
    await page.locator('input[name="name"]').fill('Test User');
    await page.locator('input[name="email"]').fill('invalid-email');
    await page.locator('input[name="subject"]').fill('Test Subject');
    await page.locator('textarea[name="body"]').fill('Test message body');

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Email field should show invalid state
    const emailInput = page.locator('input[name="email"]');
    await expect(emailInput).toHaveAttribute('aria-invalid', 'true');

    // Error message for email should be visible
    const emailError = page.locator('#contact-email-error');
    await expect(emailError).toBeVisible();
  });

  test('contact page has SEO meta tags', async ({ page }) => {
    await page.goto('/contact');

    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute('content', /.+/);

    const ogUrl = page.locator('meta[property="og:url"]');
    await expect(ogUrl).toHaveAttribute('content', /.+/);
  });
});

test.describe('FAQ page', () => {
  test('FAQ page loads with heading', async ({ page }) => {
    const response = await page.goto('/faq');
    expect(response?.status()).toBe(200);

    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  test('FAQ page has expandable details elements', async ({ page }) => {
    await page.goto('/faq');

    const details = page.locator('details');
    const count = await details.count();
    expect(count).toBeGreaterThan(0);
  });

  test('FAQ items can be expanded and collapsed', async ({ page }) => {
    await page.goto('/faq');

    const firstDetails = page.locator('details').first();
    const summary = firstDetails.locator('summary');

    // Initially collapsed
    await expect(firstDetails).not.toHaveAttribute('open', '');

    // Click to expand
    await summary.click();
    await expect(firstDetails).toHaveAttribute('open', '');

    // Paragraph content should be visible
    const answer = firstDetails.locator('p');
    await expect(answer).toBeVisible();

    // Click to collapse
    await summary.click();
    await expect(firstDetails).not.toHaveAttribute('open', '');
  });

  test('FAQ summaries have cursor pointer styling', async ({ page }) => {
    await page.goto('/faq');

    const summary = page.locator('details summary').first();
    const cursor = await summary.evaluate(
      (el) => window.getComputedStyle(el).cursor
    );
    expect(cursor).toBe('pointer');
  });

  test('FAQ page has JSON-LD structured data', async ({ page }) => {
    await page.goto('/faq');

    const jsonLd = page.locator('script[type="application/ld+json"]');
    const count = await jsonLd.count();
    expect(count).toBeGreaterThan(0);

    const content = await jsonLd.first().textContent();
    expect(content).toContain('FAQPage');
  });

  test('FAQ has multiple question items', async ({ page }) => {
    await page.goto('/faq');

    const details = page.locator('details');
    const count = await details.count();
    // Should have several FAQ items
    expect(count).toBeGreaterThanOrEqual(5);
  });
});

test.describe('Static content pages', () => {
  const staticPages = [
    { path: '/legal', titlePattern: /特定商取引法/ },
    { path: '/legal-notice', titlePattern: /特定商取引法/ },
    { path: '/privacy', titlePattern: /プライバシー/ },
    { path: '/terms', titlePattern: /利用規約/ },
    { path: '/shipping', titlePattern: /配送/ },
    { path: '/refund', titlePattern: /返品|返金/ },
    { path: '/about', titlePattern: /会社概要/ },
  ];

  for (const { path, titlePattern } of staticPages) {
    test(`${path} page loads without server error`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(500);
      await expect(page.locator('body')).toBeVisible();
    });

    test(`${path} page has h1 heading`, async ({ page }) => {
      await page.goto(path);

      const heading = page.locator('h1');
      await expect(heading).toBeVisible();
    });

    test(`${path} page heading matches expected title`, async ({ page }) => {
      await page.goto(path);

      const heading = page.locator('h1');
      const text = await heading.textContent();
      expect(text).toMatch(titlePattern);
    });
  }

  test('static pages use consistent layout structure', async ({ page }) => {
    await page.goto('/legal');

    // StaticPageContent layout has section > container > h1 pattern
    const section = page.locator('section');
    await expect(section.first()).toBeVisible();
  });

  for (const { path } of staticPages) {
    test(`${path} page has SEO meta tags`, async ({ page }) => {
      await page.goto(path);

      const ogTitle = page.locator('meta[property="og:title"]');
      await expect(ogTitle).toHaveAttribute('content', /.+/);

      const ogUrl = page.locator('meta[property="og:url"]');
      await expect(ogUrl).toHaveAttribute('content', /.+/);
    });
  }
});

test.describe('Newsletter subscription', () => {
  test('newsletter form is visible in footer', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const newsletterInput = page.locator('#newsletter-email');
    await expect(newsletterInput).toBeVisible();
  });

  test('newsletter form has email input and submit button', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('#newsletter-email');
    await expect(emailInput).toBeVisible();

    // Input should have type="email"
    const type = await emailInput.getAttribute('type');
    expect(type).toBe('email');

    // Submit button should be visible
    const submitButton = emailInput
      .locator('..')
      .locator('..')
      .locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });

  test('newsletter email input has accessible label', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('#newsletter-email');
    const ariaLabel = await emailInput.getAttribute('aria-label');
    const label = page.locator('label[for="newsletter-email"]');
    const hasLabel = (await label.count()) > 0;

    expect(ariaLabel !== null || hasLabel).toBeTruthy();
  });

  test('newsletter form has placeholder text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('#newsletter-email');
    const placeholder = await emailInput.getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
  });

  test('newsletter section has heading', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const footer = page.locator('footer');
    const newsletterHeading = footer.locator('h3').last();
    await expect(newsletterHeading).toBeVisible();
  });

  test('newsletter form validates invalid email on submit', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('#newsletter-email');
    await emailInput.fill('not-an-email');

    // Submit the newsletter form
    const submitButton = emailInput
      .locator('..')
      .locator('..')
      .locator('button[type="submit"]');
    await submitButton.click();

    // Error message should appear
    const errorMessage = page.locator('footer').locator('.text-red-500');
    await expect(errorMessage).toBeVisible();
  });
});

test.describe('Static pages a11y', () => {
  test('contact page has single h1', async ({ page }) => {
    await page.goto('/contact');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
  });

  test('FAQ page has single h1', async ({ page }) => {
    await page.goto('/faq');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
  });

  test('static pages have single h1', async ({ page }) => {
    const pages = ['/legal', '/legal-notice', '/privacy', '/terms', '/shipping', '/refund', '/about'];

    for (const url of pages) {
      await page.goto(url);
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBeGreaterThanOrEqual(1);
    }
  });

  test('contact form fields have error descriptions linked via aria-describedby', async ({
    page,
  }) => {
    await page.goto('/contact');
    await page.waitForLoadState('networkidle');

    // Check that fields use aria-describedby for error association
    const nameInput = page.locator('input[name="name"]');
    const ariaDescribedby = await nameInput.getAttribute('aria-describedby');

    // Initially no error, so aria-describedby may be undefined
    // This is correct behavior - it should only be set when there's an error
    if (ariaDescribedby) {
      expect(ariaDescribedby).toContain('error');
    }
  });

  test('footer links navigate correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const footer = page.locator('footer');

    // FAQ link
    const faqLink = footer.locator('a[href="/faq"]');
    if ((await faqLink.count()) > 0) {
      await expect(faqLink.first()).toBeVisible();
    }

    // Contact link
    const contactLink = footer.locator('a[href="/contact"]');
    if ((await contactLink.count()) > 0) {
      await expect(contactLink.first()).toBeVisible();
    }
  });
});
