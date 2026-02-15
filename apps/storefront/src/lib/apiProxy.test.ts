import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProxyHandler } from './apiProxy';

// Mock import.meta.env
vi.stubGlobal('import', { meta: { env: {} } });

describe('createProxyHandler', () => {
	const mockFetch = vi.fn();

	beforeEach(() => {
		vi.stubEnv('ADMIN_API_KEY', 'test-key');
		vi.stubEnv('PUBLIC_API_BASE', 'http://localhost:8787');
		vi.stubGlobal('fetch', mockFetch);
		mockFetch.mockReset();
	});

	it('returns a function', () => {
		const handler = createProxyHandler('/admin');
		expect(typeof handler).toBe('function');
	});

	it('proxies GET request to correct URL', async () => {
		mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

		const handler = createProxyHandler('/admin');
		const request = new Request('http://localhost:4321/api/admin/products?page=1', {
			method: 'GET',
		});

		const result = await handler({
			request,
			params: { path: 'products' },
			url: new URL('http://localhost:4321/api/admin/products?page=1'),
		} as any);

		expect(mockFetch).toHaveBeenCalledTimes(1);
		const [calledUrl, calledInit] = mockFetch.mock.calls[0];
		expect(calledUrl).toContain('/admin/products');
		expect(calledUrl).toContain('?page=1');
		expect(calledInit.method).toBe('GET');
		expect(result.status).toBe(200);
	});

	it('forwards content-type header', async () => {
		mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

		const handler = createProxyHandler('/admin');
		const request = new Request('http://localhost:4321/api/admin/products', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'test' }),
		});

		await handler({
			request,
			params: { path: 'products' },
			url: new URL('http://localhost:4321/api/admin/products'),
		} as any);

		const headers = mockFetch.mock.calls[0][1].headers;
		expect(headers.get('content-type')).toBe('application/json');
	});

	it('forwards authorization header', async () => {
		mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

		const handler = createProxyHandler('/admin');
		const request = new Request('http://localhost:4321/api/admin/products', {
			method: 'GET',
			headers: { authorization: 'Bearer token123' },
		});

		await handler({
			request,
			params: { path: 'products' },
			url: new URL('http://localhost:4321/api/admin/products'),
		} as any);

		const headers = mockFetch.mock.calls[0][1].headers;
		expect(headers.get('authorization')).toBe('Bearer token123');
	});

	it('includes body for POST requests', async () => {
		mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

		const handler = createProxyHandler('/admin');
		const body = JSON.stringify({ name: 'test' });
		const request = new Request('http://localhost:4321/api/admin/products', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body,
		});

		await handler({
			request,
			params: { path: 'products' },
			url: new URL('http://localhost:4321/api/admin/products'),
		} as any);

		expect(mockFetch.mock.calls[0][1].method).toBe('POST');
		expect(mockFetch.mock.calls[0][1].body).toBeDefined();
	});

	it('does not include body for GET requests', async () => {
		mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

		const handler = createProxyHandler('/admin');
		const request = new Request('http://localhost:4321/api/admin/products', {
			method: 'GET',
		});

		await handler({
			request,
			params: { path: 'products' },
			url: new URL('http://localhost:4321/api/admin/products'),
		} as any);

		expect(mockFetch.mock.calls[0][1].body).toBeUndefined();
	});

	it('uses empty string for missing path param', async () => {
		mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

		const handler = createProxyHandler('/inbox');
		const request = new Request('http://localhost:4321/api/inbox', {
			method: 'GET',
		});

		await handler({
			request,
			params: {},
			url: new URL('http://localhost:4321/api/inbox'),
		} as any);

		const calledUrl = mockFetch.mock.calls[0][0];
		expect(calledUrl).toContain('/inbox/');
	});
});
