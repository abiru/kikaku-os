import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../i18n', () => ({
  t: (key: string) => key,
}))

vi.mock('../../lib/adminUtils', () => ({
  getProductBadgeColor: (status: string) => (status === 'active' ? 'lime' : 'zinc'),
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

vi.mock('../catalyst/button', () => ({
  Button: ({ children, onClick, ...props }: React.PropsWithChildren<{ onClick?: () => void }>) => <button onClick={onClick} {...props}>{children}</button>,
}))

vi.mock('../catalyst/link', () => ({
  Link: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('./AdminPagination', () => ({
  default: ({ currentPage, totalPages }: { currentPage: number; totalPages: number }) => (
    <div data-testid="pagination">Page {currentPage} of {totalPages}</div>
  ),
}))

import ProductsTable from './ProductsTable'

const mockProducts = [
  {
    id: 1,
    title: 'Product A',
    description: 'A nice product',
    status: 'active',
    updated_at: '2026-01-15T10:00:00Z',
  },
  {
    id: 2,
    title: 'Product B',
    description: null,
    status: 'archived',
    updated_at: '2026-01-16T11:00:00Z',
  },
]

describe('ProductsTable', () => {
  it('renders product rows', () => {
    render(
      <ProductsTable
        products={mockProducts}
        currentPage={1}
        totalPages={1}
        searchQuery=""
        statusFilter=""
      />
    )
    expect(screen.getAllByText('Product A').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Product B').length).toBeGreaterThanOrEqual(1)
  })

  it('renders empty state when no products', () => {
    render(
      <ProductsTable
        products={[]}
        currentPage={1}
        totalPages={1}
        searchQuery=""
        statusFilter=""
      />
    )
    expect(screen.getByTestId('empty-state')).toBeDefined()
    expect(screen.getByText('admin.emptyProducts')).toBeDefined()
  })

  it('renders status badges', () => {
    render(
      <ProductsTable
        products={mockProducts}
        currentPage={1}
        totalPages={1}
        searchQuery=""
        statusFilter=""
      />
    )
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Archived').length).toBeGreaterThanOrEqual(1)
  })

  it('renders pagination', () => {
    render(
      <ProductsTable
        products={mockProducts}
        currentPage={2}
        totalPages={5}
        searchQuery="test"
        statusFilter="active"
      />
    )
    expect(screen.getByTestId('pagination')).toBeDefined()
    expect(screen.getByText('Page 2 of 5')).toBeDefined()
  })

  it('sorts products when clicking column headers', () => {
    render(
      <ProductsTable
        products={mockProducts}
        currentPage={1}
        totalPages={1}
        searchQuery=""
        statusFilter=""
      />
    )
    const titleButton = screen.getByText('admin.title')
    fireEvent.click(titleButton)
    // Should not crash; items still rendered
    expect(screen.getAllByText('Product A').length).toBeGreaterThanOrEqual(1)
  })

  it('toggles select all checkbox', () => {
    render(
      <ProductsTable
        products={mockProducts}
        currentPage={1}
        totalPages={1}
        searchQuery=""
        statusFilter=""
      />
    )
    const selectAll = screen.getByLabelText('admin.selectAll')
    fireEvent.click(selectAll)
    expect(screen.getByText('admin.selectedCount')).toBeDefined()
  })

  it('shows archive button for active products', () => {
    render(
      <ProductsTable
        products={mockProducts}
        currentPage={1}
        totalPages={1}
        searchQuery=""
        statusFilter=""
      />
    )
    expect(screen.getAllByText('admin.archive').length).toBeGreaterThanOrEqual(1)
  })

  it('shows restore button for archived products', () => {
    render(
      <ProductsTable
        products={mockProducts}
        currentPage={1}
        totalPages={1}
        searchQuery=""
        statusFilter=""
      />
    )
    expect(screen.getAllByText('admin.restore').length).toBeGreaterThanOrEqual(1)
  })

  it('deselects all when clicking deselect button', () => {
    render(
      <ProductsTable
        products={mockProducts}
        currentPage={1}
        totalPages={1}
        searchQuery=""
        statusFilter=""
      />
    )
    const selectAll = screen.getByLabelText('admin.selectAll')
    fireEvent.click(selectAll)
    expect(screen.getByText('admin.selectedCount')).toBeDefined()

    fireEvent.click(screen.getByText('admin.deselect'))
    expect(screen.queryByText('admin.selectedCount')).toBeNull()
  })
})
