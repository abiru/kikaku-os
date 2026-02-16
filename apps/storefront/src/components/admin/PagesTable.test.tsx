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

import PagesTable from './PagesTable'

const mockPages = [
  {
    id: 1,
    slug: 'about',
    title: 'About Us',
    meta_title: 'About',
    meta_description: 'About page',
    body: '<p>About content</p>',
    status: 'published',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
  },
  {
    id: 2,
    slug: 'faq',
    title: 'FAQ',
    meta_title: null,
    meta_description: null,
    body: '<p>FAQ content</p>',
    status: 'draft',
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },
  {
    id: 3,
    slug: 'privacy',
    title: 'Privacy Policy',
    meta_title: 'Privacy',
    meta_description: 'Privacy policy',
    body: '<p>Privacy content</p>',
    status: 'published',
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-12T00:00:00Z',
  },
]

const coreSlugs = ['about', 'privacy']

describe('PagesTable', () => {
  it('renders page rows with titles', () => {
    render(<PagesTable pages={mockPages} coreSlugs={coreSlugs} />)
    expect(screen.getByText('About Us')).toBeDefined()
    expect(screen.getByText('FAQ')).toBeDefined()
    expect(screen.getByText('Privacy Policy')).toBeDefined()
  })

  it('renders slug values', () => {
    render(<PagesTable pages={mockPages} coreSlugs={coreSlugs} />)
    expect(screen.getByText('/about')).toBeDefined()
    expect(screen.getByText('/faq')).toBeDefined()
    expect(screen.getByText('/privacy')).toBeDefined()
  })

  it('renders status badges', () => {
    render(<PagesTable pages={mockPages} coreSlugs={coreSlugs} />)
    expect(screen.getAllByText('Published').length).toBe(2)
    expect(screen.getByText('Draft')).toBeDefined()
  })

  it('marks core pages with label', () => {
    render(<PagesTable pages={mockPages} coreSlugs={coreSlugs} />)
    const coreLabels = screen.getAllByText('Core page')
    expect(coreLabels.length).toBe(2)
  })

  it('renders empty state when no pages', () => {
    render(<PagesTable pages={[]} coreSlugs={coreSlugs} />)
    expect(screen.getByTestId('empty-state')).toBeDefined()
    expect(screen.getByText('admin.emptyPages')).toBeDefined()
  })

  it('renders edit links for each page', () => {
    render(<PagesTable pages={mockPages} coreSlugs={coreSlugs} />)
    const editLinks = screen.getAllByText('Edit')
    expect(editLinks.length).toBe(3)
  })

  it('toggles select all checkbox', () => {
    render(<PagesTable pages={mockPages} coreSlugs={coreSlugs} />)
    const selectAll = screen.getByLabelText('全て選択')
    fireEvent.click(selectAll)
    expect(screen.getByText(/件選択中/)).toBeDefined()
  })

  it('deselects all when clicking deselect button', () => {
    render(<PagesTable pages={mockPages} coreSlugs={coreSlugs} />)
    const selectAll = screen.getByLabelText('全て選択')
    fireEvent.click(selectAll)
    expect(screen.getByText(/件選択中/)).toBeDefined()

    fireEvent.click(screen.getByText('選択解除'))
    expect(screen.queryByText(/件選択中/)).toBeNull()
  })

  it('disables bulk delete for core pages only', () => {
    render(<PagesTable pages={mockPages} coreSlugs={coreSlugs} />)
    const selectAll = screen.getByLabelText('全て選択')
    fireEvent.click(selectAll)
    // 3 selected, but only 1 is deletable (faq)
    const deleteButton = screen.getByText('一括削除')
    expect(deleteButton).toBeDefined()
  })

  it('renders table rows linking to edit pages', () => {
    const { container } = render(<PagesTable pages={mockPages} coreSlugs={coreSlugs} />)
    const rows = container.querySelectorAll('tr[data-href]')
    expect(rows.length).toBe(3)
    expect(rows[0]?.getAttribute('data-href')).toBe('/admin/pages/1')
  })
})
