import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock getApiBase
vi.mock('../api', () => ({
	getApiBase: () => 'https://api.example.com',
}));

// We need to set ADMIN_API_KEY before importing the module
const MOCK_API_KEY = 'test-admin-key';

describe('fetchAdmin', () => {
	let adminFetch: typeof import('./fetchAdmin').adminFetch;
	let adminFetchList: typeof import('./fetchAdmin').adminFetchList;
	let adminFetchOne: typeof import('./fetchAdmin').adminFetchOne;
	let adminPost: typeof import('./fetchAdmin').adminPost;
	let adminPut: typeof import('./fetchAdmin').adminPut;
	let adminDelete: typeof import('./fetchAdmin').adminDelete;

	beforeEach(async () => {
		vi.stubGlobal('fetch', vi.fn());
		// Stub import.meta.env
		vi.stubEnv('ADMIN_API_KEY', MOCK_API_KEY);
		// Re-import module to pick up env changes
		const mod = await import('./fetchAdmin');
		adminFetch = mod.adminFetch;
		adminFetchList = mod.adminFetchList;
		adminFetchOne = mod.adminFetchOne;
		adminPost = mod.adminPost;
		adminPut = mod.adminPut;
		adminDelete = mod.adminDelete;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	describe('adminFetch', () => {
		it('returns data on successful fetch', async () => {
			const mockData = { items: [1, 2, 3] };
			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify(mockData), { status: 200 })
			);

			const result = await adminFetch<{ items: number[] }>('/admin/test');

			expect(result).toEqual({ data: mockData, error: null });
			expect(fetch).toHaveBeenCalledWith(
				'https://api.example.com/admin/test',
				expect.objectContaining({
					headers: expect.objectContaining({
						'x-admin-key': MOCK_API_KEY,
					}),
				})
			);
		});

		it('returns error on non-ok response', async () => {
			vi.mocked(fetch).mockResolvedValue(
				new Response('Not Found', { status: 404, statusText: 'Not Found' })
			);

			const result = await adminFetch('/admin/missing');

			expect(result.data).toBeNull();
			expect(result.error).toContain('404');
		});

		it('returns error on network failure', async () => {
			vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

			const result = await adminFetch('/admin/test');

			expect(result.data).toBeNull();
			expect(result.error).toBe('Network error');
		});

		it('appends query params to URL', async () => {
			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({}), { status: 200 })
			);

			const query = new URLSearchParams({ page: '1', q: 'test' });
			await adminFetch('/admin/items', { query });

			expect(fetch).toHaveBeenCalledWith(
				'https://api.example.com/admin/items?page=1&q=test',
				expect.any(Object)
			);
		});
	});

	describe('adminFetchList', () => {
		it('calls adminFetch with query params', async () => {
			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({ items: [] }), { status: 200 })
			);

			const query = new URLSearchParams({ page: '2' });
			const result = await adminFetchList('/admin/items', query);

			expect(result.data).toEqual({ items: [] });
		});
	});

	describe('adminFetchOne', () => {
		it('calls adminFetch without query', async () => {
			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({ item: { id: 1 } }), { status: 200 })
			);

			const result = await adminFetchOne('/admin/items/1');

			expect(result.data).toEqual({ item: { id: 1 } });
		});
	});

	describe('adminPost', () => {
		it('sends POST with JSON body', async () => {
			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({ created: true }), { status: 201 })
			);

			const result = await adminPost('/admin/items', { name: 'test' });

			expect(result.data).toEqual({ created: true });
			expect(fetch).toHaveBeenCalledWith(
				'https://api.example.com/admin/items',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({ name: 'test' }),
					headers: expect.objectContaining({
						'content-type': 'application/json',
						'x-admin-key': MOCK_API_KEY,
					}),
				})
			);
		});
	});

	describe('adminPut', () => {
		it('sends PUT with JSON body', async () => {
			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({ updated: true }), { status: 200 })
			);

			const result = await adminPut('/admin/items/1', { name: 'updated' });

			expect(result.data).toEqual({ updated: true });
			expect(fetch).toHaveBeenCalledWith(
				'https://api.example.com/admin/items/1',
				expect.objectContaining({
					method: 'PUT',
					body: JSON.stringify({ name: 'updated' }),
				})
			);
		});
	});

	describe('adminDelete', () => {
		it('sends DELETE request', async () => {
			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({ deleted: true }), { status: 200 })
			);

			const result = await adminDelete('/admin/items/1');

			expect(result.data).toEqual({ deleted: true });
			expect(fetch).toHaveBeenCalledWith(
				'https://api.example.com/admin/items/1',
				expect.objectContaining({
					method: 'DELETE',
				})
			);
		});
	});
});
