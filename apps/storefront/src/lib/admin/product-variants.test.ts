import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initVariantHandlers } from './product-variants';

describe('initVariantHandlers', () => {
	const productId = 'prod-789';

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
			<div id="variant-modal" class="hidden">
				<h2 id="modal-title"></h2>
				<form id="variant-form">
					<input id="variant-id" value="" />
					<input id="variant-title" value="" />
					<input id="variant-sku" value="" />
					<input id="price-amount" value="" />
					<input id="stripe-price-id" value="" />
					<div id="modal-error" class="hidden"><div></div></div>
					<button type="submit">Save</button>
				</form>
			</div>
			<button id="add-variant-btn">Add Variant</button>
			<button id="cancel-modal-btn">Cancel</button>
		`;
	}

	function getModalElements() {
		return {
			modal: document.getElementById('variant-modal')!,
			modalTitle: document.getElementById('modal-title')!,
			form: document.getElementById('variant-form') as HTMLFormElement,
			variantId: document.getElementById('variant-id') as HTMLInputElement,
			variantTitle: document.getElementById(
				'variant-title'
			) as HTMLInputElement,
			variantSku: document.getElementById('variant-sku') as HTMLInputElement,
			priceAmount: document.getElementById('price-amount') as HTMLInputElement,
			stripePriceId: document.getElementById(
				'stripe-price-id'
			) as HTMLInputElement,
			modalError: document.getElementById('modal-error')!,
			addBtn: document.getElementById('add-variant-btn')!,
			cancelBtn: document.getElementById('cancel-modal-btn')!,
		};
	}

	describe('modal interactions', () => {
		it('opens modal with "Add Variant" title on add button click', () => {
			setupDOM();
			const { addBtn, modal, modalTitle } = getModalElements();

			initVariantHandlers(productId);
			addBtn.click();

			expect(modal.classList.contains('hidden')).toBe(false);
			expect(modalTitle.textContent).toBe('Add Variant');
		});

		it('closes modal on cancel button click', () => {
			setupDOM();
			const { addBtn, cancelBtn, modal } = getModalElements();

			initVariantHandlers(productId);
			addBtn.click();
			expect(modal.classList.contains('hidden')).toBe(false);

			cancelBtn.click();
			expect(modal.classList.contains('hidden')).toBe(true);
		});

		it('closes modal on background click', () => {
			setupDOM();
			const { addBtn, modal } = getModalElements();

			initVariantHandlers(productId);
			addBtn.click();
			expect(modal.classList.contains('hidden')).toBe(false);

			// Click directly on modal backdrop
			modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(modal.classList.contains('hidden')).toBe(true);
		});

		it('opens modal with "Edit Variant" title and pre-filled data', () => {
			setupDOM();
			const { modal, modalTitle, variantId, variantTitle, variantSku } =
				getModalElements();

			initVariantHandlers(productId);

			const editBtn = document.createElement('button');
			editBtn.className = 'edit-variant-btn';
			editBtn.dataset.variant = JSON.stringify({
				id: 'v-1',
				title: 'Red',
				sku: 'SKU-RED',
				prices: [{ amount: 1000, provider_price_id: 'price_abc' }],
			});
			document.body.appendChild(editBtn);

			editBtn.click();

			expect(modal.classList.contains('hidden')).toBe(false);
			expect(modalTitle.textContent).toBe('Edit Variant');
			expect(variantId.value).toBe('v-1');
			expect(variantTitle.value).toBe('Red');
			expect(variantSku.value).toBe('SKU-RED');
		});
	});

	describe('form validation', () => {
		it('shows error when title is empty', async () => {
			setupDOM();
			const { form, modalError } = getModalElements();

			initVariantHandlers(productId);

			form.dispatchEvent(new Event('submit', { cancelable: true }));

			await vi.waitFor(() => {
				const errorDiv = modalError.querySelector('div');
				expect(errorDiv?.textContent).toBe('Title is required');
				expect(modalError.classList.contains('hidden')).toBe(false);
			});

			expect(global.fetch).not.toHaveBeenCalled();
		});

		it('shows error when price is negative', async () => {
			setupDOM();
			const { form, variantTitle, priceAmount, modalError } =
				getModalElements();

			initVariantHandlers(productId);
			variantTitle.value = 'Blue';
			priceAmount.value = '-100';

			form.dispatchEvent(new Event('submit', { cancelable: true }));

			await vi.waitFor(() => {
				const errorDiv = modalError.querySelector('div');
				expect(errorDiv?.textContent).toBe(
					'Price must be a valid positive number'
				);
			});
		});

		it('shows error when price is not a number', async () => {
			setupDOM();
			const { form, variantTitle, priceAmount, modalError } =
				getModalElements();

			initVariantHandlers(productId);
			variantTitle.value = 'Blue';
			priceAmount.value = 'abc';

			form.dispatchEvent(new Event('submit', { cancelable: true }));

			await vi.waitFor(() => {
				const errorDiv = modalError.querySelector('div');
				expect(errorDiv?.textContent).toBe(
					'Price must be a valid positive number'
				);
			});
		});
	});

	describe('variant creation (POST)', () => {
		it('sends POST request for new variant then saves price', async () => {
			setupDOM();
			const { form, variantTitle, priceAmount, stripePriceId } =
				getModalElements();

			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ variant: { id: 'new-v-1' } }),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({}),
				});

			initVariantHandlers(productId);
			variantTitle.value = 'Large';
			priceAmount.value = '2000';
			stripePriceId.value = 'price_xyz';

			form.dispatchEvent(new Event('submit', { cancelable: true }));

			await vi.waitFor(() => {
				expect(global.fetch).toHaveBeenCalledTimes(2);
			});

			// First call: create variant
			const firstCall = (global.fetch as ReturnType<typeof vi.fn>).mock
				.calls[0]!;
			expect(firstCall[0]).toBe(
				`/api/admin/products/${productId}/variants`
			);
			expect(firstCall[1].method).toBe('POST');
			const variantBody = JSON.parse(firstCall[1].body);
			expect(variantBody.title).toBe('Large');
			expect(variantBody.sku).toBeNull();

			// Second call: save price
			const secondCall = (global.fetch as ReturnType<typeof vi.fn>).mock
				.calls[1]!;
			expect(secondCall[0]).toBe('/api/admin/variants/new-v-1/prices');
			expect(secondCall[1].method).toBe('PUT');
			const priceBody = JSON.parse(secondCall[1].body);
			expect(priceBody.prices[0].amount).toBe(2000);
			expect(priceBody.prices[0].currency).toBe('JPY');
			expect(priceBody.prices[0].provider_price_id).toBe('price_xyz');
		});

		it('reloads page after successful variant creation', async () => {
			setupDOM();
			const { form, variantTitle, priceAmount } = getModalElements();

			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ variant: { id: 'new-v-1' } }),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({}),
				});

			initVariantHandlers(productId);
			variantTitle.value = 'Small';
			priceAmount.value = '500';

			form.dispatchEvent(new Event('submit', { cancelable: true }));

			await vi.waitFor(() => {
				expect(window.location.reload).toHaveBeenCalled();
			});
		});

		it('shows error when variant creation fails', async () => {
			setupDOM();
			const { form, variantTitle, priceAmount, modalError } =
				getModalElements();

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				json: () => Promise.resolve({ message: 'Duplicate title' }),
			});

			initVariantHandlers(productId);
			variantTitle.value = 'Large';
			priceAmount.value = '1000';

			form.dispatchEvent(new Event('submit', { cancelable: true }));

			await vi.waitFor(() => {
				const errorDiv = modalError.querySelector('div');
				expect(errorDiv?.textContent).toBe('Duplicate title');
			});

			// Should not send price request
			expect(global.fetch).toHaveBeenCalledTimes(1);
		});
	});

	describe('variant edit (PUT)', () => {
		it('sends PUT request for existing variant', async () => {
			setupDOM();
			const { form, variantId, variantTitle, variantSku, priceAmount } =
				getModalElements();

			(global.fetch as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ variant: { id: 'v-1' } }),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({}),
				});

			initVariantHandlers(productId);
			variantId.value = 'v-1';
			variantTitle.value = 'Updated';
			variantSku.value = 'SKU-UPD';
			priceAmount.value = '3000';

			form.dispatchEvent(new Event('submit', { cancelable: true }));

			await vi.waitFor(() => {
				expect(global.fetch).toHaveBeenCalledTimes(2);
			});

			const firstCall = (global.fetch as ReturnType<typeof vi.fn>).mock
				.calls[0]!;
			expect(firstCall[0]).toBe(
				`/api/admin/products/${productId}/variants/v-1`
			);
			expect(firstCall[1].method).toBe('PUT');
		});
	});

	describe('variant delete (event delegation)', () => {
		it('sends DELETE request and reloads on success', async () => {
			setupDOM();
			vi.spyOn(window, 'confirm').mockReturnValue(true);
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
				Promise.resolve({ ok: true })
			);

			initVariantHandlers(productId);

			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'delete-variant-btn';
			deleteBtn.dataset.variantId = 'v-del-1';
			deleteBtn.dataset.variantTitle = 'Small';
			document.body.appendChild(deleteBtn);

			deleteBtn.click();

			await vi.waitFor(() => {
				expect(global.fetch).toHaveBeenCalledWith(
					`/api/admin/products/${productId}/variants/v-del-1`,
					expect.objectContaining({ method: 'DELETE' })
				);
				expect(window.location.reload).toHaveBeenCalled();
			});
		});

		it('does not delete when user cancels confirmation', async () => {
			setupDOM();
			vi.spyOn(window, 'confirm').mockReturnValue(false);

			initVariantHandlers(productId);

			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'delete-variant-btn';
			deleteBtn.dataset.variantId = 'v-del-1';
			deleteBtn.dataset.variantTitle = 'Small';
			document.body.appendChild(deleteBtn);

			deleteBtn.click();

			await new Promise((r) => setTimeout(r, 50));
			expect(global.fetch).not.toHaveBeenCalled();
		});

		it('shows alert on delete failure', async () => {
			setupDOM();
			vi.spyOn(window, 'confirm').mockReturnValue(true);
			const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
				Promise.resolve({
					ok: false,
					json: () => Promise.resolve({ message: 'Cannot delete' }),
				})
			);

			initVariantHandlers(productId);

			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'delete-variant-btn';
			deleteBtn.dataset.variantId = 'v-del-1';
			deleteBtn.dataset.variantTitle = 'Small';
			document.body.appendChild(deleteBtn);

			deleteBtn.click();

			await vi.waitFor(() => {
				expect(alertSpy).toHaveBeenCalledWith('Cannot delete');
			});
		});

		it('shows generic alert on delete network failure', async () => {
			setupDOM();
			vi.spyOn(window, 'confirm').mockReturnValue(true);
			const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
			(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
				Promise.reject(new Error('Network error'))
			);

			initVariantHandlers(productId);

			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'delete-variant-btn';
			deleteBtn.dataset.variantId = 'v-del-1';
			deleteBtn.dataset.variantTitle = 'Small';
			document.body.appendChild(deleteBtn);

			deleteBtn.click();

			await vi.waitFor(() => {
				expect(alertSpy).toHaveBeenCalledWith(
					'Failed to delete variant. Please try again.'
				);
			});
		});
	});

	it('does nothing when DOM elements are missing', () => {
		expect(() => initVariantHandlers(productId)).not.toThrow();
	});
});
