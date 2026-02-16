import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../i18n', () => ({
  t: (key: string) => key,
}))

vi.mock('../../lib/format', () => ({
  formatPrice: (amount: number) => `¥${amount.toLocaleString()}`,
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
  TableRow: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <tr {...props}>{children}</tr>,
  TableHeader: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <th {...props}>{children}</th>,
  TableCell: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <td {...props}>{children}</td>,
}))

vi.mock('../catalyst/badge', () => ({
  Badge: ({ children, color }: React.PropsWithChildren<{ color?: string }>) => <span data-color={color}>{children}</span>,
}))

vi.mock('./AdminPagination', () => ({
  default: ({ currentPage, totalPages }: { currentPage: number; totalPages: number }) => (
    <div data-testid="pagination">Page {currentPage} of {totalPages}</div>
  ),
}))

import CustomersTable from './CustomersTable'

const mockCustomers = [
  {
    id: 1,
    name: 'Taro Yamada',
    email: 'taro@example.com',
    metadata: null,
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
    order_count: 5,
    total_spent: 50000,
    last_order_date: '2026-01-14T10:00:00Z',
  },
  {
    id: 2,
    name: 'Hanako Tanaka',
    email: null,
    metadata: null,
    created_at: '2026-01-12T10:00:00Z',
    updated_at: '2026-01-13T10:00:00Z',
    order_count: 0,
    total_spent: 0,
    last_order_date: null,
  },
]

describe('CustomersTable', () => {
  it('renders customer rows', () => {
    render(
      <CustomersTable
        customers={mockCustomers}
        currentPage={1}
        totalPages={1}
        searchQuery=""
      />
    )
    expect(screen.getByText('Taro Yamada')).toBeDefined()
    expect(screen.getByText('Hanako Tanaka')).toBeDefined()
  })

  it('renders customer email', () => {
    render(
      <CustomersTable
        customers={mockCustomers}
        currentPage={1}
        totalPages={1}
        searchQuery=""
      />
    )
    expect(screen.getByText('taro@example.com')).toBeDefined()
  })

  it('renders "No email" for customers without email', () => {
    render(
      <CustomersTable
        customers={mockCustomers}
        currentPage={1}
        totalPages={1}
        searchQuery=""
      />
    )
    expect(screen.getByText('No email')).toBeDefined()
  })

  it('renders order count badge for customers with orders', () => {
    render(
      <CustomersTable
        customers={mockCustomers}
        currentPage={1}
        totalPages={1}
        searchQuery=""
      />
    )
    expect(screen.getByText('5')).toBeDefined()
  })

  it('renders "0" for customers with no orders', () => {
    render(
      <CustomersTable
        customers={mockCustomers}
        currentPage={1}
        totalPages={1}
        searchQuery=""
      />
    )
    expect(screen.getByText('0')).toBeDefined()
  })

  it('renders empty state when no customers', () => {
    render(
      <CustomersTable
        customers={[]}
        currentPage={1}
        totalPages={1}
        searchQuery=""
      />
    )
    expect(screen.getByTestId('empty-state')).toBeDefined()
    expect(screen.getByText('admin.emptyCustomers')).toBeDefined()
  })

  it('renders pagination', () => {
    render(
      <CustomersTable
        customers={mockCustomers}
        currentPage={3}
        totalPages={10}
        searchQuery="taro"
      />
    )
    expect(screen.getByTestId('pagination')).toBeDefined()
    expect(screen.getByText('Page 3 of 10')).toBeDefined()
  })

  it('renders view links for each customer', () => {
    render(
      <CustomersTable
        customers={mockCustomers}
        currentPage={1}
        totalPages={1}
        searchQuery=""
      />
    )
    const viewLinks = screen.getAllByText('View')
    expect(viewLinks.length).toBe(2)
  })
})
