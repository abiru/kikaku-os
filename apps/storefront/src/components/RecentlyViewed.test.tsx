import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../i18n', () => ({
	t: (key: string) => key,
	useTranslation: () => ({ t: (key: string) => key }),
	translations: {},
}));

vi.mock('../lib/format', () => ({
	formatPrice: (amount: number, currency: string) => `${currency} ${amount}`,
}));

import RecentlyViewed from './RecentlyViewed';
import { $recentlyViewed } from '../lib/recentlyViewed';

describe('RecentlyViewed', () => {
	beforeEach(() => {
		$recentlyViewed.set([]);
	});

	it('renders nothing when there are no items', () => {
		const { container } = render(<RecentlyViewed />);
		expect(container.innerHTML).toBe('');
	});

	it('renders section with title when items exist', () => {
		$recentlyViewed.set([
			{ id: 1, name: 'Product A', price: 1000, currency: 'JPY', image: '/img/a.jpg', viewedAt: Date.now() },
		]);

		render(<RecentlyViewed />);

		expect(screen.getByText('recentlyViewed.title')).toBeInTheDocument();
	});

	it('renders product links with correct href', () => {
		$recentlyViewed.set([
			{ id: 42, name: 'Product B', price: 2000, currency: 'JPY', image: '/img/b.jpg', viewedAt: Date.now() },
		]);

		render(<RecentlyViewed />);

		const link = screen.getByText('Product B').closest('a');
		expect(link).toHaveAttribute('href', '/products/42');
	});

	it('renders product name and formatted price', () => {
		$recentlyViewed.set([
			{ id: 1, name: 'Fancy Item', price: 5000, currency: 'JPY', image: '/img/fancy.jpg', viewedAt: Date.now() },
		]);

		render(<RecentlyViewed />);

		expect(screen.getByText('Fancy Item')).toBeInTheDocument();
		expect(screen.getByText('JPY 5000')).toBeInTheDocument();
	});

	it('renders product image when available', () => {
		$recentlyViewed.set([
			{ id: 1, name: 'With Image', price: 1000, currency: 'JPY', image: '/img/product.jpg', viewedAt: Date.now() },
		]);

		render(<RecentlyViewed />);

		const img = screen.getByAltText('With Image');
		expect(img).toHaveAttribute('src', '/img/product.jpg');
	});

	it('renders placeholder when image is missing', () => {
		$recentlyViewed.set([
			{ id: 1, name: 'No Image', price: 1000, currency: 'JPY', image: '', viewedAt: Date.now() },
		]);

		render(<RecentlyViewed />);

		expect(screen.getByText('No Image')).toBeInTheDocument();
		expect(screen.queryByAltText('No Image')).not.toBeInTheDocument();
	});

	it('excludes item with matching excludeId', () => {
		$recentlyViewed.set([
			{ id: 1, name: 'Keep This', price: 1000, currency: 'JPY', image: '/img/a.jpg', viewedAt: Date.now() },
			{ id: 2, name: 'Exclude This', price: 2000, currency: 'JPY', image: '/img/b.jpg', viewedAt: Date.now() },
		]);

		render(<RecentlyViewed excludeId={2} />);

		expect(screen.getByText('Keep This')).toBeInTheDocument();
		expect(screen.queryByText('Exclude This')).not.toBeInTheDocument();
	});

	it('renders nothing when all items are excluded', () => {
		$recentlyViewed.set([
			{ id: 1, name: 'Only Item', price: 1000, currency: 'JPY', image: '/img/a.jpg', viewedAt: Date.now() },
		]);

		const { container } = render(<RecentlyViewed excludeId={1} />);
		expect(container.innerHTML).toBe('');
	});

	it('renders multiple items', () => {
		$recentlyViewed.set([
			{ id: 1, name: 'Item One', price: 1000, currency: 'JPY', image: '/img/1.jpg', viewedAt: Date.now() },
			{ id: 2, name: 'Item Two', price: 2000, currency: 'JPY', image: '/img/2.jpg', viewedAt: Date.now() },
			{ id: 3, name: 'Item Three', price: 3000, currency: 'JPY', image: '/img/3.jpg', viewedAt: Date.now() },
		]);

		render(<RecentlyViewed />);

		expect(screen.getByText('Item One')).toBeInTheDocument();
		expect(screen.getByText('Item Two')).toBeInTheDocument();
		expect(screen.getByText('Item Three')).toBeInTheDocument();
	});
});
