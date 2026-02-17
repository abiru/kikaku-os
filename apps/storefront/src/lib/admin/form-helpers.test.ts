import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger', () => ({
	logError: vi.fn(),
}));

import { adminFormHandler } from './form-helpers';

function createMockRequest(formEntries: Record<string, string>): Request {
	const formData = new FormData();
	for (const [key, value] of Object.entries(formEntries)) {
		formData.append(key, value);
	}
	return {
		formData: () => Promise.resolve(formData),
	} as unknown as Request;
}

describe('adminFormHandler', () => {
	const baseOptions = {
		apiBase: 'http://localhost:8787',
		apiKey: 'test-key',
		resource: 'customers',
		id: '1',
	};

	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	it('returns error when apiKey is missing', async () => {
		const result = await adminFormHandler({
			...baseOptions,
			apiKey: '',
			request: createMockRequest({ name: 'Alice' }),
		});

		expect(result).toEqual({
			data: null,
			success: false,
			error: 'ADMIN_API_KEY is not configured',
		});
	});

	it('sends PUT request by default with form data as JSON', async () => {
		const mockResponse = { customer: { id: 1, name: 'Alice' } };
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockResponse),
		});

		const result = await adminFormHandler({
			...baseOptions,
			request: createMockRequest({ name: 'Alice' }),
		});

		expect(result).toEqual({ data: mockResponse, success: true, error: null });
		expect(global.fetch).toHaveBeenCalledWith(
			'http://localhost:8787/admin/customers/1',
			expect.objectContaining({
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					'x-admin-key': 'test-key',
				},
			})
		);
	});

	it('uses custom method when specified', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({}),
		});

		await adminFormHandler({
			...baseOptions,
			request: createMockRequest({ name: 'Alice' }),
			method: 'POST',
		});

		expect(global.fetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('uses transformFormData when provided', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ ok: true }),
		});

		await adminFormHandler({
			...baseOptions,
			request: createMockRequest({ name: '  Alice  ' }),
			transformFormData: (fd) => {
				const name = fd.get('name')?.toString().trim() || '';
				return { name };
			},
		});

		const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const body = JSON.parse(fetchCall[1].body);
		expect(body).toEqual({ name: 'Alice' });
	});

	it('returns validation error from transformFormData', async () => {
		const result = await adminFormHandler({
			...baseOptions,
			request: createMockRequest({ name: '' }),
			transformFormData: () => {
				throw new Error('Name is required');
			},
		});

		expect(result).toEqual({
			data: null,
			success: false,
			error: 'Name is required',
		});
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('handles non-Error thrown from transformFormData via outer catch', async () => {
		const result = await adminFormHandler({
			...baseOptions,
			request: createMockRequest({ name: '' }),
			transformFormData: () => {
				throw 'string error';
			},
		});

		// Non-Error exceptions bubble to the outer catch block
		expect(result.success).toBe(false);
		expect(result.data).toBeNull();
		expect(result.error).toContain('Failed to update customers');
	});

	it('returns API error message from response', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: () => Promise.resolve({ message: 'Duplicate entry' }),
		});

		const result = await adminFormHandler({
			...baseOptions,
			request: createMockRequest({ name: 'Alice' }),
		});

		expect(result).toEqual({
			data: null,
			success: false,
			error: 'Duplicate entry',
		});
	});

	it('returns error field from response when message is absent', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: () => Promise.resolve({ error: 'Validation failed' }),
		});

		const result = await adminFormHandler({
			...baseOptions,
			request: createMockRequest({ name: 'Alice' }),
		});

		expect(result).toEqual({
			data: null,
			success: false,
			error: 'Validation failed',
		});
	});

	it('returns custom error message from options', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: () => Promise.resolve({}),
		});

		const result = await adminFormHandler({
			...baseOptions,
			request: createMockRequest({ name: 'Alice' }),
			errorMessage: 'Custom update error',
		});

		expect(result).toEqual({
			data: null,
			success: false,
			error: 'Custom update error',
		});
	});

	it('returns default error when API fails with no message', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: () => Promise.resolve({}),
		});

		const result = await adminFormHandler({
			...baseOptions,
			request: createMockRequest({ name: 'Alice' }),
		});

		expect(result).toEqual({
			data: null,
			success: false,
			error: 'Failed to update customers',
		});
	});

	it('returns connection error on network failure', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new Error('Network error')
		);

		const result = await adminFormHandler({
			...baseOptions,
			request: createMockRequest({ name: 'Alice' }),
		});

		expect(result).toEqual({
			data: null,
			success: false,
			error: 'Failed to update customers. Please check your connection.',
		});
	});

	it('returns custom error message on network failure', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new Error('Network error')
		);

		const result = await adminFormHandler({
			...baseOptions,
			request: createMockRequest({ name: 'Alice' }),
			errorMessage: 'Save failed',
		});

		expect(result).toEqual({
			data: null,
			success: false,
			error: 'Save failed',
		});
	});
});
