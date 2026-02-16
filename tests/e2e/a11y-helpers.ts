/**
 * axe-core accessibility testing helpers for Playwright E2E tests.
 *
 * Usage in test files:
 *
 * ```ts
 * import { checkA11y } from './a11y-helpers'
 *
 * test('page is accessible', async ({ page }) => {
 *   await page.goto('/some-page')
 *   const results = await checkA11y(page)
 *   expect(results.violations).toEqual([])
 * })
 * ```
 */
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

export type A11yCheckOptions = {
	/** axe-core tags to include (e.g., ['wcag2a', 'wcag2aa']) */
	tags?: string[]
	/** CSS selector to scope the analysis */
	include?: string
	/** CSS selectors to exclude from analysis */
	exclude?: string[]
}

/**
 * Run axe-core accessibility analysis on the given page.
 *
 * @param page - Playwright page object
 * @param options - Optional configuration for the analysis
 * @returns axe-core AxeResults
 */
export async function checkA11y(page: Page, options: A11yCheckOptions = {}) {
	let builder = new AxeBuilder({ page })

	if (options.tags) {
		builder = builder.withTags(options.tags)
	}

	if (options.include) {
		builder = builder.include(options.include)
	}

	if (options.exclude) {
		for (const selector of options.exclude) {
			builder = builder.exclude(selector)
		}
	}

	return builder.analyze()
}
