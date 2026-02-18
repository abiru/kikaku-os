import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initWebFetchHandlers } from './product-fetch';

describe('initWebFetchHandlers', () => {
	const productId = 'prod-999';

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
			<input id="fetch-url" value="" />
			<button id="fetch-btn"><span id="fetch-label">取得</span></button>
			<div id="fetch-spinner" class="hidden"></div>
			<div id="fetch-error" class="hidden"><div></div></div>
			<div id="fetch-warning" class="hidden"></div>
			<div id="fetch-preview" class="hidden">
				<div><img id="preview-image" src="" /></div>
				<span id="preview-original-title"></span>
				<span id="preview-specs"></span>
				<span id="preview-source"></span>
				<span id="preview-generated-title"></span>
				<span id="preview-generated-description"></span>
			</div>
			<button id="apply-all-btn">すべて適用</button>
			<button id="apply-title-only-btn">タイトルのみ</button>
			<button id="apply-desc-only-btn">説明のみ</button>
			<button id="send-inbox-btn">Inboxに送信</button>
			<button id="cancel-preview-btn">キャンセル</button>
			<div id="apply-success" class="hidden"></div>
			<input name="title" value="Test Product" />
			<input id="description-hidden" value="" />
		`;
	}

	function getElements() {
		return {
			fetchUrl: document.getElementById('fetch-url') as HTMLInputElement,
			fetchBtn: document.getElementById('fetch-btn') as HTMLButtonElement,
			fetchLabel: document.getElementById('fetch-label')!,
			fetchSpinner: document.getElementById('fetch-spinner')!,
			fetchError: document.getElementById('fetch-error')!,
			fetchPreview: document.getElementById('fetch-preview')!,
			previewImage: document.getElementById(
				'preview-image'
			) as HTMLImageElement,
			previewOriginalTitle: document.getElementById(
				'preview-original-title'
			)!,
			previewSpecs: document.getElementById('preview-specs')!,
			previewSource: document.getElementById('preview-source')!,
			previewGeneratedTitle: document.getElementById(
				'preview-generated-title'
			)!,
			previewGeneratedDescription: document.getElementById(
				'preview-generated-description'
			)!,
			applyAllBtn: document.getElementById(
				'apply-all-btn'
			) as HTMLButtonElement,
			applyTitleOnlyBtn: document.getElementById('apply-title-only-btn')!,
			applyDescOnlyBtn: document.getElementById('apply-desc-only-btn')!,
			sendInboxBtn: document.getElementById(
				'send-inbox-btn'
			) as HTMLButtonElement,
			cancelPreviewBtn: document.getElementById('cancel-preview-btn')!,
			applySuccess: document.getElementById('apply-success')!,
			titleInput: document.querySelector(
				'input[name="title"]'
			) as HTMLInputElement,
			descHidden: document.getElementById(
				'description-hidden'
			) as HTMLInputElement,
		};
	}

	describe('fetch button', () => {
		it('shows error when URL is empty', async () => {
			setupDOM();
			const { fetchBtn, fetchError } = getElements();

			initWebFetchHandlers(productId);
			fetchBtn.click();

			await vi.waitFor(() => {
				const errorDiv = fetchError.querySelector('div');
				expect(errorDiv?.textContent).toBe('URLを入力してください');
				expect(fetchError.classList.contains('hidden')).toBe(false);
			});

			expect(global.fetch).not.toHaveBeenCalled();
		});

		it('sends POST request with URL and productName', async () => {
			setupDOM();
			const { fetchUrl, fetchBtn } = getElements();
			fetchUrl.value = 'https://example.com/product';

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						success: true,
						image_url: 'https://example.com/img.jpg',
						original_title: 'Original',
						generated_title: 'Generated Title',
						generated_description: 'Generated Desc',
						source: 'example.com',
						specs: { weight: '100g', size: 'M' },
					}),
			});

			initWebFetchHandlers(productId);
			fetchBtn.click();

			await vi.waitFor(() => {
				expect(global.fetch).toHaveBeenCalledWith(
					'/api/admin/product-fetch',
					expect.objectContaining({
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
					})
				);
			});

			const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock
				.calls[0]!;
			const body = JSON.parse(callArgs[1].body);
			expect(body.url).toBe('https://example.com/product');
			expect(body.productName).toBe('Test Product');
		});

		it('shows preview with fetched data on success', async () => {
			setupDOM();
			const {
				fetchUrl,
				fetchBtn,
				fetchPreview,
				previewOriginalTitle,
				previewGeneratedTitle,
				previewGeneratedDescription,
				previewSource,
				previewSpecs,
			} = getElements();
			fetchUrl.value = 'https://example.com/product';

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						success: true,
						image_url: 'https://example.com/img.jpg',
						original_title: 'Original Title',
						generated_title: 'AI Title',
						generated_description: 'AI Description',
						source: 'example.com',
						specs: { weight: '100g' },
					}),
			});

			initWebFetchHandlers(productId);
			fetchBtn.click();

			await vi.waitFor(() => {
				expect(fetchPreview.classList.contains('hidden')).toBe(false);
				expect(previewOriginalTitle.textContent).toBe('Original Title');
				expect(previewGeneratedTitle.textContent).toBe('AI Title');
				expect(previewGeneratedDescription.textContent).toBe('AI Description');
				expect(previewSource.textContent).toBe('example.com');
				expect(previewSpecs.textContent).toContain('weight: 100g');
			});
		});

		it('shows error on API failure', async () => {
			setupDOM();
			const { fetchUrl, fetchBtn, fetchError } = getElements();
			fetchUrl.value = 'https://example.com/bad';

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				json: () =>
					Promise.resolve({ success: false, message: 'Page not found' }),
			});

			initWebFetchHandlers(productId);
			fetchBtn.click();

			await vi.waitFor(() => {
				const errorDiv = fetchError.querySelector('div');
				expect(errorDiv?.textContent).toBe('Page not found');
			});
		});

		it('shows generic error on network failure', async () => {
			setupDOM();
			const { fetchUrl, fetchBtn, fetchError } = getElements();
			fetchUrl.value = 'https://example.com/timeout';

			(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error('Network error')
			);

			initWebFetchHandlers(productId);
			fetchBtn.click();

			await vi.waitFor(() => {
				const errorDiv = fetchError.querySelector('div');
				expect(errorDiv?.textContent).toBe('通信エラーが発生しました');
			});
		});

		it('resets button state after fetch completes', async () => {
			setupDOM();
			const { fetchUrl, fetchBtn, fetchLabel, fetchSpinner } = getElements();
			fetchUrl.value = 'https://example.com/product';

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						success: true,
						generated_title: 'Title',
					}),
			});

			initWebFetchHandlers(productId);
			fetchBtn.click();

			await vi.waitFor(() => {
				expect(fetchBtn.disabled).toBe(false);
				expect(fetchLabel.textContent).toBe('取得');
				expect(fetchSpinner.classList.contains('hidden')).toBe(true);
			});
		});
	});

	describe('cancel preview', () => {
		it('hides preview on cancel button click', async () => {
			setupDOM();
			const { fetchUrl, fetchBtn, fetchPreview, cancelPreviewBtn } =
				getElements();
			fetchUrl.value = 'https://example.com/product';

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						success: true,
						generated_title: 'Title',
					}),
			});

			initWebFetchHandlers(productId);
			fetchBtn.click();

			await vi.waitFor(() => {
				expect(fetchPreview.classList.contains('hidden')).toBe(false);
			});

			cancelPreviewBtn.click();
			expect(fetchPreview.classList.contains('hidden')).toBe(true);
		});
	});

	describe('apply title only', () => {
		it('sets title input value from fetched data', async () => {
			setupDOM();
			const { fetchUrl, fetchBtn, applyTitleOnlyBtn, titleInput } =
				getElements();
			fetchUrl.value = 'https://example.com/product';

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						success: true,
						generated_title: 'New Generated Title',
					}),
			});

			initWebFetchHandlers(productId);
			fetchBtn.click();

			await vi.waitFor(() => {
				expect(
					document
						.getElementById('fetch-preview')!
						.classList.contains('hidden')
				).toBe(false);
			});

			applyTitleOnlyBtn.click();

			expect(titleInput.value).toBe('New Generated Title');
		});
	});

	describe('apply description only', () => {
		it('sets description hidden input from fetched data', async () => {
			setupDOM();
			const { fetchUrl, fetchBtn, applyDescOnlyBtn, descHidden } =
				getElements();
			fetchUrl.value = 'https://example.com/product';

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						success: true,
						generated_description: '<p>New Description</p>',
					}),
			});

			initWebFetchHandlers(productId);
			fetchBtn.click();

			await vi.waitFor(() => {
				expect(
					document
						.getElementById('fetch-preview')!
						.classList.contains('hidden')
				).toBe(false);
			});

			applyDescOnlyBtn.click();

			expect(descHidden.value).toBe('<p>New Description</p>');
		});
	});

	describe('apply all (send to inbox)', () => {
		it('sends data to inbox API on confirm', async () => {
			setupDOM();
			const { fetchUrl, fetchBtn, applyAllBtn, applySuccess } = getElements();
			fetchUrl.value = 'https://example.com/product';
			vi.spyOn(window, 'confirm').mockReturnValue(true);

			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: () =>
						Promise.resolve({
							success: true,
							generated_title: 'Title',
							generated_description: 'Desc',
							image_url: 'https://example.com/img.jpg',
							original_title: 'Original',
							source: 'example.com',
						}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({}),
				});

			initWebFetchHandlers(productId);
			fetchBtn.click();

			await vi.waitFor(() => {
				expect(
					document
						.getElementById('fetch-preview')!
						.classList.contains('hidden')
				).toBe(false);
			});

			applyAllBtn.click();

			await vi.waitFor(() => {
				expect(global.fetch).toHaveBeenCalledTimes(2);
				const inboxCall = (global.fetch as ReturnType<typeof vi.fn>).mock
					.calls[1]!;
				expect(inboxCall[0]).toBe('/api/inbox');
				expect(inboxCall[1].method).toBe('POST');
				expect(applySuccess.classList.contains('hidden')).toBe(false);
			});
		});

		it('does not send to inbox when user cancels', async () => {
			setupDOM();
			const { fetchUrl, fetchBtn, applyAllBtn } = getElements();
			fetchUrl.value = 'https://example.com/product';
			vi.spyOn(window, 'confirm').mockReturnValue(false);

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						success: true,
						generated_title: 'Title',
					}),
			});

			initWebFetchHandlers(productId);
			fetchBtn.click();

			await vi.waitFor(() => {
				expect(
					document
						.getElementById('fetch-preview')!
						.classList.contains('hidden')
				).toBe(false);
			});

			applyAllBtn.click();

			await new Promise((r) => setTimeout(r, 50));
			// Only the initial fetch call, no inbox call
			expect(global.fetch).toHaveBeenCalledTimes(1);
		});
	});

	describe('send inbox button', () => {
		it('sends to inbox and shows success', async () => {
			setupDOM();
			const { fetchUrl, fetchBtn, sendInboxBtn, applySuccess } =
				getElements();
			fetchUrl.value = 'https://example.com/product';

			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: () =>
						Promise.resolve({
							success: true,
							generated_title: 'Title',
						}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({}),
				});

			initWebFetchHandlers(productId);
			fetchBtn.click();

			await vi.waitFor(() => {
				expect(
					document
						.getElementById('fetch-preview')!
						.classList.contains('hidden')
				).toBe(false);
			});

			sendInboxBtn.click();

			await vi.waitFor(() => {
				expect(global.fetch).toHaveBeenCalledTimes(2);
				expect(applySuccess.classList.contains('hidden')).toBe(false);
				expect(sendInboxBtn.disabled).toBe(false);
				expect(sendInboxBtn.textContent).toBe('Inboxに送信');
			});
		});

		it('shows error on inbox send failure', async () => {
			setupDOM();
			const { fetchUrl, fetchBtn, sendInboxBtn, fetchError } = getElements();
			fetchUrl.value = 'https://example.com/product';

			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: () =>
						Promise.resolve({
							success: true,
							generated_title: 'Title',
						}),
				})
				.mockResolvedValueOnce({
					ok: false,
					json: () =>
						Promise.resolve({ message: 'Inbox limit exceeded' }),
				});

			initWebFetchHandlers(productId);
			fetchBtn.click();

			await vi.waitFor(() => {
				expect(
					document
						.getElementById('fetch-preview')!
						.classList.contains('hidden')
				).toBe(false);
			});

			sendInboxBtn.click();

			await vi.waitFor(() => {
				const errorDiv = fetchError.querySelector('div');
				expect(errorDiv?.textContent).toBe('Inbox limit exceeded');
			});
		});
	});

	describe('preview data display', () => {
		it('shows dash for missing optional fields', async () => {
			setupDOM();
			const {
				fetchUrl,
				fetchBtn,
				previewOriginalTitle,
				previewSpecs,
				previewSource,
				previewGeneratedTitle,
				previewGeneratedDescription,
			} = getElements();
			fetchUrl.value = 'https://example.com/product';

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						success: true,
					}),
			});

			initWebFetchHandlers(productId);
			fetchBtn.click();

			await vi.waitFor(() => {
				expect(previewOriginalTitle.textContent).toBe('-');
				expect(previewSpecs.textContent).toBe('-');
				expect(previewSource.textContent).toBe('-');
				expect(previewGeneratedTitle.textContent).toBe('-');
				expect(previewGeneratedDescription.textContent).toBe('-');
			});
		});

		it('hides image when no image_url is provided', async () => {
			setupDOM();
			const { fetchUrl, fetchBtn, previewImage } = getElements();
			fetchUrl.value = 'https://example.com/product';

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						success: true,
					}),
			});

			initWebFetchHandlers(productId);
			fetchBtn.click();

			await vi.waitFor(() => {
				expect(
					previewImage.parentElement?.classList.contains('hidden')
				).toBe(true);
			});
		});
	});

	it('does nothing when DOM elements are missing', () => {
		expect(() => initWebFetchHandlers(productId)).not.toThrow();
	});
});
