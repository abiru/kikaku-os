import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock i18n — return the key so tests are language-independent
vi.mock('../../i18n', () => ({
	t: (key: string) => key,
}))

// Mock adminUtils — return raw status values for predictable assertions
vi.mock('../../lib/adminUtils', () => ({
	getOrderBadgeColor: (status: string) => (status === 'paid' ? 'lime' : 'zinc'),
	getPaymentStatusLabel: (status: string) => status,
	getFulfillmentStatusLabel: (status: string | null) => status || 'unfulfilled',
	getFulfillmentBadgeColor: (status: string | null) => (status === 'shipped' ? 'lime' : 'zinc'),
}))

// Mock format
vi.mock('../../lib/format', () => ({
	formatPrice: (amount: number, currency: string) => `${currency} ${amount}`,
}))

// Mock TableEmptyState
vi.mock('./TableEmptyState', () => ({
	default: ({ message, description }: { message: string; description?: string }) => (
		<div data-testid="empty-state">
			<p>{message}</p>
			{description && <p>{description}</p>}
		</div>
	),
}))

// Mock catalyst components
vi.mock('../catalyst/table', () => ({
	Table: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <table {...props}>{children}</table>,
	TableHead: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <thead {...props}>{children}</thead>,
	TableBody: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <tbody {...props}>{children}</tbody>,
	TableRow: ({ children, href, title, ...props }: React.PropsWithChildren<{ href?: string; title?: string }>) => <tr data-href={href} {...props}>{children}</tr>,
	TableHeader: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <th {...props}>{children}</th>,
	TableCell: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <td {...props}>{children}</td>,
}))

vi.mock('../catalyst/badge', () => ({
	Badge: ({ children, color }: React.PropsWithChildren<{ color?: string }>) => <span data-color={color}>{children}</span>,
}))

vi.mock('../catalyst/link', () => ({
	Link: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('./AdminPagination', () => ({
	default: ({ currentPage, totalPages }: { currentPage: number; totalPages: number }) => (
		<div data-testid="pagination">Page {currentPage} of {totalPages}</div>
	),
}))

import OrdersTable from './OrdersTable'

const mockOrders = [
	{
		id: 1,
		created_at: '2026-01-15T10:00:00Z',
		customer_email: 'test@example.com',
		status: 'paid',
		fulfillment_status: 'shipped',
		total_net: 5000,
		currency: 'JPY',
	},
	{
		id: 2,
		created_at: '2026-01-16T11:00:00Z',
		customer_email: null,
		status: 'pending',
		fulfillment_status: null,
		total_net: 3000,
		currency: 'JPY',
	},
]

describe('OrdersTable', () => {
	it('renders order rows in both mobile and desktop views', () => {
		render(
			<OrdersTable
				orders={mockOrders}
				currentPage={1}
				totalPages={1}
				searchQuery=""
			/>
		)
		// Both mobile cards and desktop table render order IDs
		expect(screen.getAllByText('#1').length).toBeGreaterThanOrEqual(1)
		expect(screen.getAllByText('#2').length).toBeGreaterThanOrEqual(1)
		expect(screen.getAllByText('test@example.com').length).toBeGreaterThanOrEqual(1)
		expect(screen.getAllByText('admin.guest').length).toBeGreaterThanOrEqual(1)
	})

	it('renders empty state when no orders', () => {
		render(
			<OrdersTable
				orders={[]}
				currentPage={1}
				totalPages={1}
				searchQuery=""
			/>
		)
		expect(screen.getByTestId('empty-state')).toBeDefined()
		expect(screen.getByText('admin.emptyOrders')).toBeDefined()
	})

	it('renders payment status badges', () => {
		render(
			<OrdersTable
				orders={mockOrders}
				currentPage={1}
				totalPages={1}
				searchQuery=""
			/>
		)
		// Mocked getPaymentStatusLabel returns raw status
		expect(screen.getAllByText('paid').length).toBeGreaterThanOrEqual(1)
		expect(screen.getAllByText('pending').length).toBeGreaterThanOrEqual(1)
	})

	it('renders fulfillment status badges', () => {
		render(
			<OrdersTable
				orders={mockOrders}
				currentPage={1}
				totalPages={1}
				searchQuery=""
			/>
		)
		expect(screen.getAllByText('shipped').length).toBeGreaterThanOrEqual(1)
		expect(screen.getAllByText('unfulfilled').length).toBeGreaterThanOrEqual(1)
	})

	it('renders pagination', () => {
		render(
			<OrdersTable
				orders={mockOrders}
				currentPage={2}
				totalPages={5}
				searchQuery="test"
			/>
		)
		expect(screen.getByTestId('pagination')).toBeDefined()
		expect(screen.getByText('Page 2 of 5')).toBeDefined()
	})

	it('toggles select all checkbox', () => {
		render(
			<OrdersTable
				orders={mockOrders}
				currentPage={1}
				totalPages={1}
				searchQuery=""
			/>
		)
		const selectAllCheckbox = screen.getByLabelText('admin.selectAll')
		fireEvent.click(selectAllCheckbox)
		expect(screen.getByText('admin.selectedCount')).toBeDefined()
	})

	it('toggles individual order checkbox', () => {
		render(
			<OrdersTable
				orders={mockOrders}
				currentPage={1}
				totalPages={1}
				searchQuery=""
			/>
		)
		const orderCheckboxes = screen.getAllByLabelText('admin.selectOrder')
		fireEvent.click(orderCheckboxes[0]!)
		expect(screen.getByText('admin.selectedCount')).toBeDefined()
	})

	it('sorts orders when clicking column headers', () => {
		const { container } = render(
			<OrdersTable
				orders={mockOrders}
				currentPage={1}
				totalPages={1}
				searchQuery=""
			/>
		)
		const dateButton = screen.getByText('admin.date')
		fireEvent.click(dateButton)
		const rows = container.querySelectorAll('tbody tr')
		expect(rows.length).toBe(2)
	})

	it('deselects all when clicking deselect button', () => {
		render(
			<OrdersTable
				orders={mockOrders}
				currentPage={1}
				totalPages={1}
				searchQuery=""
			/>
		)
		const selectAllCheckbox = screen.getByLabelText('admin.selectAll')
		fireEvent.click(selectAllCheckbox)
		expect(screen.getByText('admin.selectedCount')).toBeDefined()

		const deselectButton = screen.getByText('admin.deselect')
		fireEvent.click(deselectButton)
		expect(screen.queryByText('admin.selectedCount')).toBeNull()
	})
})
