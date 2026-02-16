import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminPagination from './AdminPagination'

vi.mock('../catalyst/pagination', () => ({
	Pagination: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <nav {...props}>{children}</nav>,
	PaginationPrevious: ({ href, children }: React.PropsWithChildren<{ href?: string }>) => (
		<a href={href} data-testid="prev">{children || 'Previous'}</a>
	),
	PaginationNext: ({ href, children }: React.PropsWithChildren<{ href?: string }>) => (
		<a href={href} data-testid="next">{children || 'Next'}</a>
	),
	PaginationList: ({ children }: React.PropsWithChildren) => <div data-testid="page-list">{children}</div>,
	PaginationPage: ({ children, href, current }: React.PropsWithChildren<{ href: string; current?: boolean }>) => (
		<a href={href} aria-current={current ? 'page' : undefined}>{children}</a>
	),
}))

describe('AdminPagination', () => {
	const buildHref = (page: number) => `?page=${page}`

	it('returns null when totalPages is 1', () => {
		const { container } = render(
			<AdminPagination currentPage={1} totalPages={1} buildHref={buildHref} />
		)
		expect(container.innerHTML).toBe('')
	})

	it('renders page info text', () => {
		render(
			<AdminPagination currentPage={2} totalPages={5} buildHref={buildHref} />
		)
		expect(screen.getByText('ページ 2 / 5')).toBeDefined()
	})

	it('renders previous button when not on first page', () => {
		render(
			<AdminPagination currentPage={2} totalPages={5} buildHref={buildHref} />
		)
		const prev = screen.getByTestId('prev')
		expect(prev).toBeDefined()
		expect(prev.getAttribute('href')).toBe('?page=1')
	})

	it('does not render previous button on first page', () => {
		render(
			<AdminPagination currentPage={1} totalPages={5} buildHref={buildHref} />
		)
		expect(screen.queryByTestId('prev')).toBeNull()
	})

	it('renders next button when not on last page', () => {
		render(
			<AdminPagination currentPage={2} totalPages={5} buildHref={buildHref} />
		)
		const next = screen.getByTestId('next')
		expect(next).toBeDefined()
		expect(next.getAttribute('href')).toBe('?page=3')
	})

	it('does not render next button on last page', () => {
		render(
			<AdminPagination currentPage={5} totalPages={5} buildHref={buildHref} />
		)
		expect(screen.queryByTestId('next')).toBeNull()
	})

	it('renders page numbers', () => {
		render(
			<AdminPagination currentPage={3} totalPages={5} buildHref={buildHref} />
		)
		const pageList = screen.getByTestId('page-list')
		expect(pageList).toBeDefined()
		// Should show 5 page links
		const links = pageList.querySelectorAll('a')
		expect(links.length).toBe(5)
	})

	it('marks current page as active', () => {
		render(
			<AdminPagination currentPage={3} totalPages={5} buildHref={buildHref} />
		)
		const currentLink = screen.getByText('3')
		expect(currentLink.getAttribute('aria-current')).toBe('page')
	})
})
