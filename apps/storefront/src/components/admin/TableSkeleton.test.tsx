import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import TableSkeleton from './TableSkeleton';

describe('TableSkeleton', () => {
	it('renders with given number of columns', () => {
		const { container } = render(<TableSkeleton columns={4} />);
		const headerCols = container.querySelector('.border-b')?.querySelectorAll('.bg-zinc-200');
		expect(headerCols).toHaveLength(4);
	});

	it('renders 5 rows by default', () => {
		const { container } = render(<TableSkeleton columns={3} />);
		const rows = container.querySelectorAll('.divide-y > div');
		expect(rows).toHaveLength(5);
	});

	it('renders custom number of rows', () => {
		const { container } = render(<TableSkeleton columns={3} rows={2} />);
		const rows = container.querySelectorAll('.divide-y > div');
		expect(rows).toHaveLength(2);
	});

	it('applies animate-pulse class', () => {
		const { container } = render(<TableSkeleton columns={2} />);
		expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
	});
});
