import { describe, expect, it } from 'vitest';
import { formatPrice, formatDate } from './format';

describe('formatPrice', () => {
	it('formats JPY amounts without decimals', () => {
		const result = formatPrice(1000);
		expect(result).toContain('1,000');
	});

	it('formats zero', () => {
		const result = formatPrice(0);
		expect(result).toContain('0');
	});

	it('uses JPY as default currency', () => {
		const result = formatPrice(500);
		expect(result).toMatch(/[¥￥]/);
	});

	it('handles large amounts', () => {
		const result = formatPrice(1000000);
		expect(result).toContain('1,000,000');
	});

	it('accepts explicit currency', () => {
		const result = formatPrice(1000, 'JPY');
		expect(result).toMatch(/[¥￥]/);
	});

	it('falls back to JPY for falsy currency', () => {
		const result = formatPrice(500, '');
		expect(result).toMatch(/[¥￥]/);
	});
});

describe('formatDate', () => {
	it('formats valid ISO date string', () => {
		const result = formatDate('2026-01-15');
		expect(result).toBeTruthy();
		expect(result).not.toBe('-');
	});

	it('returns dash for null', () => {
		expect(formatDate(null)).toBe('-');
	});

	it('accepts custom format options', () => {
		const result = formatDate('2026-01-15', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		});
		expect(result).toBeTruthy();
		expect(result).not.toBe('-');
	});

	it('formats datetime strings', () => {
		const result = formatDate('2026-01-15T10:30:00Z');
		expect(result).toBeTruthy();
		expect(result).not.toBe('-');
	});
});
