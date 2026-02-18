import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initArchiveRestoreHandlers } from './product-actions';

describe('initArchiveRestoreHandlers', () => {
	const productId = 'prod-123';

	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
		document.body.innerHTML = '';
		(window.location as any).href = 'http://localhost:4321';
	});

	afterEach(() => {
		document.body.innerHTML = '';
	});

	function setupArchiveButton() {
		const btn = document.createElement('button');
		btn.id = 'archive-product-btn';
		document.body.appendChild(btn);
		return btn;
	}

	function setupRestoreButton() {
		const btn = document.createElement('button');
		btn.id = 'restore-product-btn';
		document.body.appendChild(btn);
		return btn;
	}

	describe('archive button', () => {
		it('sends DELETE request and redirects on success', async () => {
			const btn = setupArchiveButton();
			(window as any).__confirmDialog = vi.fn().mockResolvedValue(true);
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
			});

			initArchiveRestoreHandlers(productId);
			btn.click();
			await vi.waitFor(() => {
				expect(global.fetch).toHaveBeenCalledWith(
					`/api/admin/products/${productId}`,
					expect.objectContaining({ method: 'DELETE' })
				);
			});
			expect(window.location.href).toBe('/admin/products?status=archived');
		});

		it('does not send request when user cancels confirmation', async () => {
			const btn = setupArchiveButton();
			(window as any).__confirmDialog = vi.fn().mockResolvedValue(false);

			initArchiveRestoreHandlers(productId);
			btn.click();

			// Give a tick for async handling
			await new Promise((r) => setTimeout(r, 50));
			expect(global.fetch).not.toHaveBeenCalled();
		});

		it('shows alert with API error message on failure', async () => {
			const btn = setupArchiveButton();
			(window as any).__confirmDialog = vi.fn().mockResolvedValue(true);
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				json: () => Promise.resolve({ message: 'Product has orders' }),
			});
			const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

			initArchiveRestoreHandlers(productId);
			btn.click();
			await vi.waitFor(() => {
				expect(alertSpy).toHaveBeenCalledWith('Product has orders');
			});
		});

		it('shows default error alert on failure without message', async () => {
			const btn = setupArchiveButton();
			(window as any).__confirmDialog = vi.fn().mockResolvedValue(true);
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				json: () => Promise.resolve({}),
			});
			const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

			initArchiveRestoreHandlers(productId);
			btn.click();
			await vi.waitFor(() => {
				expect(alertSpy).toHaveBeenCalledWith('Failed to archive');
			});
		});

		it('shows generic error on network failure', async () => {
			const btn = setupArchiveButton();
			(window as any).__confirmDialog = vi.fn().mockResolvedValue(true);
			(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error('Network error')
			);
			const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

			initArchiveRestoreHandlers(productId);
			btn.click();
			await vi.waitFor(() => {
				expect(alertSpy).toHaveBeenCalledWith('Failed to archive product');
			});
		});

		it('falls back to window.confirm when __confirmDialog is not set', async () => {
			const btn = setupArchiveButton();
			delete (window as any).__confirmDialog;
			const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
			});

			initArchiveRestoreHandlers(productId);
			btn.click();
			await vi.waitFor(() => {
				expect(confirmSpy).toHaveBeenCalled();
				expect(global.fetch).toHaveBeenCalled();
			});
		});
	});

	describe('restore button', () => {
		it('sends POST request and reloads on success', async () => {
			const btn = setupRestoreButton();
			(window as any).__confirmDialog = vi.fn().mockResolvedValue(true);
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
			});

			initArchiveRestoreHandlers(productId);
			btn.click();
			await vi.waitFor(() => {
				expect(global.fetch).toHaveBeenCalledWith(
					`/api/admin/products/${productId}/restore`,
					expect.objectContaining({ method: 'POST' })
				);
			});
			expect(window.location.reload).toHaveBeenCalled();
		});

		it('does not send request when user cancels restore', async () => {
			const btn = setupRestoreButton();
			(window as any).__confirmDialog = vi.fn().mockResolvedValue(false);

			initArchiveRestoreHandlers(productId);
			btn.click();

			await new Promise((r) => setTimeout(r, 50));
			expect(global.fetch).not.toHaveBeenCalled();
		});

		it('shows alert with error message on restore failure', async () => {
			const btn = setupRestoreButton();
			(window as any).__confirmDialog = vi.fn().mockResolvedValue(true);
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				json: () => Promise.resolve({ message: 'Cannot restore' }),
			});
			const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

			initArchiveRestoreHandlers(productId);
			btn.click();
			await vi.waitFor(() => {
				expect(alertSpy).toHaveBeenCalledWith('Cannot restore');
			});
		});

		it('shows generic error on restore network failure', async () => {
			const btn = setupRestoreButton();
			(window as any).__confirmDialog = vi.fn().mockResolvedValue(true);
			(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error('Network error')
			);
			const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

			initArchiveRestoreHandlers(productId);
			btn.click();
			await vi.waitFor(() => {
				expect(alertSpy).toHaveBeenCalledWith('Failed to restore product');
			});
		});
	});

	it('does nothing when buttons are not in DOM', () => {
		// No buttons in DOM - should not throw
		expect(() => initArchiveRestoreHandlers(productId)).not.toThrow();
	});
});
