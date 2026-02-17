import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../i18n', () => ({
	t: (key: string) => key,
	useTranslation: () => ({ t: (key: string) => key }),
	translations: {},
}));

vi.mock('../lib/api', () => ({
	getApiBase: () => 'http://localhost:8787',
	buildStoreUrl: (path: string, base: string) => `${base}${path}`,
}));

import RestockNotification from './RestockNotification';

describe('RestockNotification', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	it('renders the form with title and description', () => {
		render(<RestockNotification productId={42} />);

		expect(screen.getByText('restock.title')).toBeInTheDocument();
		expect(screen.getByText('restock.description')).toBeInTheDocument();
	});

	it('renders email input and submit button', () => {
		render(<RestockNotification productId={42} />);

		const input = screen.getByPlaceholderText('restock.emailPlaceholder');
		expect(input).toBeInTheDocument();
		expect(screen.getByText('restock.subscribe')).toBeInTheDocument();
	});

	it('shows error for invalid email', async () => {
		render(<RestockNotification productId={42} />);

		const input = screen.getByPlaceholderText('restock.emailPlaceholder');
		fireEvent.change(input, { target: { value: 'invalid' } });
		fireEvent.submit(input.closest('form')!);

		expect(screen.getByText('restock.invalidEmail')).toBeInTheDocument();
	});

	it('shows error for empty email', async () => {
		render(<RestockNotification productId={42} />);

		fireEvent.submit(screen.getByPlaceholderText('restock.emailPlaceholder').closest('form')!);

		expect(screen.getByText('restock.invalidEmail')).toBeInTheDocument();
	});

	it('submits valid email and shows success message', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ ok: true }),
		});

		render(<RestockNotification productId={42} />);

		const input = screen.getByPlaceholderText('restock.emailPlaceholder');
		fireEvent.change(input, { target: { value: 'test@example.com' } });
		fireEvent.submit(input.closest('form')!);

		await waitFor(() => {
			expect(screen.getByText('restock.success')).toBeInTheDocument();
		});

		expect(global.fetch).toHaveBeenCalledWith(
			'http://localhost:8787/products/42/notify',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ email: 'test@example.com' }),
			})
		);
	});

	it('shows error message when API returns error', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: () => Promise.resolve({ ok: false, message: 'Server error' }),
		});

		render(<RestockNotification productId={42} />);

		const input = screen.getByPlaceholderText('restock.emailPlaceholder');
		fireEvent.change(input, { target: { value: 'test@example.com' } });
		fireEvent.submit(input.closest('form')!);

		await waitFor(() => {
			expect(screen.getByText('Server error')).toBeInTheDocument();
		});
	});

	it('shows generic error when fetch throws', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new Error('Network failure')
		);

		render(<RestockNotification productId={42} />);

		const input = screen.getByPlaceholderText('restock.emailPlaceholder');
		fireEvent.change(input, { target: { value: 'test@example.com' } });
		fireEvent.submit(input.closest('form')!);

		await waitFor(() => {
			expect(screen.getByText('Network failure')).toBeInTheDocument();
		});
	});

	it('disables input and button while submitting', async () => {
		let resolvePromise: (value: unknown) => void;
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
			() => new Promise((resolve) => { resolvePromise = resolve; })
		);

		render(<RestockNotification productId={42} />);

		const input = screen.getByPlaceholderText('restock.emailPlaceholder');
		fireEvent.change(input, { target: { value: 'test@example.com' } });
		fireEvent.submit(input.closest('form')!);

		expect(input).toBeDisabled();
		expect(screen.getByText('restock.submitting')).toBeDisabled();

		resolvePromise!({
			ok: true,
			json: () => Promise.resolve({ ok: true }),
		});

		await waitFor(() => {
			expect(screen.getByText('restock.success')).toBeInTheDocument();
		});
	});

	it('clears error message when user starts typing', async () => {
		render(<RestockNotification productId={42} />);

		const input = screen.getByPlaceholderText('restock.emailPlaceholder');
		fireEvent.change(input, { target: { value: 'bad' } });
		fireEvent.submit(input.closest('form')!);

		expect(screen.getByText('restock.invalidEmail')).toBeInTheDocument();

		fireEvent.change(input, { target: { value: 'test@example.com' } });

		expect(screen.queryByText('restock.invalidEmail')).not.toBeInTheDocument();
	});
});
