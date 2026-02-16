import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../i18n', () => ({
	t: (key: string) => key,
	useTranslation: () => ({ t: (key: string) => key }),
	translations: {},
}));

import WishlistButton from '../components/WishlistButton';
import { $wishlistItems } from '../lib/wishlist';

const mockProduct = {
	productId: 42,
	title: 'LED Panel',
	price: 3000,
	currency: 'JPY',
};

describe('WishlistButton', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		$wishlistItems.set({});
	});

	it('renders with "add to wishlist" label when not wishlisted', () => {
		render(<WishlistButton product={mockProduct} />);

		const button = screen.getByRole('button');
		expect(button).toHaveAttribute('aria-label', 'wishlist.addToWishlist');
	});

	it('renders with "remove from wishlist" label when wishlisted', () => {
		$wishlistItems.set({
			'42': { ...mockProduct, addedAt: Date.now() },
		});

		render(<WishlistButton product={mockProduct} />);

		const button = screen.getByRole('button');
		expect(button).toHaveAttribute('aria-label', 'wishlist.removeFromWishlist');
	});

	it('adds product to wishlist on click', () => {
		render(<WishlistButton product={mockProduct} />);

		const button = screen.getByRole('button');
		expect(button).toHaveAttribute('aria-label', 'wishlist.addToWishlist');

			fireEvent.click(button);

			expect(button).toHaveAttribute('aria-label', 'wishlist.removeFromWishlist');
			const addedItem = $wishlistItems.get()['42'];
			expect(addedItem).toBeDefined();
			if (!addedItem) throw new Error('Wishlist item was not added');
			expect(addedItem.title).toBe('LED Panel');
	});

	it('removes product from wishlist on second click', () => {
		$wishlistItems.set({
			'42': { ...mockProduct, addedAt: Date.now() },
		});

		render(<WishlistButton product={mockProduct} />);

		const button = screen.getByRole('button');
		expect(button).toHaveAttribute('aria-label', 'wishlist.removeFromWishlist');

		fireEvent.click(button);

		expect(button).toHaveAttribute('aria-label', 'wishlist.addToWishlist');
		expect($wishlistItems.get()['42']).toBeUndefined();
	});

	it('shows filled heart icon when wishlisted', () => {
		$wishlistItems.set({
			'42': { ...mockProduct, addedAt: Date.now() },
		});

		const { container } = render(<WishlistButton product={mockProduct} />);

		// Filled heart has fill="currentColor" and text-red-500 class
		const svg = container.querySelector('svg');
		expect(svg).toHaveAttribute('fill', 'currentColor');
		expect(svg?.className.baseVal).toContain('text-red-500');
	});

	it('shows outline heart icon when not wishlisted', () => {
		const { container } = render(<WishlistButton product={mockProduct} />);

		// Outline heart has fill="none" and text-gray-400
		const svg = container.querySelector('svg');
		expect(svg).toHaveAttribute('fill', 'none');
		expect(svg?.className.baseVal).toContain('text-gray-400');
	});

	it('toggles visual state on click', () => {
		const { container } = render(<WishlistButton product={mockProduct} />);

		// Initially outline
		let svg = container.querySelector('svg');
		expect(svg).toHaveAttribute('fill', 'none');

		// Click to add
		fireEvent.click(screen.getByRole('button'));

		// Now filled
		svg = container.querySelector('svg');
		expect(svg).toHaveAttribute('fill', 'currentColor');
		expect(svg?.className.baseVal).toContain('text-red-500');

		// Click to remove
		fireEvent.click(screen.getByRole('button'));

		// Back to outline
		svg = container.querySelector('svg');
		expect(svg).toHaveAttribute('fill', 'none');
	});

	it('persists to localStorage via nanostores', () => {
		render(<WishlistButton product={mockProduct} />);

			fireEvent.click(screen.getByRole('button'));

			const state = $wishlistItems.get();
			const item = state['42'];
			expect(item).toBeDefined();
			if (!item) throw new Error('Wishlist item was not persisted');
			expect(item.productId).toBe(42);
			expect(item.price).toBe(3000);
			expect(item.addedAt).toBeGreaterThan(0);
	});

	it('prevents event propagation on click', () => {
		const parentClickHandler = vi.fn();

		render(
			<div onClick={parentClickHandler}>
				<WishlistButton product={mockProduct} />
			</div>
		);

		fireEvent.click(screen.getByRole('button'));

		expect(parentClickHandler).not.toHaveBeenCalled();
	});

	it('applies custom className', () => {
		render(<WishlistButton product={mockProduct} className="custom-class" />);

		const button = screen.getByRole('button');
		expect(button.className).toContain('custom-class');
	});

	it('applies size-specific classes', () => {
		const { container: smContainer } = render(
			<WishlistButton product={mockProduct} size="sm" />
		);
		expect(smContainer.querySelector('svg')?.className.baseVal).toContain('size-5');

		const { container: lgContainer } = render(
			<WishlistButton product={mockProduct} size="lg" />
		);
		expect(lgContainer.querySelector('svg')?.className.baseVal).toContain('size-7');
	});

	it('uses title attribute matching aria-label', () => {
		render(<WishlistButton product={mockProduct} />);

		const button = screen.getByRole('button');
		expect(button).toHaveAttribute('title', 'wishlist.addToWishlist');
	});
});
