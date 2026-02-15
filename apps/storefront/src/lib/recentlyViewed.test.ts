import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
	$recentlyViewed,
	$recentlyViewedList,
	addToRecentlyViewed,
	getRecentlyViewed,
} from './recentlyViewed';

const sampleProduct = {
	id: 1,
	name: 'Test Product',
	image: 'https://example.com/img.jpg',
	price: 1000,
	currency: 'JPY',
};

describe('recentlyViewed', () => {
	beforeEach(() => {
		$recentlyViewed.set([]);
	});

	describe('addToRecentlyViewed', () => {
		it('adds a product to the list', () => {
			addToRecentlyViewed(sampleProduct);
			const items = $recentlyViewed.get();
			expect(items).toHaveLength(1);
			expect(items[0]).toBeDefined();
			expect(items[0]!.name).toBe('Test Product');
			expect(items[0]!.viewedAt).toBeGreaterThan(0);
		});

		it('moves existing product to front', () => {
			addToRecentlyViewed(sampleProduct);
			addToRecentlyViewed({ ...sampleProduct, id: 2, name: 'Other Product' });
			addToRecentlyViewed(sampleProduct);
			const items = $recentlyViewed.get();
			expect(items).toHaveLength(2);
			expect(items[0]).toBeDefined();
			expect(items[0]!.id).toBe(1);
		});

		it('limits to 10 items', () => {
			for (let i = 0; i < 15; i++) {
				addToRecentlyViewed({ ...sampleProduct, id: i, name: `Product ${i}` });
			}
			expect($recentlyViewed.get()).toHaveLength(10);
		});

		it('handles null image', () => {
			addToRecentlyViewed({ ...sampleProduct, image: null });
			const items = $recentlyViewed.get();
			expect(items[0]).toBeDefined();
			expect(items[0]!.image).toBeNull();
		});
	});

	describe('$recentlyViewedList', () => {
		it('sorts by viewedAt descending', () => {
			const now = Date.now();
			vi.spyOn(Date, 'now')
				.mockReturnValueOnce(now - 1000)
				.mockReturnValueOnce(now);

			addToRecentlyViewed({ ...sampleProduct, id: 1 });
			addToRecentlyViewed({ ...sampleProduct, id: 2 });

			const sorted = $recentlyViewedList.get();
			expect(sorted[0]).toBeDefined();
			expect(sorted[1]).toBeDefined();
			expect(sorted[0]!.id).toBe(2);
			expect(sorted[1]!.id).toBe(1);

			vi.restoreAllMocks();
		});
	});

	describe('getRecentlyViewed', () => {
		it('returns sorted array', () => {
			addToRecentlyViewed(sampleProduct);
			const items = getRecentlyViewed();
			expect(items).toHaveLength(1);
			expect(items[0]).toBeDefined();
			expect(items[0]!.name).toBe('Test Product');
		});

		it('returns empty array when nothing viewed', () => {
			expect(getRecentlyViewed()).toHaveLength(0);
		});
	});
});
