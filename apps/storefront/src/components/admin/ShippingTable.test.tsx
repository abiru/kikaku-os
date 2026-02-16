import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock i18n — return the key so tests are language-independent
vi.mock('../../i18n', () => ({
	t: (key: string) => key,
}))

// Mock adminUtils — return raw status values for predictable assertions
vi.mock('../../lib/adminUtils', () => ({
	getShippingBadgeColor: (status: string | null) => {
		switch (status) {
			case 'shipped': return 'blue'
			case 'processing': return 'yellow'
			case 'delivered': return 'green'
			default: return 'zinc'
		}
	},
	getShippingStatusLabel: (status: string | null) => status || 'unfulfilled',
}))

// Mock format
vi.mock('../../lib/format', () => ({
	formatDate: (date: string | null) => date || '',
	formatPrice: (amount: number) => `JPY ${amount}`,
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
	TableRow: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <tr {...props}>{children}</tr>,
	TableHeader: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <th {...props}>{children}</th>,
	TableCell: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <td {...props}>{children}</td>,
}))

vi.mock('../catalyst/badge', () => ({
	Badge: ({ children, color }: React.PropsWithChildren<{ color?: string }>) => <span data-color={color}>{children}</span>,
}))

vi.mock('../catalyst/button', () => ({
	Button: ({ children, onClick, ...props }: React.PropsWithChildren<{ onClick?: () => void }>) => (
		<button onClick={onClick} {...props}>{children}</button>
	),
}))

import ShippingTable from './ShippingTable'

const mockOrders = [
	{
		order_id: 101,
		customer_email: 'buyer@example.com',
		total: 5000,
		paid_at: '2026-01-15T10:00:00Z',
		fulfillment_id: null,
		fulfillment_status: null,
		tracking_number: null,
		carrier: null,
	},
	{
		order_id: 102,
		customer_email: 'vip@example.com',
		total: 12000,
		paid_at: '2026-01-16T11:00:00Z',
		fulfillment_id: 5,
		fulfillment_status: 'shipped',
		tracking_number: 'JP123456789',
		carrier: 'Yamato',
	},
	{
		order_id: 103,
		customer_email: null,
		total: 3000,
		paid_at: '2026-01-17T12:00:00Z',
		fulfillment_id: 8,
		fulfillment_status: 'delivered',
		tracking_number: 'JP987654321',
		carrier: 'Sagawa',
	},
]

describe('ShippingTable', () => {
	it('renders order rows', () => {
		const onShipClick = vi.fn()
		render(<ShippingTable orders={mockOrders} onShipClick={onShipClick} />)

		expect(screen.getByText('#101')).toBeDefined()
		expect(screen.getByText('#102')).toBeDefined()
		expect(screen.getByText('#103')).toBeDefined()
	})

	it('displays shipping status badges with correct colors', () => {
		const onShipClick = vi.fn()
		render(<ShippingTable orders={mockOrders} onShipClick={onShipClick} />)

		const unfulfilledBadge = screen.getByText('unfulfilled')
		expect(unfulfilledBadge.getAttribute('data-color')).toBe('zinc')

		const shippedBadge = screen.getByText('shipped')
		expect(shippedBadge.getAttribute('data-color')).toBe('blue')

		const deliveredBadge = screen.getByText('delivered')
		expect(deliveredBadge.getAttribute('data-color')).toBe('green')
	})

	it('displays customer email or guest label', () => {
		const onShipClick = vi.fn()
		render(<ShippingTable orders={mockOrders} onShipClick={onShipClick} />)

		expect(screen.getByText('buyer@example.com')).toBeDefined()
		expect(screen.getByText('vip@example.com')).toBeDefined()
		expect(screen.getByText('admin.guest')).toBeDefined()
	})

	it('displays tracking info when available', () => {
		const onShipClick = vi.fn()
		render(<ShippingTable orders={mockOrders} onShipClick={onShipClick} />)

		expect(screen.getByText('JP123456789')).toBeDefined()
		expect(screen.getByText('Yamato')).toBeDefined()
		expect(screen.getByText('JP987654321')).toBeDefined()
		expect(screen.getByText('Sagawa')).toBeDefined()
	})

	it('shows dash when no shipping info', () => {
		const onShipClick = vi.fn()
		render(<ShippingTable orders={mockOrders} onShipClick={onShipClick} />)

		// Order 101 has no carrier/tracking, should show "-"
		expect(screen.getByText('-')).toBeDefined()
	})

	it('renders ship buttons for all orders', () => {
		const onShipClick = vi.fn()
		render(<ShippingTable orders={mockOrders} onShipClick={onShipClick} />)

		const shipButtons = screen.getAllByText('admin.shipButton')
		expect(shipButtons.length).toBe(3)
	})

	it('calls onShipClick with correct arguments', () => {
		const onShipClick = vi.fn()
		render(<ShippingTable orders={mockOrders} onShipClick={onShipClick} />)

		const shipButtons = screen.getAllByText('admin.shipButton')

		fireEvent.click(shipButtons[0]!)
		expect(onShipClick).toHaveBeenCalledWith(101, null)

		fireEvent.click(shipButtons[1]!)
		expect(onShipClick).toHaveBeenCalledWith(102, 5)

		fireEvent.click(shipButtons[2]!)
		expect(onShipClick).toHaveBeenCalledWith(103, 8)
	})

	it('renders empty state when no orders', () => {
		const onShipClick = vi.fn()
		render(<ShippingTable orders={[]} onShipClick={onShipClick} />)

		expect(screen.getByTestId('empty-state')).toBeDefined()
		expect(screen.getByText('admin.emptyShipping')).toBeDefined()
		expect(screen.getByText('admin.emptyShippingDesc')).toBeDefined()
	})

	it('displays formatted prices', () => {
		const onShipClick = vi.fn()
		render(<ShippingTable orders={mockOrders} onShipClick={onShipClick} />)

		expect(screen.getByText('JPY 5000')).toBeDefined()
		expect(screen.getByText('JPY 12000')).toBeDefined()
		expect(screen.getByText('JPY 3000')).toBeDefined()
	})
})
