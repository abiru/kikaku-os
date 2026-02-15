import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiBase, buildStoreUrl, fetchJson } from './api';

describe('getApiBase', () => {
	const original = process.env.PUBLIC_API_BASE;

	afterEach(() => {
		if (original === undefined) {
			delete process.env.PUBLIC_API_BASE;
		} else {
			process.env.PUBLIC_API_BASE = original;
		}
	});

	it('prefers PUBLIC_API_BASE env', () => {
		process.env.PUBLIC_API_BASE = 'https://example.com';
		expect(getApiBase()).toBe('https://example.com');
	});
});

describe('buildStoreUrl', () => {
	it('prepends /store to path', () => {
		expect(buildStoreUrl('/products', 'https://api.example.com')).toBe(
			'https://api.example.com/store/products'
		);
	});

	it('does not double /store prefix', () => {
		expect(buildStoreUrl('/store/products', 'https://api.example.com')).toBe(
			'https://api.example.com/store/products'
		);
	});

	it('strips trailing slashes from base', () => {
		expect(buildStoreUrl('/products', 'https://api.example.com/')).toBe(
			'https://api.example.com/store/products'
		);
	});

	it('handles path without leading slash', () => {
		expect(buildStoreUrl('products', 'https://api.example.com')).toBe(
			'https://api.example.com/store/products'
		);
	});

	it('handles /store path directly', () => {
		expect(buildStoreUrl('/store', 'https://api.example.com')).toBe(
			'https://api.example.com/store'
		);
	});
});

describe('fetchJson', () => {
	it('parses JSON response', async () => {
		const mockFetch = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ ok: true, data: 'test' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			})
		);
		vi.stubGlobal('fetch', mockFetch);

		const result = await fetchJson<{ ok: boolean; data: string }>('https://api.example.com/test');
		expect(result).toEqual({ ok: true, data: 'test' });

		vi.unstubAllGlobals();
	});

	it('throws on non-ok response with message', async () => {
		const mockFetch = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ message: 'Not found' }), {
				status: 404,
				statusText: 'Not Found',
			})
		);
		vi.stubGlobal('fetch', mockFetch);

		await expect(fetchJson('https://api.example.com/missing')).rejects.toThrow('Not found');

		vi.unstubAllGlobals();
	});

	it('throws with statusText when no message in body', async () => {
		const mockFetch = vi.fn().mockResolvedValue(
			new Response('', {
				status: 500,
				statusText: 'Internal Server Error',
			})
		);
		vi.stubGlobal('fetch', mockFetch);

		await expect(fetchJson('https://api.example.com/error')).rejects.toThrow(
			'Internal Server Error'
		);

		vi.unstubAllGlobals();
	});

	it('skips JSON parsing when parseJson is false', async () => {
		const mockFetch = vi.fn().mockResolvedValue(
			new Response('raw text', { status: 200 })
		);
		vi.stubGlobal('fetch', mockFetch);

		const result = await fetchJson('https://api.example.com/raw', { parseJson: false });
		expect(result).toBe('raw text');

		vi.unstubAllGlobals();
	});
});
