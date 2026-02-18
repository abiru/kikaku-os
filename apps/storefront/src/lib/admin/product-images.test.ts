import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initImageHandlers } from './product-images';

describe('initImageHandlers', () => {
	const productId = 'prod-456';

	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
		document.body.innerHTML = '';
	});

	afterEach(() => {
		document.body.innerHTML = '';
	});

	function setupDOM() {
		document.body.innerHTML = `
			<input type="file" id="image-upload" />
			<div id="upload-progress" class="hidden"></div>
			<div id="image-error" class="hidden"><div></div></div>
		`;
		return {
			imageUpload: document.getElementById('image-upload') as HTMLInputElement,
			uploadProgress: document.getElementById('upload-progress')!,
			imageError: document.getElementById('image-error')!,
		};
	}

	function createFileList(files: File[]): FileList {
		const list = {
			length: files.length,
			item: (i: number) => files[i] || null,
			[Symbol.iterator]: function* () {
				for (const f of files) yield f;
			},
		} as unknown as FileList;
		for (let i = 0; i < files.length; i++) {
			(list as any)[i] = files[i];
		}
		return list;
	}

	function triggerFileChange(input: HTMLInputElement, files: File[]) {
		Object.defineProperty(input, 'files', {
			value: createFileList(files),
			writable: true,
			configurable: true,
		});
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}

	describe('image upload', () => {
		it('sends POST with FormData to correct endpoint on file selection', async () => {
			const { imageUpload } = setupDOM();
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
			});

			initImageHandlers(productId);

			const file = new File(['image-data'], 'test.jpg', {
				type: 'image/jpeg',
			});
			triggerFileChange(imageUpload, [file]);

			await vi.waitFor(() => {
				expect(global.fetch).toHaveBeenCalledWith(
					`/api/admin/products/${productId}/images`,
					expect.objectContaining({
						method: 'POST',
					})
				);
			});
			// Verify FormData was sent
			const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock
				.calls[0]!;
			expect(callArgs[1].body).toBeInstanceOf(FormData);
		});

		it('reloads page on successful upload', async () => {
			setupDOM();
			const imageUpload = document.getElementById(
				'image-upload'
			) as HTMLInputElement;
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
			});

			initImageHandlers(productId);
			triggerFileChange(imageUpload, [
				new File(['data'], 'img.png', { type: 'image/png' }),
			]);

			await vi.waitFor(() => {
				expect(window.location.reload).toHaveBeenCalled();
			});
		});

		it('shows error message on upload failure', async () => {
			const { imageError } = setupDOM();
			const imageUpload = document.getElementById(
				'image-upload'
			) as HTMLInputElement;
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				json: () => Promise.resolve({ message: 'File too large' }),
			});

			initImageHandlers(productId);
			triggerFileChange(imageUpload, [
				new File(['data'], 'big.jpg', { type: 'image/jpeg' }),
			]);

			await vi.waitFor(() => {
				const errorDiv = imageError.querySelector('div');
				expect(errorDiv?.textContent).toBe('File too large');
				expect(imageError.classList.contains('hidden')).toBe(false);
			});
		});

		it('shows generic error on network failure', async () => {
			const { imageError } = setupDOM();
			const imageUpload = document.getElementById(
				'image-upload'
			) as HTMLInputElement;
			(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error('Network error')
			);

			initImageHandlers(productId);
			triggerFileChange(imageUpload, [
				new File(['data'], 'img.jpg', { type: 'image/jpeg' }),
			]);

			await vi.waitFor(() => {
				const errorDiv = imageError.querySelector('div');
				expect(errorDiv?.textContent).toBe(
					'Failed to upload images. Please try again.'
				);
			});
		});

		it('hides progress and resets input after upload', async () => {
			setupDOM();
			const imageUpload = document.getElementById(
				'image-upload'
			) as HTMLInputElement;
			const uploadProgress = document.getElementById('upload-progress')!;
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
			});

			initImageHandlers(productId);
			triggerFileChange(imageUpload, [
				new File(['data'], 'img.jpg', { type: 'image/jpeg' }),
			]);

			await vi.waitFor(() => {
				expect(uploadProgress.classList.contains('hidden')).toBe(true);
				expect(imageUpload.value).toBe('');
			});
		});

		it('does nothing when no files are selected', async () => {
			setupDOM();
			const imageUpload = document.getElementById(
				'image-upload'
			) as HTMLInputElement;

			initImageHandlers(productId);
			// Dispatch change event with empty file list
			triggerFileChange(imageUpload, []);

			await new Promise((r) => setTimeout(r, 50));
			expect(global.fetch).not.toHaveBeenCalled();
		});
	});

	describe('image delete (event delegation)', () => {
		it('sends DELETE request on delete button click', async () => {
			setupDOM();
			(window as any).__confirmDialog = vi.fn().mockResolvedValue(true);
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
				Promise.resolve({ ok: true })
			);

			initImageHandlers(productId);

			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'delete-image-btn';
			deleteBtn.dataset.imageId = 'img-789';
			deleteBtn.dataset.imageFilename = 'photo.jpg';
			document.body.appendChild(deleteBtn);

			deleteBtn.click();

			await vi.waitFor(() => {
				expect(global.fetch).toHaveBeenCalledWith(
					`/api/admin/products/${productId}/images/img-789`,
					expect.objectContaining({ method: 'DELETE' })
				);
			});
			expect(window.location.reload).toHaveBeenCalled();
		});

		it('does not delete when user cancels confirmation', async () => {
			setupDOM();
			(window as any).__confirmDialog = vi.fn().mockResolvedValue(false);
			// Also set for any stale handlers from previous tests
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
				Promise.resolve({ ok: true })
			);

			initImageHandlers(productId);

			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'delete-image-btn';
			deleteBtn.dataset.imageId = 'img-789';
			deleteBtn.dataset.imageFilename = 'photo.jpg';
			document.body.appendChild(deleteBtn);

			deleteBtn.click();

			await new Promise((r) => setTimeout(r, 50));
			expect(global.fetch).not.toHaveBeenCalled();
		});

		it('shows error on delete failure', async () => {
			const { imageError } = setupDOM();
			(window as any).__confirmDialog = vi.fn().mockResolvedValue(true);
			// Use mockImplementation so ALL invocations get the same response
			// (multiple document-level click handlers may fire)
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
				Promise.resolve({
					ok: false,
					json: () => Promise.resolve({ message: 'Image not found' }),
				})
			);

			initImageHandlers(productId);

			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'delete-image-btn';
			deleteBtn.dataset.imageId = 'img-789';
			deleteBtn.dataset.imageFilename = 'photo.jpg';
			document.body.appendChild(deleteBtn);

			deleteBtn.click();

			await vi.waitFor(() => {
				const errorDiv = imageError.querySelector('div');
				expect(errorDiv?.textContent).toBe('Image not found');
			});
		});

		it('falls back to window.confirm when __confirmDialog is not set', async () => {
			setupDOM();
			delete (window as any).__confirmDialog;
			const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
				Promise.resolve({ ok: true })
			);

			initImageHandlers(productId);

			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'delete-image-btn';
			deleteBtn.dataset.imageId = 'img-789';
			deleteBtn.dataset.imageFilename = 'photo.jpg';
			document.body.appendChild(deleteBtn);

			deleteBtn.click();

			await vi.waitFor(() => {
				expect(confirmSpy).toHaveBeenCalledWith('Delete image "photo.jpg"?');
				expect(global.fetch).toHaveBeenCalled();
			});
		});
	});

	it('does nothing when DOM elements are missing', () => {
		expect(() => initImageHandlers(productId)).not.toThrow();
	});
});
