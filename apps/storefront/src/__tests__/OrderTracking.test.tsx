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

		// First step (received) should be current - has a circle with border-2 border-indigo-600
		const firstStepDivs = steps[0].querySelectorAll('div');
		const currentCircle = Array.from(firstStepDivs).find((d) =>
			d.className.includes('border-indigo-600')
		);
		expect(currentCircle).toBeDefined();

		// No completed checkmark svg in first step
		expect(steps[0].querySelector('svg')).toBeNull();
	});

	it('shows paid as current step for paid order', () => {
		const { container } = render(
			<OrderTracking order={{ ...baseOrder, status: 'paid', paid_at: '2026-01-15T11:00:00Z' }} />
		);

		const nav = container.querySelector('nav[aria-label="Progress"]')!;
		const steps = nav.querySelectorAll('li');

		// First step (received) should be completed - has bg-indigo-600 with checkmark svg
		const firstStepDivs = steps[0].querySelectorAll('div');
		const completedCircle = Array.from(firstStepDivs).find((d) =>
			d.className.includes('bg-indigo-600')
		);
		expect(completedCircle).toBeDefined();
		expect(steps[0].querySelector('svg')).not.toBeNull();

		// Second step (paid) should be current - has border-indigo-600
		const secondStepDivs = steps[1].querySelectorAll('div');
		const currentCircle = Array.from(secondStepDivs).find((d) =>
			d.className.includes('border-indigo-600')
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
		const thirdStepDivs = steps[2].querySelectorAll('div');
		const currentCircle = Array.from(thirdStepDivs).find((d) =>
			d.className.includes('border-indigo-600')
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
		const fourthStepDivs = steps[3].querySelectorAll('div');
		const currentCircle = Array.from(fourthStepDivs).find((d) =>
			d.className.includes('border-indigo-600')
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
