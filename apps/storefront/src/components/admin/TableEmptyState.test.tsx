import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TableEmptyState from './TableEmptyState';

describe('TableEmptyState', () => {
	it('renders message text', () => {
		render(<TableEmptyState message="No items found" />);
		expect(screen.getByText('No items found')).toBeInTheDocument();
	});

	it('renders description when provided', () => {
		render(<TableEmptyState message="No items" description="Try different filters" />);
		expect(screen.getByText('Try different filters')).toBeInTheDocument();
	});

	it('does not render description when not provided', () => {
		const { container } = render(<TableEmptyState message="No items" />);
		const paragraphs = container.querySelectorAll('p');
		expect(paragraphs).toHaveLength(1);
	});

	it('renders action link when both label and href provided', () => {
		render(
			<TableEmptyState
				message="No items"
				actionLabel="Create New"
				actionHref="/admin/new"
			/>
		);
		const link = screen.getByText('Create New');
		expect(link.closest('a')).toHaveAttribute('href', '/admin/new');
	});

	it('does not render action link when only label provided', () => {
		render(<TableEmptyState message="No items" actionLabel="Create New" />);
		expect(screen.queryByText('Create New')).not.toBeInTheDocument();
	});

	it('renders different icons', () => {
		const { container } = render(<TableEmptyState message="No items" icon="package" />);
		const svg = container.querySelector('svg');
		expect(svg).toBeInTheDocument();
	});

	it('renders default inbox icon', () => {
		const { container } = render(<TableEmptyState message="No items" />);
		const svg = container.querySelector('svg');
		expect(svg).toBeInTheDocument();
	});
});
