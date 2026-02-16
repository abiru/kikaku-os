import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock i18n — return the key so tests are language-independent
vi.mock('../../i18n', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
	t: (key: string) => key,
}))

// Mock adminUtils — return raw status values for predictable assertions
vi.mock('../../lib/adminUtils', () => ({
	getReviewBadgeColor: (status: string) => {
		const colors: Record<string, string> = { pending: 'amber', approved: 'lime', rejected: 'red' }
		return colors[status] || 'zinc'
	},
	getReviewStatusLabel: (status: string) => status,
}))

// Mock format
vi.mock('../../lib/format', () => ({
	formatDate: (date: string) => date,
}))

// Mock catalyst components
vi.mock('../catalyst/table', () => ({
	Table: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <table {...props}>{children}</table>,
	TableHead: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <thead {...props}>{children}</thead>,
	TableBody: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <tbody {...props}>{children}</tbody>,
	TableRow: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <tr {...props}>{children}</tr>,
	TableHeader: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <th {...props}>{children}</th>,
	TableCell: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <td {...props}>{children}</td>,
}))

vi.mock('../catalyst/badge', () => ({
	Badge: ({ children, color }: React.PropsWithChildren<{ color?: string }>) => <span data-color={color}>{children}</span>,
}))

vi.mock('../catalyst/button', () => ({
	Button: ({ children, onClick, disabled, ...props }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) => (
		<button onClick={onClick} disabled={disabled} {...props}>{children}</button>
	),
}))

vi.mock('../catalyst/select', () => ({
	Select: ({ children, value, onChange, ...props }: React.PropsWithChildren<{ value?: string; onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void }>) => (
		<select value={value} onChange={onChange} {...props}>{children}</select>
	),
}))

vi.mock('../catalyst/fieldset', () => ({
	Field: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	Label: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <label {...props}>{children}</label>,
}))

vi.mock('../catalyst/input', () => ({
	Input: (props: Record<string, unknown>) => <input {...props} />,
}))

vi.mock('../catalyst/link', () => ({
	Link: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('../StarRating', () => ({
	StarRatingDisplay: ({ rating }: { rating: number }) => <span data-testid="star-rating">{rating} stars</span>,
}))

vi.mock('./TableSkeleton', () => ({
	default: () => <div data-testid="table-skeleton">Loading...</div>,
}))

const mockReviews = [
	{
		id: 1,
		product_id: 10,
		product_title: 'LED Light A',
		customer_email: 'user@example.com',
		customer_name: 'Taro Yamada',
		rating: 5,
		title: 'Great product',
		body: 'Really loved it',
		status: 'pending',
		created_at: '2026-01-15T10:00:00Z',
		updated_at: '2026-01-15T10:00:00Z',
	},
	{
		id: 2,
		product_id: 20,
		product_title: 'LED Light B',
		customer_email: 'another@example.com',
		customer_name: 'Hanako Suzuki',
		rating: 3,
		title: 'Average',
		body: 'It was okay',
		status: 'approved',
		created_at: '2026-01-16T11:00:00Z',
		updated_at: '2026-01-16T11:00:00Z',
	},
	{
		id: 3,
		product_id: 10,
		product_title: 'LED Light A',
		customer_email: 'third@example.com',
		customer_name: 'Jiro Tanaka',
		rating: 1,
		title: 'Bad',
		body: 'Disappointed',
		status: 'rejected',
		created_at: '2026-01-17T12:00:00Z',
		updated_at: '2026-01-17T12:00:00Z',
	},
]

const mockFetchResponse = (reviews: typeof mockReviews) => {
	global.fetch = vi.fn().mockResolvedValue({
		json: () => Promise.resolve({ ok: true, reviews, total: reviews.length }),
	})
}

const waitForReviewsToLoad = async () => {
	await waitFor(() => {
		expect(screen.queryByTestId('table-skeleton')).toBeNull()
	})
}

import ReviewsTable from './ReviewsTable'

describe('ReviewsTable', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockFetchResponse(mockReviews)
	})

	it('renders review rows after loading', async () => {
		render(<ReviewsTable apiBase="http://localhost:8787" />)
		await waitForReviewsToLoad()
		// LED Light A appears in filter dropdown + 2 table rows = 3 matches
		expect(screen.getAllByText('LED Light A').length).toBeGreaterThanOrEqual(2)
		expect(screen.getAllByText('LED Light B').length).toBeGreaterThanOrEqual(1)
	})

	it('displays badge colors for different statuses', async () => {
		render(<ReviewsTable apiBase="http://localhost:8787" />)
		await waitForReviewsToLoad()

		const badges = screen.getAllByText(/^(pending|approved|rejected)$/)
		expect(badges.length).toBeGreaterThanOrEqual(3)

		const pendingBadge = badges.find((b) => b.textContent === 'pending')
		expect(pendingBadge?.getAttribute('data-color')).toBe('amber')

		const approvedBadge = badges.find((b) => b.textContent === 'approved')
		expect(approvedBadge?.getAttribute('data-color')).toBe('lime')

		const rejectedBadge = badges.find((b) => b.textContent === 'rejected')
		expect(rejectedBadge?.getAttribute('data-color')).toBe('red')
	})

	it('displays status labels via translation keys', async () => {
		render(<ReviewsTable apiBase="http://localhost:8787" />)
		await waitForReviewsToLoad()

		expect(screen.getAllByText('pending').length).toBeGreaterThanOrEqual(1)
		expect(screen.getAllByText('approved').length).toBeGreaterThanOrEqual(1)
		expect(screen.getAllByText('rejected').length).toBeGreaterThanOrEqual(1)
	})

	it('renders empty state when no reviews', async () => {
		mockFetchResponse([])
		render(<ReviewsTable apiBase="http://localhost:8787" />)
		await waitForReviewsToLoad()
		expect(screen.getByText('reviews.noReviewsAdmin')).toBeDefined()
	})

	it('toggles select all checkbox', async () => {
		render(<ReviewsTable apiBase="http://localhost:8787" />)
		await waitForReviewsToLoad()

		const checkboxes = screen.getAllByRole('checkbox')
		const selectAll = checkboxes[0]!
		fireEvent.click(selectAll)

		expect(screen.getByText('admin.selectedCount')).toBeDefined()
	})

	it('shows bulk approve/reject buttons for pending reviews', async () => {
		render(<ReviewsTable apiBase="http://localhost:8787" />)
		await waitForReviewsToLoad()

		const checkboxes = screen.getAllByRole('checkbox')
		fireEvent.click(checkboxes[0]!)

		expect(screen.getByText('admin.bulkApprove')).toBeDefined()
		expect(screen.getByText('admin.bulkReject')).toBeDefined()
	})

	it('renders star ratings for each review', async () => {
		render(<ReviewsTable apiBase="http://localhost:8787" />)
		await waitForReviewsToLoad()

		const ratings = screen.getAllByTestId('star-rating')
		expect(ratings.length).toBe(3)
		expect(ratings[0]!.textContent).toBe('5 stars')
		expect(ratings[1]!.textContent).toBe('3 stars')
		expect(ratings[2]!.textContent).toBe('1 stars')
	})

	it('shows approve/reject action buttons only for pending reviews', async () => {
		render(<ReviewsTable apiBase="http://localhost:8787" />)
		await waitForReviewsToLoad()

		// Only 1 pending review, so only 1 set of approve/reject buttons in the actions column
		const approveButtons = screen.getAllByText('reviews.approve')
		const rejectButtons = screen.getAllByText('reviews.reject')
		expect(approveButtons.length).toBe(1)
		expect(rejectButtons.length).toBe(1)
	})

	it('shows loading skeleton initially', () => {
		global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
		render(<ReviewsTable apiBase="http://localhost:8787" />)
		expect(screen.getByTestId('table-skeleton')).toBeDefined()
	})
})
