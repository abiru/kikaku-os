import { describe, expect, it, beforeEach } from 'vitest';
import {
	$wishlistItems,
	$wishlistArray,
	$wishlistCount,
	addToWishlist,
	removeFromWishlist,
	isInWishlist,
	toggleWishlist,
} from './wishlist';

const sampleItem = {
	productId: 1,
	title: 'Test Product',
	price: 1000,
	currency: 'JPY',
};

describe('wishlist', () => {
	beforeEach(() => {
		$wishlistItems.set({});
	});

	describe('addToWishlist', () => {
		it('adds a new item', () => {
			addToWishlist(sampleItem);
			const items = $wishlistArray.get();
			expect(items).toHaveLength(1);
			expect(items[0].title).toBe('Test Product');
			expect(items[0].addedAt).toBeGreaterThan(0);
		});

		it('does not duplicate existing item', () => {
			addToWishlist(sampleItem);
			addToWishlist(sampleItem);
			expect($wishlistArray.get()).toHaveLength(1);
		});

		it('adds different products separately', () => {
			addToWishlist(sampleItem);
			addToWishlist({ ...sampleItem, productId: 2, title: 'Other Product' });
			expect($wishlistArray.get()).toHaveLength(2);
		});
	});

	describe('removeFromWishlist', () => {
		it('removes an item by productId', () => {
			addToWishlist(sampleItem);
			removeFromWishlist(1);
			expect($wishlistArray.get()).toHaveLength(0);
		});

		it('does nothing for non-existent productId', () => {
			addToWishlist(sampleItem);
			removeFromWishlist(999);
			expect($wishlistArray.get()).toHaveLength(1);
		});
	});

	describe('isInWishlist', () => {
		it('returns true for items in wishlist', () => {
			addToWishlist(sampleItem);
			expect(isInWishlist(1)).toBe(true);
		});

		it('returns false for items not in wishlist', () => {
			expect(isInWishlist(999)).toBe(false);
		});
	});

	describe('toggleWishlist', () => {
		it('adds item if not in wishlist', () => {
			toggleWishlist(sampleItem);
			expect(isInWishlist(1)).toBe(true);
		});

		it('removes item if already in wishlist', () => {
			addToWishlist(sampleItem);
			toggleWishlist(sampleItem);
			expect(isInWishlist(1)).toBe(false);
		});
	});

	describe('$wishlistCount', () => {
		it('returns 0 for empty wishlist', () => {
			expect($wishlistCount.get()).toBe(0);
		});

		it('counts items', () => {
			addToWishlist(sampleItem);
			addToWishlist({ ...sampleItem, productId: 2 });
			expect($wishlistCount.get()).toBe(2);
		});
	});

	describe('$wishlistArray', () => {
		it('sorts by addedAt descending', () => {
			addToWishlist({ ...sampleItem, productId: 1 });
			addToWishlist({ ...sampleItem, productId: 2 });
			const items = $wishlistArray.get();
			expect(items[0].addedAt).toBeGreaterThanOrEqual(items[1].addedAt);
		});
	});
});
