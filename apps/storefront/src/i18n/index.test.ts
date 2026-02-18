import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { t, translations, getLocale, setLocale } from './index';

// jsdom does not always provide a fully functional localStorage.
// Create an in-memory mock to ensure predictable test behavior.
const storageMap = new Map<string, string>();
const mockLocalStorage = {
	getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
	setItem: vi.fn((key: string, value: string) => { storageMap.set(key, value); }),
	removeItem: vi.fn((key: string) => { storageMap.delete(key); }),
	clear: vi.fn(() => { storageMap.clear(); }),
	get length() { return storageMap.size; },
	key: vi.fn((index: number) => [...storageMap.keys()][index] ?? null),
};

Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true });

describe('t() translation helper (ja)', () => {
	beforeEach(() => {
		storageMap.clear();
		storageMap.set('kikaku-locale', 'ja');
	});

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

	it('returns empty string when not found', () => {
		expect(t('nonexistent.key')).toBe('');
		expect(t('nav.nonexistent')).toBe('');
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

	it('returns empty string for non-string leaf value', () => {
		expect(t('common')).toBe('');
	});

	it('exports translations object (ja)', () => {
		expect(translations).toBeTruthy();
		expect(typeof translations).toBe('object');
		expect(translations.common).toBeTruthy();
	});
});

describe('t() translation helper (en)', () => {
	beforeEach(() => {
		storageMap.clear();
		storageMap.set('kikaku-locale', 'en');
	});

	it('resolves English translations', () => {
		expect(t('common.search')).toBe('Search');
		expect(t('nav.store')).toBe('Store');
		expect(t('cart.title')).toBe('Shopping Cart');
	});

	it('replaces parameters in English', () => {
		const result = t('cart.addForFreeShipping', { amount: '¥5,000' });
		expect(result).toBe('¥5,000 away from free shipping');
	});

	it('returns admin keys in Japanese (admin keys are not translated)', () => {
		expect(t('admin.dashboard')).toBe('ダッシュボード');
	});
});

describe('getLocale()', () => {
	beforeEach(() => {
		storageMap.clear();
	});

	it('returns saved locale from localStorage', () => {
		storageMap.set('kikaku-locale', 'en');
		expect(getLocale()).toBe('en');
	});

	it('returns ja when localStorage is set to ja', () => {
		storageMap.set('kikaku-locale', 'ja');
		expect(getLocale()).toBe('ja');
	});

	it('returns ja for admin routes regardless of preference', () => {
		storageMap.set('kikaku-locale', 'en');
		const originalPathname = window.location.pathname;
		Object.defineProperty(window.location, 'pathname', {
			value: '/admin/orders',
			writable: true,
		});
		expect(getLocale()).toBe('ja');
		Object.defineProperty(window.location, 'pathname', {
			value: originalPathname,
			writable: true,
		});
	});
});

describe('setLocale()', () => {
	beforeEach(() => {
		storageMap.clear();
		vi.clearAllMocks();
	});

	it('saves locale to localStorage', () => {
		setLocale('en');
		expect(mockLocalStorage.setItem).toHaveBeenCalledWith('kikaku-locale', 'en');
		expect(storageMap.get('kikaku-locale')).toBe('en');
	});

	it('saves ja locale to localStorage', () => {
		setLocale('ja');
		expect(mockLocalStorage.setItem).toHaveBeenCalledWith('kikaku-locale', 'ja');
		expect(storageMap.get('kikaku-locale')).toBe('ja');
	});
});
