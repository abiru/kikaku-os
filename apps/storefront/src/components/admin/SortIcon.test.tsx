import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SortIcon from './SortIcon';

describe('SortIcon', () => {
	it('renders inactive sort icon when field does not match sortField', () => {
		const { container } = render(
			<SortIcon field="name" sortField="price" sortOrder="asc" />
		);
		const svg = container.querySelector('svg');
		expect(svg).toHaveClass('text-zinc-300');
	});

	it('renders ascending icon when field matches and order is asc', () => {
		const { container } = render(
			<SortIcon field="price" sortField="price" sortOrder="asc" />
		);
		const svg = container.querySelector('svg');
		expect(svg).toHaveClass('text-indigo-600');
		const path = svg?.querySelector('path');
		expect(path?.getAttribute('d')).toContain('M5 15l7-7 7 7');
	});

	it('renders descending icon when field matches and order is desc', () => {
		const { container } = render(
			<SortIcon field="price" sortField="price" sortOrder="desc" />
		);
		const svg = container.querySelector('svg');
		expect(svg).toHaveClass('text-indigo-600');
		const path = svg?.querySelector('path');
		expect(path?.getAttribute('d')).toContain('M19 9l-7 7-7-7');
	});
});
