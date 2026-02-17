import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../i18n', () => ({
	t: (key: string, params?: Record<string, string>) => {
		if (params) {
			return Object.entries(params).reduce(
				(acc, [k, v]) => acc.replace(`{${k}}`, v),
				key
			);
		}
		return key;
	},
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
	fetchJson: vi.fn(),
}));

import ReviewSection from '../components/ReviewSection';
import { fetchJson } from '../lib/api';

const mockReviews = [
	{
		id: 1,
		customer_name: 'Taro Yamada',
		rating: 5,
		title: 'Great product',
		body: 'Highly recommended!',
		created_at: '2026-01-15T10:00:00Z',
	},
	{
		id: 2,
		customer_name: 'Hanako Suzuki',
		rating: 3,
		title: 'Average',
		body: 'It was okay.',
		created_at: '2026-01-10T08:00:00Z',
	},
];

describe('ReviewSection', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows loading skeleton initially', () => {
		(fetchJson as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
		const { container } = render(<ReviewSection productId={1} />);
		expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
	});

	it('displays reviews after loading', async () => {
		(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			reviews: mockReviews,
			averageRating: 4.0,
			reviewCount: 2,
		});

		await act(async () => {
			render(<ReviewSection productId={1} />);
		});

		await waitFor(() => {
			expect(screen.getByText('reviews.title')).toBeInTheDocument();
			expect(screen.getByText('Taro Yamada')).toBeInTheDocument();
			expect(screen.getByText('Great product')).toBeInTheDocument();
			expect(screen.getByText('Highly recommended!')).toBeInTheDocument();
			expect(screen.getByText('Hanako Suzuki')).toBeInTheDocument();
			expect(screen.getByText('Average')).toBeInTheDocument();
		});
	});

	it('shows average rating and review count', async () => {
		(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			reviews: mockReviews,
			averageRating: 4.0,
			reviewCount: 2,
		});

		await act(async () => {
			render(<ReviewSection productId={1} />);
		});

		await waitFor(() => {
			expect(screen.getByText('reviews.basedOnReviews')).toBeInTheDocument();
		});
	});

	it('shows no reviews message when list is empty', async () => {
		(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			reviews: [],
			averageRating: null,
			reviewCount: 0,
		});

		await act(async () => {
			render(<ReviewSection productId={1} />);
		});

		await waitFor(() => {
			expect(screen.getByText('reviews.noReviews')).toBeInTheDocument();
			expect(screen.getByText('reviews.noReviewsDescription')).toBeInTheDocument();
		});
	});

	it('shows "be first to review" button when no reviews', async () => {
		(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			reviews: [],
			averageRating: null,
			reviewCount: 0,
		});

		await act(async () => {
			render(<ReviewSection productId={1} />);
		});

		await waitFor(() => {
			expect(screen.getByText('reviews.beFirstToReview')).toBeInTheDocument();
		});
	});

	it('opens review form when "write review" button is clicked', async () => {
		(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			reviews: mockReviews,
			averageRating: 4.0,
			reviewCount: 2,
		});

		await act(async () => {
			render(<ReviewSection productId={1} />);
		});

		await waitFor(() => {
			expect(screen.getByText('reviews.writeReview')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText('reviews.writeReview'));

		expect(screen.getByLabelText('reviews.yourName')).toBeInTheDocument();
		expect(screen.getByLabelText('reviews.yourEmail')).toBeInTheDocument();
		expect(screen.getByLabelText('reviews.reviewTitle')).toBeInTheDocument();
		expect(screen.getByLabelText('reviews.reviewBody')).toBeInTheDocument();
	});

	it('disables submit button when rating is 0', async () => {
		(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			reviews: [],
			averageRating: null,
			reviewCount: 0,
		});

		await act(async () => {
			render(<ReviewSection productId={1} />);
		});

		await waitFor(() => {
			expect(screen.getByText('reviews.beFirstToReview')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText('reviews.beFirstToReview'));

		const submitButton = screen.getByText('reviews.submit');
		expect(submitButton).toBeDisabled();
	});

	it('does not submit when required fields are empty', async () => {
		(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			reviews: [],
			averageRating: null,
			reviewCount: 0,
		});

		await act(async () => {
			render(<ReviewSection productId={1} />);
		});

		await waitFor(() => {
			expect(screen.getByText('reviews.beFirstToReview')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText('reviews.beFirstToReview'));

		// Click a star to enable submit
			const starButtons = screen.getAllByRole('radio').filter((b) =>
				b.getAttribute('aria-label')?.includes('reviews.stars')
			);
			const fifthStar = starButtons.at(4);
			expect(fifthStar).toBeTruthy();
			if (!fifthStar) throw new Error('Missing 5-star button');
			fireEvent.click(fifthStar); // 5 stars

		const form = screen.getByText('reviews.submit').closest('form')!;
		fireEvent.submit(form);

		// fetchJson should not be called for the submit (only for loading reviews)
		expect(fetchJson).toHaveBeenCalledTimes(1);
	});

	it('shows success message after successful submission', async () => {
		(fetchJson as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				ok: true,
				reviews: [],
				averageRating: null,
				reviewCount: 0,
			})
			.mockResolvedValueOnce({ ok: true })
			.mockResolvedValueOnce({
				ok: true,
				reviews: [],
				averageRating: null,
				reviewCount: 0,
			});

		await act(async () => {
			render(<ReviewSection productId={1} />);
		});

		await waitFor(() => {
			expect(screen.getByText('reviews.beFirstToReview')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText('reviews.beFirstToReview'));

		// Click 5 stars
			const starButtons = screen.getAllByRole('radio').filter((b) =>
				b.getAttribute('aria-label')?.includes('reviews.stars')
			);
			const fifthStar = starButtons.at(4);
			expect(fifthStar).toBeTruthy();
			if (!fifthStar) throw new Error('Missing 5-star button');
			fireEvent.click(fifthStar);

		// Fill in required fields
		fireEvent.change(screen.getByLabelText('reviews.yourName'), {
			target: { value: 'Test User' },
		});
		fireEvent.change(screen.getByLabelText('reviews.yourEmail'), {
			target: { value: 'test@example.com' },
		});
		fireEvent.change(screen.getByLabelText('reviews.reviewTitle'), {
			target: { value: 'Great!' },
		});
		fireEvent.change(screen.getByLabelText('reviews.reviewBody'), {
			target: { value: 'Very nice product' },
		});

		const form = screen.getByText('reviews.submit').closest('form')!;
		fireEvent.submit(form);

		await waitFor(() => {
			expect(screen.getByText('reviews.submitSuccess')).toBeInTheDocument();
		});
	});

	it('shows error message on submission failure', async () => {
		(fetchJson as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				ok: true,
				reviews: [],
				averageRating: null,
				reviewCount: 0,
			})
			.mockRejectedValueOnce(new Error('Network error'));

		await act(async () => {
			render(<ReviewSection productId={1} />);
		});

		await waitFor(() => {
			expect(screen.getByText('reviews.beFirstToReview')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText('reviews.beFirstToReview'));

		// Click 5 stars
			const starButtons = screen.getAllByRole('radio').filter((b) =>
				b.getAttribute('aria-label')?.includes('reviews.stars')
			);
			const fifthStar = starButtons.at(4);
			expect(fifthStar).toBeTruthy();
			if (!fifthStar) throw new Error('Missing 5-star button');
			fireEvent.click(fifthStar);

		// Fill in all fields
		fireEvent.change(screen.getByLabelText('reviews.yourName'), {
			target: { value: 'Test User' },
		});
		fireEvent.change(screen.getByLabelText('reviews.yourEmail'), {
			target: { value: 'test@example.com' },
		});
		fireEvent.change(screen.getByLabelText('reviews.reviewTitle'), {
			target: { value: 'Great!' },
		});
		fireEvent.change(screen.getByLabelText('reviews.reviewBody'), {
			target: { value: 'Very nice product' },
		});

		const form = screen.getByText('reviews.submit').closest('form')!;
		fireEvent.submit(form);

		await waitFor(() => {
			expect(screen.getByText('Network error')).toBeInTheDocument();
		});
	});

	it('shows star rating input in review form', async () => {
		(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			reviews: mockReviews,
			averageRating: 4.0,
			reviewCount: 2,
		});

		await act(async () => {
			render(<ReviewSection productId={1} />);
		});

		await waitFor(() => {
			expect(screen.getByText('reviews.writeReview')).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText('reviews.writeReview'));

		expect(screen.getByText('reviews.rating')).toBeInTheDocument();
		// Should have 5 star radio buttons in radiogroup
		const starButtons = screen.getAllByRole('radio').filter((b) =>
			b.getAttribute('aria-label')?.includes('reviews.stars')
		);
		expect(starButtons).toHaveLength(5);
	});

	it('handles API error on initial load gracefully', async () => {
		(fetchJson as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('API error'));

		await act(async () => {
			render(<ReviewSection productId={1} />);
		});

		await waitFor(() => {
			expect(screen.getByText('reviews.title')).toBeInTheDocument();
			expect(screen.getByText('reviews.noReviews')).toBeInTheDocument();
		});
	});
});
