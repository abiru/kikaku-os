import { beforeEach, describe, expect, it, vi } from 'vitest';

const addToCartMock = vi.fn();
const addToRecentlyViewedMock = vi.fn();

vi.mock('../lib/cart', () => ({
	addToCart: addToCartMock
}));

vi.mock('../lib/recentlyViewed', () => ({
	addToRecentlyViewed: addToRecentlyViewedMock
}));

const loadScript = async () => {
	vi.resetModules();
	await import('./productDetail');
};

describe('productDetail script', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		addToCartMock.mockReset();
		addToRecentlyViewedMock.mockReset();
		(window as typeof window & { dataLayer?: unknown[] }).dataLayer = [];
	});

	it('tracks view and adds selected quantity to cart', async () => {
		document.body.innerHTML = `
			<div id="product-page"
				data-variant-id="11"
				data-product-id="101"
				data-product-title="Sample Product"
				data-variant-title="Blue"
				data-price="2000"
				data-currency="JPY"
				data-tax-rate="0.1"
				data-product-image="https://example.com/p.png"></div>
			<form id="product-form">
				<select name="quantity">
					<option value="1">1</option>
					<option value="3" selected>3</option>
				</select>
			</form>
			<button id="buy-button" data-added-label="Added!"></button>
			<span id="buy-label">Add to cart</span>
			<div id="checkout-error" class="hidden"><span id="checkout-error-message"></span></div>
		`;

		await loadScript();
		(document.getElementById('buy-button') as HTMLButtonElement).click();

		expect(addToRecentlyViewedMock).toHaveBeenCalledWith({
			id: 101,
			name: 'Sample Product',
			image: 'https://example.com/p.png',
			price: 2000,
			currency: 'JPY'
		});
		expect(addToCartMock).toHaveBeenCalledWith(
			expect.objectContaining({
				variantId: 11,
				productId: 101,
				title: 'Sample Product'
			}),
			3
		);

		const dataLayer = (window as typeof window & { dataLayer?: unknown[] }).dataLayer ?? [];
		expect(dataLayer).toHaveLength(2);
	});

	it('shows an error when addToCart throws', async () => {
		addToCartMock.mockImplementation(() => {
			throw new Error('out of stock');
		});

		document.body.innerHTML = `
			<div id="product-page" data-variant-id="1" data-product-id="2"></div>
			<form id="product-form"><input type="radio" name="quantity" value="1" checked /></form>
			<button id="buy-button"></button>
			<span id="buy-label">Add to cart</span>
			<div id="checkout-error" class="hidden"><span id="checkout-error-message"></span></div>
		`;

		await loadScript();
		(document.getElementById('buy-button') as HTMLButtonElement).click();

		expect(document.getElementById('checkout-error')).not.toHaveClass('hidden');
		expect(document.getElementById('checkout-error-message')?.textContent).toBe('out of stock');
	});

	it('updates main image when a thumbnail is clicked', async () => {
		document.body.innerHTML = `
			<img id="main-image" src="/before.png" />
			<button class="thumbnail ring-[#0071e3]" data-url="/after.png"></button>
			<button class="thumbnail ring-transparent" data-url="/other.png"></button>
		`;

		await loadScript();
		(document.querySelector('.thumbnail') as HTMLButtonElement).click();

		expect((document.getElementById('main-image') as HTMLImageElement).src).toContain('/after.png');
		expect(document.querySelector('.thumbnail')?.classList.contains('ring-[#0071e3]')).toBe(true);
	});
});
