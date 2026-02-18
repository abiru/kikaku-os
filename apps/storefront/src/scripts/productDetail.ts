import { addToCart } from '../lib/cart';
import { addToRecentlyViewed } from '../lib/recentlyViewed';
import { showToast } from '../lib/toast';
import { t } from '../i18n';

const page = document.getElementById('product-page');
if (page) {
	const variantId = page.dataset.variantId ? Number(page.dataset.variantId) : null;
	const productId = page.dataset.productId ? Number(page.dataset.productId) : null;
	const productTitle = page.dataset.productTitle || '';
	const variantTitle = page.dataset.variantTitle || 'Default';
	const price = page.dataset.price ? Number(page.dataset.price) : 0;
	const currency = page.dataset.currency || 'JPY';
	const taxRate = page.dataset.taxRate ? Number(page.dataset.taxRate) : 0.10;
	const imageUrl = page.dataset.productImage || '';

	// Track recently viewed product
	if (productId) {
		addToRecentlyViewed({
			id: productId,
			name: productTitle,
			image: imageUrl || null,
			price,
			currency,
		});
	}

	// GTM: view_item event
	if (productId && typeof window !== 'undefined') {
		window.dataLayer = window.dataLayer || [];
		window.dataLayer.push({
			event: 'view_item',
			ecommerce: {
				currency,
				value: price,
				items: [{
					item_id: String(productId),
					item_name: productTitle,
					item_variant: variantTitle,
					price,
					quantity: 1,
				}],
			},
		});
	}

	const buyButton = document.getElementById('buy-button');
	const buyLabel = document.getElementById('buy-label');
	const buySpinner = document.getElementById('buy-spinner');
	const errorWrap = document.getElementById('checkout-error');
	const errorMessage = document.getElementById('checkout-error-message');
	const productForm = document.getElementById('product-form');

	const getSelectedQuantity = (): number => {
		const select = productForm?.querySelector('select[name="quantity"]') as HTMLSelectElement | null;
		if (select) return Number(select.value);
		const selectedRadio = productForm?.querySelector('input[name="quantity"]:checked') as HTMLInputElement | null;
		return selectedRadio ? Number(selectedRadio.value) : 1;
	};

	const addToCartText = buyLabel?.textContent || 'カートに追加';
	const addedToCartText = buyButton?.dataset.addedLabel || addToCartText;

	const showSuccess = () => {
		if (!buyLabel) return;
		buyLabel.textContent = addedToCartText;
		setTimeout(() => {
			buyLabel.textContent = addToCartText;
		}, 2000);
	};

	const showError = (message: string) => {
		if (!errorWrap || !errorMessage) return;
		errorMessage.textContent = message;
		errorWrap.classList.remove('hidden');
	};

	const clearError = () => {
		if (!errorWrap || !errorMessage) return;
		errorMessage.textContent = '';
		errorWrap.classList.add('hidden');
	};

	if (buyButton && variantId && productId) {
		buyButton.addEventListener('click', () => {
			clearError();

			const quantity = getSelectedQuantity();

			try {
				addToCart({
					variantId,
					productId,
					title: productTitle,
					variantTitle,
					price,
					currency,
					taxRate,
					imageUrl: imageUrl || undefined
				}, quantity);

				// GTM: add_to_cart event
				window.dataLayer = window.dataLayer || [];
				window.dataLayer.push({
					event: 'add_to_cart',
					ecommerce: {
						currency,
						value: price * quantity,
						items: [{
							item_id: String(productId),
							item_name: productTitle,
							item_variant: variantTitle,
							price,
							quantity,
						}],
					},
				});

				showSuccess();
				showToast(t('toast.cartAdded'), 'success');
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to add to cart.';
				showError(message);
				showToast(t('toast.cartError'), 'error', { description: message });
			}
		});
	}
}

// Thumbnail navigation
const mainImage = document.getElementById('main-image') as HTMLImageElement | null;
const thumbnails = document.querySelectorAll('.thumbnail');

if (mainImage && thumbnails.length > 0) {
	thumbnails.forEach((thumbnail) => {
		thumbnail.addEventListener('click', (e) => {
			const target = e.currentTarget as HTMLButtonElement;
			const imageUrl = target.dataset.url;

			if (imageUrl && mainImage) {
				mainImage.src = imageUrl;

				thumbnails.forEach(t => {
					t.classList.remove('ring-brand');
					t.classList.add('ring-transparent');
				});
				target.classList.remove('ring-transparent');
				target.classList.add('ring-brand');
			}
		});
	});
}
