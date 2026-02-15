import { describe, expect, it } from 'vitest';
import { t, translations } from './index';

describe('t() translation helper', () => {
	it('resolves top-level keys', () => {
		expect(t('common.search')).toBe('検索');
		expect(t('common.loading')).toBe('読み込み中...');
	});

	it('resolves nested keys', () => {
		expect(t('nav.store')).toBe('ストア');
		expect(t('cart.title')).toBe('ショッピングカート');
	});

	it('resolves deeply nested keys', () => {
		expect(t('checkout.steps.cart')).toBe('カート確認');
		expect(t('checkout.steps.payment')).toBe('お支払い');
	});

	it('returns key when not found', () => {
		expect(t('nonexistent.key')).toBe('nonexistent.key');
		expect(t('nav.nonexistent')).toBe('nav.nonexistent');
	});

	it('returns key for empty string key', () => {
		expect(t('')).toBe('');
	});

	it('replaces parameters', () => {
		const result = t('cart.addForFreeShipping', { amount: '¥5,000' });
		expect(result).toBe('送料無料まであと¥5,000');
	});

	it('replaces numeric parameters', () => {
		const result = t('footer.copyright', { year: 2026 });
		expect(result).toContain('2026');
	});

	it('returns key for non-string leaf value', () => {
		// 'common' resolves to an object, not a string
		expect(t('common')).toBe('common');
	});

	it('exports translations object', () => {
		expect(translations).toBeTruthy();
		expect(typeof translations).toBe('object');
		expect(translations.common).toBeTruthy();
	});
});
