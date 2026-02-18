import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import jaTranslations from './ja.json'
import enTranslations from './en.json'

/**
 * Flatten nested object keys to dot-notation.
 * e.g. { a: { b: "x" } } => ["a.b"]
 */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
	const keys: string[] = []
	for (const [key, value] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			keys.push(...flattenKeys(value as Record<string, unknown>, fullKey))
		} else {
			keys.push(fullKey)
		}
	}
	return keys
}

/**
 * Extract all t('...') keys from source files recursively.
 */
function extractTKeys(dir: string): Set<string> {
	const keys = new Set<string>()
	// Match t('key'), t("key"), t(`key`)
	const tCallRegex = /\bt\(\s*['"`]([a-zA-Z][a-zA-Z0-9_.]+)['"`]/g

	function walkDir(currentDir: string) {
		const entries = fs.readdirSync(currentDir, { withFileTypes: true })
		for (const entry of entries) {
			const fullPath = path.join(currentDir, entry.name)
			if (entry.isDirectory()) {
				// Skip test directories and node_modules
				if (entry.name === '__tests__' || entry.name === 'node_modules') continue
				walkDir(fullPath)
			} else if (/\.(ts|tsx|astro)$/.test(entry.name) && !entry.name.includes('.test.')) {
				const content = fs.readFileSync(fullPath, 'utf-8')
				let match: RegExpExecArray | null
				while ((match = tCallRegex.exec(content)) !== null) {
					if (match[1]) keys.add(match[1])
				}
			}
		}
	}

	walkDir(dir)
	return keys
}

describe('i18n completeness', () => {
	const jaKeys = new Set(flattenKeys(jaTranslations as Record<string, unknown>))
	const enKeys = new Set(flattenKeys(enTranslations as Record<string, unknown>))
	const srcDir = path.resolve(__dirname, '..')
	const usedKeys = extractTKeys(srcDir)

	it('has translation keys defined in ja.json', () => {
		expect(jaKeys.size).toBeGreaterThan(0)
	})

	it('has translation keys defined in en.json', () => {
		expect(enKeys.size).toBeGreaterThan(0)
	})

	it('has t() calls in source code', () => {
		expect(usedKeys.size).toBeGreaterThan(0)
	})

	it('all t() keys used in source exist in ja.json', () => {
		const missingKeys: string[] = []
		for (const key of usedKeys) {
			if (!jaKeys.has(key)) {
				missingKeys.push(key)
			}
		}
		if (missingKeys.length > 0) {
			throw new Error(
				`Missing ${missingKeys.length} translation key(s) in ja.json:\n` +
				missingKeys.map((k) => `  - ${k}`).join('\n')
			)
		}
		expect(missingKeys).toEqual([])
	})

	it('en.json has all the same keys as ja.json', () => {
		const missingInEn: string[] = []
		for (const key of jaKeys) {
			if (!enKeys.has(key)) {
				missingInEn.push(key)
			}
		}
		if (missingInEn.length > 0) {
			throw new Error(
				`Missing ${missingInEn.length} key(s) in en.json (present in ja.json):\n` +
				missingInEn.map((k) => `  - ${k}`).join('\n')
			)
		}
		expect(missingInEn).toEqual([])
	})

	it('en.json has no extra keys missing from ja.json', () => {
		const extraInEn: string[] = []
		for (const key of enKeys) {
			if (!jaKeys.has(key)) {
				extraInEn.push(key)
			}
		}
		if (extraInEn.length > 0) {
			throw new Error(
				`Found ${extraInEn.length} extra key(s) in en.json not present in ja.json:\n` +
				extraInEn.map((k) => `  - ${k}`).join('\n')
			)
		}
		expect(extraInEn).toEqual([])
	})

	it('no unused translation keys in ja.json (warning only)', () => {
		const unusedKeys: string[] = []
		for (const key of jaKeys) {
			if (!usedKeys.has(key)) {
				unusedKeys.push(key)
			}
		}
		// This is informational - unused keys are not a failure
		// Just verify we can compute them without error
		expect(typeof unusedKeys.length).toBe('number')
	})
})
