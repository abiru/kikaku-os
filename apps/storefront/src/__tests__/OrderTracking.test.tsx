import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../i18n', () => ({
	t: (key: string) => key,
	useTranslation: () => ({ t: (key: string) => key }),
	translations: {},
}));

vi.mock('../components/catalyst/badge', () => ({
	Badge: ({ children, color }: { children: React.ReactNode; color?: string }) => (
		<span data-testid="badge" data-color={color}>{children}</span>
	),
}));

vi.mock('../lib/format', () => ({
	formatPrice: (amount: number, currency: string) => `${currency} ${amount}`,
	formatDate: (dateStr: string | null) => dateStr || '-',
}));

import OrderTracking from '../components/OrderTracking';

const baseOrder = {
	id: 1001,
	subtotal: 5000,
	tax_amount: 500,
	total_amount: 5500,
	shipping_fee: 0,
	total_discount: 0,
	currency: 'JPY',
	created_at: '2026-01-15T10:00:00Z',
	paid_at: null as string | null,
	customer_email: 'test@example.com',
	shipping: null,
	fulfillments: [] as Array<{
		id: number;
		status: string;
		tracking_number: string | null;
		carrier: string | null;
		created_at: string;
		updated_at: string;
	}>,
	items: [
		{ title: 'LED Panel', quantity: 2, unit_price: 2500 },
	],
};

describe('OrderTracking', () => {
	it('renders order number and title', () => {
		render(<OrderTracking order={{ ...baseOrder, status: 'pending' }} />);

		expect(screen.getByText('orderTracking.title')).toBeInTheDocument();
		expect(screen.getByText(/1001/)).toBeInTheDocument();
	});

	it('renders order date', () => {
		render(<OrderTracking order={{ ...baseOrder, status: 'paid' }} />);

		expect(screen.getByText(/orderTracking.orderDate/)).toBeInTheDocument();
	});

	it('renders order items', () => {
		render(<OrderTracking order={{ ...baseOrder, status: 'paid' }} />);

		expect(screen.getByText('LED Panel')).toBeInTheDocument();
		expect(screen.getByText('orderTracking.items')).toBeInTheDocument();
	});

	it('renders multiple order items', () => {
		const order = {
			...baseOrder,
			status: 'paid',
			items: [
				{ title: 'LED Panel', quantity: 1, unit_price: 3000 },
				{ title: 'LED Strip', quantity: 3, unit_price: 1000 },
			],
		};

		render(<OrderTracking order={order} />);

		expect(screen.getByText('LED Panel')).toBeInTheDocument();
		expect(screen.getByText('LED Strip')).toBeInTheDocument();
	});

	it('renders price breakdown', () => {
		render(<OrderTracking order={{ ...baseOrder, status: 'paid' }} />);

		expect(screen.getByText('orderTracking.subtotal')).toBeInTheDocument();
		expect(screen.getByText('orderTracking.tax')).toBeInTheDocument();
		expect(screen.getByText('orderTracking.total')).toBeInTheDocument();
	});

	it('shows discount when present', () => {
		const order = { ...baseOrder, status: 'paid', total_discount: 500 };
		render(<OrderTracking order={order} />);

		expect(screen.getByText('orderTracking.discount')).toBeInTheDocument();
	});

	it('hides discount when zero', () => {
		render(<OrderTracking order={{ ...baseOrder, status: 'paid', total_discount: 0 }} />);

		expect(screen.queryByText('orderTracking.discount')).not.toBeInTheDocument();
	});

	it('shows free shipping label when fee is 0', () => {
		render(<OrderTracking order={{ ...baseOrder, status: 'paid', shipping_fee: 0 }} />);

		expect(screen.getByText('orderTracking.free')).toBeInTheDocument();
	});

	it('shows shipping fee when present', () => {
		const order = { ...baseOrder, status: 'paid', shipping_fee: 800, tax_amount: 500 };
		render(<OrderTracking order={order} />);

		expect(screen.getByText('JPY 800')).toBeInTheDocument();
	});

	// Status badge tests
	it('shows pending badge for pending order', () => {
		render(<OrderTracking order={{ ...baseOrder, status: 'pending' }} />);

		const badge = screen.getByTestId('badge');
		expect(badge).toHaveTextContent('orderTracking.pending');
		expect(badge).toHaveAttribute('data-color', 'yellow');
	});

	it('shows paid badge for paid order', () => {
		render(<OrderTracking order={{ ...baseOrder, status: 'paid', paid_at: '2026-01-15T11:00:00Z' }} />);

		const badge = screen.getByTestId('badge');
		expect(badge).toHaveTextContent('orderTracking.paid');
		expect(badge).toHaveAttribute('data-color', 'green');
	});

	it('shows refunded badge for refunded order', () => {
		render(<OrderTracking order={{ ...baseOrder, status: 'refunded' }} />);

		const badge = screen.getByTestId('badge');
		expect(badge).toHaveTextContent('orderTracking.refunded');
		expect(badge).toHaveAttribute('data-color', 'red');
	});

	// Timeline / steps tests
	it('renders progress steps', () => {
		render(<OrderTracking order={{ ...baseOrder, status: 'pending' }} />);

		const nav = screen.getByRole('navigation', { name: 'Progress' });
		expect(nav).toBeInTheDocument();

		expect(screen.getByText('orderTracking.stepReceived')).toBeInTheDocument();
		expect(screen.getByText('orderTracking.stepPaid')).toBeInTheDocument();
		expect(screen.getByText('orderTracking.stepPreparing')).toBeInTheDocument();
		expect(screen.getByText('orderTracking.stepShipped')).toBeInTheDocument();
	});

	it('shows received as current step for pending order', () => {
		const { container } = render(<OrderTracking order={{ ...baseOrder, status: 'pending' }} />);

		const nav = container.querySelector('nav[aria-label="Progress"]')!;
		const steps = nav.querySelectorAll('li');
		expect(steps).toHaveLength(4);

		// First step (received) should be current - has a circle with border-2 border-brand
			const firstStep = steps.item(0);
			expect(firstStep).toBeTruthy();
			if (!firstStep) throw new Error('Missing first progress step');
			const firstStepDivs = firstStep.querySelectorAll('div');
		const currentCircle = Array.from(firstStepDivs).find((d) =>
			d.className.includes('border-brand')
		);
		expect(currentCircle).toBeDefined();

		// No completed checkmark svg in first step
			expect(firstStep.querySelector('svg')).toBeNull();
	});

	it('shows paid as current step for paid order', () => {
		const { container } = render(
			<OrderTracking order={{ ...baseOrder, status: 'paid', paid_at: '2026-01-15T11:00:00Z' }} />
		);

		const nav = container.querySelector('nav[aria-label="Progress"]')!;
		const steps = nav.querySelectorAll('li');

		// First step (received) should be completed - has bg-brand with checkmark svg
			const firstStep = steps.item(0);
			expect(firstStep).toBeTruthy();
			if (!firstStep) throw new Error('Missing first progress step');
			const firstStepDivs = firstStep.querySelectorAll('div');
		const completedCircle = Array.from(firstStepDivs).find((d) =>
			d.className.includes('bg-brand')
		);
		expect(completedCircle).toBeDefined();
			expect(firstStep.querySelector('svg')).not.toBeNull();

		// Second step (paid) should be current - has border-brand
			const secondStep = steps.item(1);
			expect(secondStep).toBeTruthy();
			if (!secondStep) throw new Error('Missing second progress step');
			const secondStepDivs = secondStep.querySelectorAll('div');
		const currentCircle = Array.from(secondStepDivs).find((d) =>
			d.className.includes('border-brand')
		);
		expect(currentCircle).toBeDefined();
	});

	it('shows preparing as current step when fulfillment is pending', () => {
		const order = {
			...baseOrder,
			status: 'paid',
			paid_at: '2026-01-15T11:00:00Z',
			fulfillments: [
				{
					id: 1,
					status: 'pending',
					tracking_number: null,
					carrier: null,
					created_at: '2026-01-16T09:00:00Z',
					updated_at: '2026-01-16T09:00:00Z',
				},
			],
		};

		const { container } = render(<OrderTracking order={order} />);

		const nav = container.querySelector('nav[aria-label="Progress"]')!;
		const steps = nav.querySelectorAll('li');

		// Third step (preparing) should be current
			const thirdStep = steps.item(2);
			expect(thirdStep).toBeTruthy();
			if (!thirdStep) throw new Error('Missing third progress step');
			const thirdStepDivs = thirdStep.querySelectorAll('div');
		const currentCircle = Array.from(thirdStepDivs).find((d) =>
			d.className.includes('border-brand')
		);
		expect(currentCircle).toBeDefined();
	});

	it('shows shipped as current step when fulfillment is shipped', () => {
		const order = {
			...baseOrder,
			status: 'paid',
			paid_at: '2026-01-15T11:00:00Z',
			fulfillments: [
				{
					id: 1,
					status: 'shipped',
					tracking_number: '1234567890',
					carrier: 'ヤマト運輸',
					created_at: '2026-01-16T09:00:00Z',
					updated_at: '2026-01-17T10:00:00Z',
				},
			],
		};

		const { container } = render(<OrderTracking order={order} />);

		const nav = container.querySelector('nav[aria-label="Progress"]')!;
		const steps = nav.querySelectorAll('li');

		// Fourth step (shipped) should be current
			const fourthStep = steps.item(3);
			expect(fourthStep).toBeTruthy();
			if (!fourthStep) throw new Error('Missing fourth progress step');
			const fourthStepDivs = fourthStep.querySelectorAll('div');
		const currentCircle = Array.from(fourthStepDivs).find((d) =>
			d.className.includes('border-brand')
		);
		expect(currentCircle).toBeDefined();
	});

	// Fulfillment info tests
	it('shows tracking info for shipped fulfillment', () => {
		const order = {
			...baseOrder,
			status: 'paid',
			paid_at: '2026-01-15T11:00:00Z',
			fulfillments: [
				{
					id: 1,
					status: 'shipped',
					tracking_number: '1234567890',
					carrier: 'ヤマト運輸',
					created_at: '2026-01-16T09:00:00Z',
					updated_at: '2026-01-17T10:00:00Z',
				},
			],
		};

		render(<OrderTracking order={order} />);

		expect(screen.getByText('orderTracking.carrier')).toBeInTheDocument();
		expect(screen.getByText('ヤマト運輸')).toBeInTheDocument();
		expect(screen.getByText('orderTracking.trackingNumber')).toBeInTheDocument();
		expect(screen.getByText('1234567890')).toBeInTheDocument();
	});

	it('renders tracking link for ヤマト運輸', () => {
		const order = {
			...baseOrder,
			status: 'paid',
			paid_at: '2026-01-15T11:00:00Z',
			fulfillments: [
				{
					id: 1,
					status: 'shipped',
					tracking_number: 'ABC123',
					carrier: 'ヤマト運輸',
					created_at: '2026-01-16T09:00:00Z',
					updated_at: '2026-01-17T10:00:00Z',
				},
			],
		};

		render(<OrderTracking order={order} />);

		const trackLink = screen.getByText('orderTracking.trackTracking');
		expect(trackLink.closest('a')).toHaveAttribute(
			'href',
			expect.stringContaining('kuronekoyamato.co.jp')
		);
	});

	it('does not show fulfillment info when not shipped', () => {
		render(<OrderTracking order={{ ...baseOrder, status: 'pending' }} />);

		expect(screen.queryByText('orderTracking.carrier')).not.toBeInTheDocument();
		expect(screen.queryByText('orderTracking.trackingNumber')).not.toBeInTheDocument();
	});

	// Shipping address tests
	it('shows shipping address when present', () => {
		const order = {
			...baseOrder,
			status: 'paid',
			paid_at: '2026-01-15T11:00:00Z',
			shipping: {
				name: 'Taro Yamada',
				phone: '090-1234-5678',
				address: {
					postal_code: '100-0001',
					state: '東京都',
					city: '千代田区',
					line1: '1-1-1',
					line2: 'ビル2F',
				},
			},
		};

		render(<OrderTracking order={order} />);

		expect(screen.getByText('orderTracking.shippingAddress')).toBeInTheDocument();
		expect(screen.getByText('Taro Yamada')).toBeInTheDocument();
		expect(screen.getByText('東京都千代田区')).toBeInTheDocument();
		expect(screen.getByText('1-1-1')).toBeInTheDocument();
		expect(screen.getByText('ビル2F')).toBeInTheDocument();
	});

	it('shows customer email', () => {
		render(<OrderTracking order={{ ...baseOrder, status: 'paid', customer_email: 'customer@example.com' }} />);

		expect(screen.getByText('orderTracking.email')).toBeInTheDocument();
		expect(screen.getByText('customer@example.com')).toBeInTheDocument();
	});

	it('hides shipping/contact section when neither exists', () => {
		const order = { ...baseOrder, status: 'paid', shipping: null, customer_email: null };
		render(<OrderTracking order={order} />);

		expect(screen.queryByText('orderTracking.shippingAddress')).not.toBeInTheDocument();
		expect(screen.queryByText('orderTracking.email')).not.toBeInTheDocument();
	});
});

describe('OrderTracking edge cases', () => {
	it('handles order with no tracking number in shipped fulfillment', () => {
		const order = {
			...baseOrder,
			status: 'paid',
			paid_at: '2026-01-15T11:00:00Z',
			fulfillments: [
				{
					id: 1,
					status: 'shipped',
					tracking_number: null,
					carrier: 'ヤマト運輸',
					created_at: '2026-01-16T09:00:00Z',
					updated_at: '2026-01-17T10:00:00Z',
				},
			],
		};

		render(<OrderTracking order={order} />);

		// Carrier should still appear
		expect(screen.getByText('ヤマト運輸')).toBeInTheDocument();
		// Tracking number row should not appear
		expect(screen.queryByText('orderTracking.trackingNumber')).not.toBeInTheDocument();
		// Track link should not appear without tracking number
		expect(screen.queryByText('orderTracking.trackTracking')).not.toBeInTheDocument();
	});

	it('handles order with no carrier in shipped fulfillment', () => {
		const order = {
			...baseOrder,
			status: 'paid',
			paid_at: '2026-01-15T11:00:00Z',
			fulfillments: [
				{
					id: 1,
					status: 'shipped',
					tracking_number: '1234567890',
					carrier: null,
					created_at: '2026-01-16T09:00:00Z',
					updated_at: '2026-01-17T10:00:00Z',
				},
			],
		};

		render(<OrderTracking order={order} />);

		// Tracking number should appear
		expect(screen.getByText('1234567890')).toBeInTheDocument();
		// Carrier row should not appear
		expect(screen.queryByText('orderTracking.carrier')).not.toBeInTheDocument();
		// Track link should not appear without carrier URL mapping
		expect(screen.queryByText('orderTracking.trackTracking')).not.toBeInTheDocument();
	});

	it('renders tracking link for 佐川急便', () => {
		const order = {
			...baseOrder,
			status: 'paid',
			paid_at: '2026-01-15T11:00:00Z',
			fulfillments: [
				{
					id: 1,
					status: 'shipped',
					tracking_number: 'SGW123',
					carrier: '佐川急便',
					created_at: '2026-01-16T09:00:00Z',
					updated_at: '2026-01-17T10:00:00Z',
				},
			],
		};

		render(<OrderTracking order={order} />);

		const trackLink = screen.getByText('orderTracking.trackTracking');
		expect(trackLink.closest('a')).toHaveAttribute(
			'href',
			expect.stringContaining('sagawa-exp.co.jp')
		);
	});

	it('renders tracking link for 日本郵便', () => {
		const order = {
			...baseOrder,
			status: 'paid',
			paid_at: '2026-01-15T11:00:00Z',
			fulfillments: [
				{
					id: 1,
					status: 'shipped',
					tracking_number: 'JP123',
					carrier: '日本郵便',
					created_at: '2026-01-16T09:00:00Z',
					updated_at: '2026-01-17T10:00:00Z',
				},
			],
		};

		render(<OrderTracking order={order} />);

		const trackLink = screen.getByText('orderTracking.trackTracking');
		expect(trackLink.closest('a')).toHaveAttribute(
			'href',
			expect.stringContaining('japanpost.jp')
		);
	});

	it('does not render tracking link for unknown carrier', () => {
		const order = {
			...baseOrder,
			status: 'paid',
			paid_at: '2026-01-15T11:00:00Z',
			fulfillments: [
				{
					id: 1,
					status: 'shipped',
					tracking_number: 'UNK123',
					carrier: 'Unknown Carrier',
					created_at: '2026-01-16T09:00:00Z',
					updated_at: '2026-01-17T10:00:00Z',
				},
			],
		};

		render(<OrderTracking order={order} />);

		expect(screen.getByText('Unknown Carrier')).toBeInTheDocument();
		expect(screen.getByText('UNK123')).toBeInTheDocument();
		expect(screen.queryByText('orderTracking.trackTracking')).not.toBeInTheDocument();
	});

	it('handles order with empty items array', () => {
		const order = {
			...baseOrder,
			status: 'paid',
			items: [],
		};

		render(<OrderTracking order={order} />);

		expect(screen.getByText('orderTracking.items')).toBeInTheDocument();
		expect(screen.getByText('orderTracking.title')).toBeInTheDocument();
	});

	it('handles fulfilled order status', () => {
		render(<OrderTracking order={{ ...baseOrder, status: 'fulfilled' }} />);

		const badge = screen.getByTestId('badge');
		expect(badge).toHaveTextContent('orderTracking.fulfilled');
		expect(badge).toHaveAttribute('data-color', 'blue');
	});

	it('handles unknown order status as pending', () => {
		render(<OrderTracking order={{ ...baseOrder, status: 'unknown_status' }} />);

		const badge = screen.getByTestId('badge');
		expect(badge).toHaveTextContent('orderTracking.pending');
		expect(badge).toHaveAttribute('data-color', 'yellow');
	});

	it('shows shipping address without line2', () => {
		const order = {
			...baseOrder,
			status: 'paid',
			paid_at: '2026-01-15T11:00:00Z',
			shipping: {
				name: 'Hanako Tanaka',
				phone: '03-1234-5678',
				address: {
					postal_code: '150-0001',
					state: '東京都',
					city: '渋谷区',
					line1: '2-2-2',
				},
			},
		};

		render(<OrderTracking order={order} />);

		expect(screen.getByText('Hanako Tanaka')).toBeInTheDocument();
		expect(screen.getByText('東京都渋谷区')).toBeInTheDocument();
		expect(screen.getByText('2-2-2')).toBeInTheDocument();
	});

	it('shows shipping with phone number', () => {
		const order = {
			...baseOrder,
			status: 'paid',
			paid_at: '2026-01-15T11:00:00Z',
			shipping: {
				name: 'Taro Test',
				phone: '090-0000-0000',
				address: {
					postal_code: '100-0001',
					state: '東京都',
					city: '千代田区',
					line1: '1-1-1',
				},
			},
		};

		render(<OrderTracking order={order} />);

		expect(screen.getByText('090-0000-0000')).toBeInTheDocument();
	});
});

describe('OrderTracking accessibility', () => {
	it('has progress navigation with aria-label', () => {
		render(<OrderTracking order={{ ...baseOrder, status: 'pending' }} />);

		const nav = screen.getByRole('navigation', { name: 'Progress' });
		expect(nav).toBeInTheDocument();
	});

	it('has ordered list within progress navigation', () => {
		const { container } = render(<OrderTracking order={{ ...baseOrder, status: 'pending' }} />);

		const nav = container.querySelector('nav[aria-label="Progress"]');
		expect(nav).toBeInTheDocument();
		const ol = nav?.querySelector('ol');
		expect(ol).toBeInTheDocument();
	});

	it('has proper heading hierarchy', () => {
		render(<OrderTracking order={{ ...baseOrder, status: 'paid', paid_at: '2026-01-15T11:00:00Z' }} />);

		// h1 for title
		const h1 = screen.getByText('orderTracking.title');
		expect(h1.tagName).toBe('H1');

		// h2 for items section
		const h2Items = screen.getByText('orderTracking.items');
		expect(h2Items.tagName).toBe('H2');

		// h2 for price breakdown
		const h2Price = screen.getByText('orderTracking.priceBreakdown');
		expect(h2Price.tagName).toBe('H2');
	});

	it('tracking link opens in new tab with security attributes', () => {
		const order = {
			...baseOrder,
			status: 'paid',
			paid_at: '2026-01-15T11:00:00Z',
			fulfillments: [
				{
					id: 1,
					status: 'shipped',
					tracking_number: 'ABC123',
					carrier: 'ヤマト運輸',
					created_at: '2026-01-16T09:00:00Z',
					updated_at: '2026-01-17T10:00:00Z',
				},
			],
		};

		render(<OrderTracking order={order} />);

		const trackLink = screen.getByText('orderTracking.trackTracking').closest('a');
		expect(trackLink).toHaveAttribute('target', '_blank');
		expect(trackLink).toHaveAttribute('rel', 'noopener noreferrer');
	});
});
