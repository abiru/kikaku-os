import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger', () => ({
	logError: vi.fn(),
}));

import { fetchAdminResource } from './fetch-helpers';

describe('fetchAdminResource', () => {
	const baseOptions = {
		apiBase: 'http://localhost:8787',
		apiKey: 'test-key',
		resource: 'products',
		id: '42',
	};

	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	it('returns error when apiKey is missing', async () => {
		const result = await fetchAdminResource({
			...baseOptions,
			apiKey: '',
		});

		expect(result).toEqual({
			data: null,
			error: 'ADMIN_API_KEY is not configured',
		});
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('fetches resource successfully', async () => {
		const mockData = { product: { id: 42, name: 'Widget' } };
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockData),
		});

		const result = await fetchAdminResource<{ product: { id: number; name: string } }>(baseOptions);

		expect(result).toEqual({ data: mockData, error: null });
		expect(global.fetch).toHaveBeenCalledWith(
			'http://localhost:8787/admin/products/42',
			{ headers: { 'x-admin-key': 'test-key' } }
		);
	});

	it('returns custom not found message on 404', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 404,
		});

		const result = await fetchAdminResource({
			...baseOptions,
			notFoundMessage: 'Product not found',
		});

		expect(result).toEqual({
			data: null,
			error: 'Product not found',
		});
	});

	it('returns default not found message on 404', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 404,
		});

		const result = await fetchAdminResource(baseOptions);

		expect(result).toEqual({
			data: null,
			error: 'products not found',
		});
	});

	it('returns API error message from response body', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: () => Promise.resolve({ message: 'Internal error' }),
		});

		const result = await fetchAdminResource(baseOptions);

		expect(result).toEqual({
			data: null,
			error: 'Internal error',
		});
	});

	it('returns error field from response body when message is absent', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 400,
			json: () => Promise.resolve({ error: 'Bad request' }),
		});

		const result = await fetchAdminResource(baseOptions);

		expect(result).toEqual({
			data: null,
			error: 'Bad request',
		});
	});

	it('returns status code error when body has no message', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 503,
			json: () => Promise.resolve({}),
		});

		const result = await fetchAdminResource(baseOptions);

		expect(result).toEqual({
			data: null,
			error: 'API Error: 503',
		});
	});

	it('handles json parse failure gracefully', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: () => Promise.reject(new Error('invalid json')),
		});

		const result = await fetchAdminResource(baseOptions);

		expect(result).toEqual({
			data: null,
			error: 'API Error: 500',
		});
	});

	it('returns custom error message on network failure', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new Error('Network error')
		);

		const result = await fetchAdminResource({
			...baseOptions,
			errorMessage: 'Custom network error',
		});

		expect(result).toEqual({
			data: null,
			error: 'Custom network error',
		});
	});

	it('returns default error message on network failure', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new Error('Network error')
		);

		const result = await fetchAdminResource(baseOptions);

		expect(result).toEqual({
			data: null,
			error: 'Failed to load products. Please check your connection.',
		});
	});
});
