import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger', () => ({
	logError: vi.fn(),
}));

import { handlePageUpdate } from './page-actions';

function createFormData(entries: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		fd.append(key, value);
	}
	return fd;
}

const mockT = (key: string) => key;

describe('handlePageUpdate', () => {
	const apiBase = 'http://localhost:8787';
	const apiKey = 'test-key';
	const id = '1';

	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	it('returns error when slug is empty', async () => {
		const fd = createFormData({ slug: '', title: 'Test' });
		const result = await handlePageUpdate(fd, apiBase, apiKey, id, mockT);

		expect(result).toEqual({
			page: null,
			error: 'errors.slugRequired',
			successMessage: null,
		});
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('returns error when slug contains invalid characters', async () => {
		const fd = createFormData({ slug: 'Invalid Slug!', title: 'Test' });
		const result = await handlePageUpdate(fd, apiBase, apiKey, id, mockT);

		expect(result).toEqual({
			page: null,
			error: 'errors.slugInvalid',
			successMessage: null,
		});
	});

	it('returns error when title is empty', async () => {
		const fd = createFormData({ slug: 'valid-slug', title: '' });
		const result = await handlePageUpdate(fd, apiBase, apiKey, id, mockT);

		expect(result).toEqual({
			page: null,
			error: 'errors.titleRequired',
			successMessage: null,
		});
	});

	it('sends PUT request and returns page on success', async () => {
		const mockPage = { id: 1, slug: 'about', title: 'About' };
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ page: mockPage }),
		});

		const fd = createFormData({
			slug: 'about',
			title: 'About',
			meta_title: 'About Us',
			meta_description: 'Learn about us',
			body: '<p>Hello</p>',
			status: 'published',
		});

		const result = await handlePageUpdate(fd, apiBase, apiKey, id, mockT);

		expect(result).toEqual({
			page: mockPage,
			error: null,
			successMessage: 'admin.pageUpdated',
		});

		expect(global.fetch).toHaveBeenCalledWith(
			'http://localhost:8787/admin/pages/1',
			expect.objectContaining({
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					'x-admin-key': 'test-key',
				},
			})
		);
	});

	it('sends null for empty meta fields', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ page: { id: 1 } }),
		});

		const fd = createFormData({
			slug: 'about',
			title: 'About',
			meta_title: '',
			meta_description: '',
			body: '',
			status: 'draft',
		});

		await handlePageUpdate(fd, apiBase, apiKey, id, mockT);

		const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		const body = JSON.parse(fetchCall[1].body);
		expect(body.meta_title).toBeNull();
		expect(body.meta_description).toBeNull();
	});

	it('returns error message from API response', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: () => Promise.resolve({ message: 'Slug already exists' }),
		});

		const fd = createFormData({ slug: 'about', title: 'About' });
		const result = await handlePageUpdate(fd, apiBase, apiKey, id, mockT);

		expect(result).toEqual({
			page: null,
			error: 'Slug already exists',
			successMessage: null,
		});
	});

	it('returns default error when API response has no message', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: () => Promise.resolve({}),
		});

		const fd = createFormData({ slug: 'about', title: 'About' });
		const result = await handlePageUpdate(fd, apiBase, apiKey, id, mockT);

		expect(result).toEqual({
			page: null,
			error: 'errors.failedToUpdatePage',
			successMessage: null,
		});
	});

	it('returns error on network failure', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new Error('Network error')
		);

		const fd = createFormData({ slug: 'about', title: 'About' });
		const result = await handlePageUpdate(fd, apiBase, apiKey, id, mockT);

		expect(result).toEqual({
			page: null,
			error: 'errors.failedToUpdatePage',
			successMessage: null,
		});
	});

	it('converts slug to lowercase', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ page: { id: 1 } }),
		});

		const fd = createFormData({ slug: '  About-Us  ', title: 'About' });
		await handlePageUpdate(fd, apiBase, apiKey, id, mockT);

		const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		const body = JSON.parse(fetchCall[1].body);
		expect(body.slug).toBe('about-us');
	});
});
