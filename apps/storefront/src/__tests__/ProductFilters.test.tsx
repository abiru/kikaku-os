import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../i18n', () => ({
	t: (key: string) => key,
	useTranslation: () => ({
		t: (key: string, params?: Record<string, string>) => {
			if (params) {
				return Object.entries(params).reduce(
					(acc, [k, v]) => acc.replace(`{${k}}`, v),
					key
				);
			}
			return key;
		},
	}),
	translations: {},
}));

vi.mock('../lib/api', () => ({
	getApiBase: () => 'http://localhost:8787',
}));

global.fetch = vi.fn();

import ProductFilters from '../components/ProductFilters';

const mockFilterOptions = {
	categories: ['LED', 'Accessories', 'Panels'],
	priceRange: { min: 500, max: 50000 },
};

describe('ProductFilters', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Object.defineProperty(window, 'location', {
			value: {
				href: 'http://localhost:4321/products',
				origin: 'http://localhost:4321',
				pathname: '/products',
				search: '',
				hash: '',
				reload: vi.fn(),
				assign: vi.fn(),
			},
			writable: true,
		});
	});

	it('shows loading skeleton initially', () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
		const { container } = render(<ProductFilters />);
		expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
	});

	it('renders categories after loading', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockFilterOptions),
		});

		await act(async () => {
			render(<ProductFilters />);
		});

		await waitFor(() => {
			expect(screen.getByText('filters.category')).toBeInTheDocument();
			expect(screen.getByText('LED')).toBeInTheDocument();
			expect(screen.getByText('Accessories')).toBeInTheDocument();
			expect(screen.getByText('Panels')).toBeInTheDocument();
		});
	});

	it('renders price range inputs after loading', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockFilterOptions),
		});

		await act(async () => {
			render(<ProductFilters />);
		});

		await waitFor(() => {
			expect(screen.getByText('filters.priceRange')).toBeInTheDocument();
			expect(screen.getByLabelText('filters.minPrice')).toBeInTheDocument();
			expect(screen.getByLabelText('filters.maxPrice')).toBeInTheDocument();
		});
	});

	it('selects a category via radio button', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockFilterOptions),
		});

		await act(async () => {
			render(<ProductFilters />);
		});

		await waitFor(() => {
			expect(screen.getByText('LED')).toBeInTheDocument();
		});

		const ledRadio = screen.getByRole('radio', { name: /LED/i });
		fireEvent.click(ledRadio);

		expect(ledRadio).toBeChecked();
	});

	it('shows clear category button when category is selected', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockFilterOptions),
		});

		await act(async () => {
			render(<ProductFilters />);
		});

		await waitFor(() => {
			expect(screen.getByText('LED')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('radio', { name: /LED/i }));

		expect(screen.getByText('filters.clearCategory')).toBeInTheDocument();
	});

	it('clears category when clear button is clicked', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockFilterOptions),
		});

		await act(async () => {
			render(<ProductFilters />);
		});

		await waitFor(() => {
			expect(screen.getByText('LED')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('radio', { name: /LED/i }));
		expect(screen.getByRole('radio', { name: /LED/i })).toBeChecked();

		fireEvent.click(screen.getByText('filters.clearCategory'));
		expect(screen.getByRole('radio', { name: /LED/i })).not.toBeChecked();
	});

	it('applies filters and updates URL', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockFilterOptions),
		});

		await act(async () => {
			render(<ProductFilters />);
		});

		await waitFor(() => {
			expect(screen.getByText('LED')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole('radio', { name: /LED/i }));

		const minInput = screen.getByLabelText('filters.minPrice');
		const maxInput = screen.getByLabelText('filters.maxPrice');
		fireEvent.change(minInput, { target: { value: '1000' } });
		fireEvent.change(maxInput, { target: { value: '5000' } });

		fireEvent.click(screen.getByText('filters.applyFilters'));

		expect(window.location.href).toContain('category=LED');
		expect(window.location.href).toContain('minPrice=1000');
		expect(window.location.href).toContain('maxPrice=5000');
	});

	it('shows clear all button when filters are active', async () => {
		Object.defineProperty(window, 'location', {
			value: {
				href: 'http://localhost:4321/products?category=LED',
				origin: 'http://localhost:4321',
				pathname: '/products',
				search: '?category=LED',
				hash: '',
				reload: vi.fn(),
				assign: vi.fn(),
			},
			writable: true,
		});

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockFilterOptions),
		});

		await act(async () => {
			render(<ProductFilters />);
		});

		await waitFor(() => {
			expect(screen.getByText('filters.clearAll')).toBeInTheDocument();
		});
	});

	it('clears all filters and resets URL', async () => {
		Object.defineProperty(window, 'location', {
			value: {
				href: 'http://localhost:4321/products?category=LED&minPrice=1000',
				origin: 'http://localhost:4321',
				pathname: '/products',
				search: '?category=LED&minPrice=1000',
				hash: '',
				reload: vi.fn(),
				assign: vi.fn(),
			},
			writable: true,
		});

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockFilterOptions),
		});

		await act(async () => {
			render(<ProductFilters />);
		});

		await waitFor(() => {
			expect(screen.getByText('filters.clearAll')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText('filters.clearAll'));

		expect(window.location.href).toBe('/products');
	});

	it('preserves search query when clearing filters', async () => {
		Object.defineProperty(window, 'location', {
			value: {
				href: 'http://localhost:4321/products?q=LED&category=Panels',
				origin: 'http://localhost:4321',
				pathname: '/products',
				search: '?q=LED&category=Panels',
				hash: '',
				reload: vi.fn(),
				assign: vi.fn(),
			},
			writable: true,
		});

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockFilterOptions),
		});

		await act(async () => {
			render(<ProductFilters />);
		});

		await waitFor(() => {
			expect(screen.getByText('filters.clearAll')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText('filters.clearAll'));

		expect(window.location.href).toContain('q=LED');
		expect(window.location.href).not.toContain('category');
	});

	it('announces active filters via aria-live region', async () => {
		Object.defineProperty(window, 'location', {
			value: {
				href: 'http://localhost:4321/products?category=LED',
				origin: 'http://localhost:4321',
				pathname: '/products',
				search: '?category=LED',
				hash: '',
				reload: vi.fn(),
				assign: vi.fn(),
			},
			writable: true,
		});

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockFilterOptions),
		});

		await act(async () => {
			render(<ProductFilters />);
		});

		await waitFor(() => {
			const liveRegion = document.querySelector('[aria-live="polite"]');
			expect(liveRegion).toBeInTheDocument();
			expect(liveRegion?.textContent).toBe('filters.activeFilters');
		});
	});

	it('does not show aria-live text when no filters are active', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockFilterOptions),
		});

		await act(async () => {
			render(<ProductFilters />);
		});

		await waitFor(() => {
			const liveRegion = document.querySelector('[aria-live="polite"]');
			expect(liveRegion).toBeInTheDocument();
			expect(liveRegion?.textContent).toBe('');
		});
	});

	it('reads initial filter values from URL params', async () => {
		Object.defineProperty(window, 'location', {
			value: {
				href: 'http://localhost:4321/products?category=Accessories&minPrice=2000&maxPrice=10000',
				origin: 'http://localhost:4321',
				pathname: '/products',
				search: '?category=Accessories&minPrice=2000&maxPrice=10000',
				hash: '',
				reload: vi.fn(),
				assign: vi.fn(),
			},
			writable: true,
		});

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockFilterOptions),
		});

		await act(async () => {
			render(<ProductFilters />);
		});

		await waitFor(() => {
			const accessoriesRadio = screen.getByRole('radio', { name: /Accessories/i });
			expect(accessoriesRadio).toBeChecked();

			expect(screen.getByLabelText('filters.minPrice')).toHaveValue(2000);
			expect(screen.getByLabelText('filters.maxPrice')).toHaveValue(10000);
		});
	});

	it('handles fetch error gracefully', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

		await act(async () => {
			render(<ProductFilters />);
		});

		await waitFor(() => {
			expect(screen.getByText('filters.applyFilters')).toBeInTheDocument();
		});
	});

	it('does not render categories section when none exist', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ categories: [], priceRange: { min: 0, max: 10000 } }),
		});

		await act(async () => {
			render(<ProductFilters />);
		});

		await waitFor(() => {
			expect(screen.queryByText('filters.category')).not.toBeInTheDocument();
			expect(screen.getByText('filters.priceRange')).toBeInTheDocument();
		});
	});
});
