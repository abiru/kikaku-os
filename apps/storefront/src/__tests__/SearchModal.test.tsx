import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock i18n — return the key so tests are language-independent
vi.mock('../i18n', () => ({
	t: (key: string) => key,
	useTranslation: () => ({ t: (key: string) => key }),
	translations: {},
}));

// Mock fetch
global.fetch = vi.fn();

import SearchModal from '../components/SearchModal';

describe('SearchModal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('renders nothing when closed', () => {
		const { container } = render(<SearchModal />);
		expect(container.innerHTML).toBe('');
	});

	it('opens when open-search event is dispatched', () => {
		render(<SearchModal />);

		act(() => {
			window.dispatchEvent(new Event('open-search'));
		});

		expect(screen.getByRole('dialog')).toBeInTheDocument();
		expect(screen.getByPlaceholderText('common.searchProducts')).toBeInTheDocument();
	});

	it('shows keyboard hints footer when open', () => {
		render(<SearchModal />);

		act(() => {
			window.dispatchEvent(new Event('open-search'));
		});

		expect(screen.getByText('search.toNavigate')).toBeInTheDocument();
		expect(screen.getByText('search.toSelect')).toBeInTheDocument();
		expect(screen.getByText('search.toClose')).toBeInTheDocument();
	});

	it('closes when clicking backdrop', () => {
		render(<SearchModal />);

		act(() => {
			window.dispatchEvent(new Event('open-search'));
		});

		expect(screen.getByRole('dialog')).toBeInTheDocument();

		const backdrop = document.querySelector('.backdrop-blur-sm');
		if (backdrop) {
			fireEvent.click(backdrop);
		}

		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('closes when pressing Escape', () => {
		render(<SearchModal />);

		act(() => {
			window.dispatchEvent(new Event('open-search'));
		});

		expect(screen.getByRole('dialog')).toBeInTheDocument();

		act(() => {
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		});

		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('does not show results for queries less than 2 chars', () => {
		render(<SearchModal />);

		act(() => {
			window.dispatchEvent(new Event('open-search'));
		});

		const input = screen.getByPlaceholderText('common.searchProducts');
		fireEvent.change(input, { target: { value: 'a' } });

		expect(screen.queryByText('common.noResults')).not.toBeInTheDocument();
	});

	it('shows no-results message when search returns empty', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ products: [] }),
		});

		render(<SearchModal />);

		act(() => {
			window.dispatchEvent(new Event('open-search'));
		});

		const input = screen.getByPlaceholderText('common.searchProducts');
		fireEvent.change(input, { target: { value: 'nonexistent' } });

		await act(async () => {
			vi.advanceTimersByTime(350);
		});

		await waitFor(() => {
			expect(screen.getByText('common.noResults', { selector: 'p' })).toBeInTheDocument();
			expect(screen.getByText('search.tryDifferent')).toBeInTheDocument();
		});
	});

	it('displays search results when found', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({
				products: [
					{
						id: 1,
						title: 'LED Panel A',
						description: 'High quality LED panel',
						variants: [{ id: 1, title: 'Default', price: { amount: 3000, currency: 'JPY' } }],
					},
					{
						id: 2,
						title: 'LED Strip B',
						description: null,
						variants: [{ id: 2, title: 'Default', price: { amount: 1500, currency: 'JPY' } }],
					},
				],
			}),
		});

		render(<SearchModal />);

		act(() => {
			window.dispatchEvent(new Event('open-search'));
		});

		const input = screen.getByPlaceholderText('common.searchProducts');
		fireEvent.change(input, { target: { value: 'LED' } });

		await act(async () => {
			vi.advanceTimersByTime(350);
		});

		await waitFor(() => {
			expect(screen.getByText('LED Panel A')).toBeInTheDocument();
			expect(screen.getByText('LED Strip B')).toBeInTheDocument();
			expect(screen.getByText('High quality LED panel')).toBeInTheDocument();
		});
	});

	it('resets query and results when reopened', () => {
		render(<SearchModal />);

		act(() => {
			window.dispatchEvent(new Event('open-search'));
		});

		const input = screen.getByPlaceholderText('common.searchProducts');
		fireEvent.change(input, { target: { value: 'test' } });

		act(() => {
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		});

		act(() => {
			window.dispatchEvent(new Event('open-search'));
		});

		const newInput = screen.getByPlaceholderText('common.searchProducts');
		expect(newInput).toHaveValue('');
	});

	it('renders product links with correct href', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({
				products: [
					{
						id: 42,
						title: 'Test Product',
						description: null,
						variants: [{ id: 1, title: 'Default', price: { amount: 1000, currency: 'JPY' } }],
					},
				],
			}),
		});

		render(<SearchModal />);

		act(() => {
			window.dispatchEvent(new Event('open-search'));
		});

		fireEvent.change(screen.getByPlaceholderText('common.searchProducts'), { target: { value: 'Test' } });

		await act(async () => {
			vi.advanceTimersByTime(350);
		});

		await waitFor(() => {
			const link = screen.getByText('Test Product').closest('a');
			expect(link).toHaveAttribute('href', '/products/42');
		});
	});

	it('cleans up event listeners on unmount', () => {
		const addSpy = vi.spyOn(window, 'addEventListener');
		const removeSpy = vi.spyOn(window, 'removeEventListener');

		const { unmount } = render(<SearchModal />);

		act(() => {
			window.dispatchEvent(new Event('open-search'));
		});

		const addedListeners = addSpy.mock.calls
			.filter(([type]) => type === 'keydown' || type === 'open-search')
			.map(([type]) => type);

		unmount();

		const removedListeners = removeSpy.mock.calls
			.filter(([type]) => type === 'keydown' || type === 'open-search')
			.map(([type]) => type);

		// Every added listener should have a corresponding removal
		for (const listener of addedListeners) {
			expect(removedListeners).toContain(listener);
		}

		addSpy.mockRestore();
		removeSpy.mockRestore();
	});

	it('shows error message on network failure', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new TypeError('Failed to fetch')
		);

		render(<SearchModal />);

		act(() => {
			window.dispatchEvent(new Event('open-search'));
		});

		const input = screen.getByPlaceholderText('common.searchProducts');
		fireEvent.change(input, { target: { value: 'test query' } });

		await act(async () => {
			vi.advanceTimersByTime(350);
		});

		await waitFor(() => {
			expect(screen.getByText('errors.networkError')).toBeInTheDocument();
			expect(screen.getByText('errors.networkErrorDescription')).toBeInTheDocument();
			expect(screen.getByText('errors.retry')).toBeInTheDocument();
		});
	});

	it('aborts in-flight fetch when query changes', async () => {
		const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
			() => new Promise(() => {}) // never resolves
		);

		render(<SearchModal />);

		act(() => {
			window.dispatchEvent(new Event('open-search'));
		});

		const input = screen.getByPlaceholderText('common.searchProducts');
		fireEvent.change(input, { target: { value: 'first' } });

		await act(async () => {
			vi.advanceTimersByTime(350);
		});

		// Change query — should abort previous request
		fireEvent.change(input, { target: { value: 'second' } });

		expect(abortSpy).toHaveBeenCalled();

		abortSpy.mockRestore();
	});

	it('aborts fetch on unmount', async () => {
		const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
			() => new Promise(() => {})
		);

		const { unmount } = render(<SearchModal />);

		act(() => {
			window.dispatchEvent(new Event('open-search'));
		});

		const input = screen.getByPlaceholderText('common.searchProducts');
		fireEvent.change(input, { target: { value: 'test' } });

		await act(async () => {
			vi.advanceTimersByTime(350);
		});

		unmount();

		expect(abortSpy).toHaveBeenCalled();

		abortSpy.mockRestore();
	});

	it('clears error state when reopened', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new TypeError('Failed to fetch')
		);

		render(<SearchModal />);

		act(() => {
			window.dispatchEvent(new Event('open-search'));
		});

		const input = screen.getByPlaceholderText('common.searchProducts');
		fireEvent.change(input, { target: { value: 'test' } });

		await act(async () => {
			vi.advanceTimersByTime(350);
		});

		await waitFor(() => {
			expect(screen.getByText('errors.networkError')).toBeInTheDocument();
		});

		// Close and reopen
		act(() => {
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		});

		act(() => {
			window.dispatchEvent(new Event('open-search'));
		});

		expect(screen.queryByText('errors.networkError')).not.toBeInTheDocument();
	});
});
