import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../i18n', () => ({
  t: (key: string) => key,
}))

vi.mock('../../lib/format', () => ({
  formatDate: (dateStr: string | null) => dateStr ? new Date(dateStr).toLocaleDateString('ja-JP') : '-',
}))

vi.mock('./TableEmptyState', () => ({
  default: ({ message, description }: { message: string; description?: string }) => (
    <div data-testid="empty-state">
      <p>{message}</p>
      {description && <p>{description}</p>}
    </div>
  ),
}))

vi.mock('../catalyst/table', () => ({
  Table: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <table {...props}>{children}</table>,
  TableHead: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <thead {...props}>{children}</thead>,
  TableBody: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <tbody {...props}>{children}</tbody>,
  TableRow: ({ children, href, ...props }: React.PropsWithChildren<{ href?: string }>) => <tr data-href={href} {...props}>{children}</tr>,
  TableHeader: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <th {...props}>{children}</th>,
  TableCell: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <td {...props}>{children}</td>,
}))

vi.mock('../catalyst/badge', () => ({
  Badge: ({ children, color }: React.PropsWithChildren<{ color?: string }>) => <span data-color={color}>{children}</span>,
}))

import CouponsTable from './CouponsTable'

const mockCoupons = [
  {
    id: 1,
    code: 'SAVE10',
    type: 'percentage',
    value: 10,
    currency: 'JPY',
    min_order_amount: 5000,
    max_uses: 100,
    uses_per_customer: 1,
    current_uses: 25,
    status: 'active',
    starts_at: '2026-01-01T00:00:00Z',
    expires_at: '2027-12-31T23:59:59Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
  },
  {
    id: 2,
    code: 'FLAT500',
    type: 'fixed',
    value: 500,
    currency: 'JPY',
    min_order_amount: 0,
    max_uses: null,
    uses_per_customer: 1,
    current_uses: 0,
    status: 'inactive',
    starts_at: null,
    expires_at: null,
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-01-05T00:00:00Z',
  },
]

describe('CouponsTable', () => {
  it('renders coupon rows with codes', () => {
    render(<CouponsTable coupons={mockCoupons} />)
    expect(screen.getByText('SAVE10')).toBeDefined()
    expect(screen.getByText('FLAT500')).toBeDefined()
  })

  it('renders coupon type badges', () => {
    render(<CouponsTable coupons={mockCoupons} />)
    expect(screen.getByText('Percentage')).toBeDefined()
    expect(screen.getByText('Fixed')).toBeDefined()
  })

  it('formats percentage value correctly', () => {
    render(<CouponsTable coupons={mockCoupons} />)
    expect(screen.getByText('10%')).toBeDefined()
  })

  it('renders status badges', () => {
    render(<CouponsTable coupons={mockCoupons} />)
    expect(screen.getByText('Active')).toBeDefined()
    expect(screen.getByText('Inactive')).toBeDefined()
  })

  it('renders usage counts', () => {
    render(<CouponsTable coupons={mockCoupons} />)
    expect(screen.getByText('25 / 100')).toBeDefined()
    expect(screen.getByText('0')).toBeDefined()
  })

  it('renders empty state when no coupons', () => {
    render(<CouponsTable coupons={[]} />)
    expect(screen.getByTestId('empty-state')).toBeDefined()
    expect(screen.getByText('admin.emptyCoupons')).toBeDefined()
  })

  it('renders edit links', () => {
    render(<CouponsTable coupons={mockCoupons} />)
    const editLinks = screen.getAllByText('Edit')
    expect(editLinks.length).toBe(2)
  })

  it('toggles select all checkbox', () => {
    render(<CouponsTable coupons={mockCoupons} />)
    const selectAll = screen.getByLabelText('admin.selectAll')
    fireEvent.click(selectAll)
    expect(screen.getByText('admin.selectedCount')).toBeDefined()
  })

  it('deselects all when clicking deselect button', () => {
    render(<CouponsTable coupons={mockCoupons} />)
    const selectAll = screen.getByLabelText('admin.selectAll')
    fireEvent.click(selectAll)
    expect(screen.getByText('admin.selectedCount')).toBeDefined()

    fireEvent.click(screen.getByText('admin.deselect'))
    expect(screen.queryByText('admin.selectedCount')).toBeNull()
  })

  it('shows min order amount for coupons with minimum', () => {
    render(<CouponsTable coupons={mockCoupons} />)
    expect(screen.getByText(/Min:/)).toBeDefined()
  })
})
