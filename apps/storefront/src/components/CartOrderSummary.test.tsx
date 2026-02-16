import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params) return `${key}(${JSON.stringify(params)})`
      return key
    },
  }),
}))

vi.mock('../lib/format', () => ({
  formatPrice: (amount: number, currency: string) => `${currency} ${amount}`,
}))

const { mockShippingConfigGet } = vi.hoisted(() => ({
  mockShippingConfigGet: vi.fn(() => ({ freeShippingThreshold: 10000 })),
}))

vi.mock('../lib/cart', () => ({
  $appliedCoupon: { subscribe: vi.fn(), get: vi.fn(() => null) },
  $cartTotal: { subscribe: vi.fn(), get: vi.fn(() => 5000) },
  $shippingConfig: { subscribe: vi.fn(), get: mockShippingConfigGet },
  applyCoupon: vi.fn(),
  removeCoupon: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  getApiBase: () => 'http://localhost:8787',
  fetchJson: vi.fn(),
}))

vi.mock('@nanostores/react', () => ({
  useStore: (store: { get: () => unknown }) => store.get(),
}))

import { CartOrderSummary } from './CartOrderSummary'

const defaultProps = {
  subtotal: 5000,
  taxAmount: 500,
  cartTotal: 5500,
  discount: 0,
  shipping: 800,
  grandTotal: 6300,
  currency: 'JPY',
  onCheckout: vi.fn(),
}

describe('CartOrderSummary', () => {
  it('renders order summary heading', () => {
    render(<CartOrderSummary {...defaultProps} />)
    expect(screen.getByText('cart.orderSummary')).toBeDefined()
  })

  it('displays subtotal, tax, shipping, and total', () => {
    render(<CartOrderSummary {...defaultProps} />)
    expect(screen.getByText('cart.subtotal')).toBeDefined()
    expect(screen.getByText('JPY 5000')).toBeDefined()
    expect(screen.getByText('cart.tax')).toBeDefined()
    expect(screen.getByText('JPY 500')).toBeDefined()
    expect(screen.getByText('JPY 800')).toBeDefined()
    expect(screen.getByText('JPY 6300')).toBeDefined()
  })

  it('shows FREE for zero shipping', () => {
    render(<CartOrderSummary {...defaultProps} shipping={0} />)
    expect(screen.getByText('COMMON.FREE')).toBeDefined()
  })

  it('shows discount when discount > 0', () => {
    render(<CartOrderSummary {...defaultProps} discount={1000} />)
    expect(screen.getByText('cart.discount')).toBeDefined()
    expect(screen.getByText('-JPY 1000')).toBeDefined()
  })

  it('does not show discount section when discount is 0', () => {
    render(<CartOrderSummary {...defaultProps} discount={0} />)
    expect(screen.queryByText('cart.discount')).toBeNull()
  })

  it('shows free shipping threshold message when below threshold', () => {
    render(<CartOrderSummary {...defaultProps} cartTotal={5000} />)
    // freeShippingThreshold is 10000, remaining is 5000
    expect(screen.getByText(/cart\.addForFreeShipping/)).toBeDefined()
  })

  it('does not show free shipping message when above threshold', () => {
    render(<CartOrderSummary {...defaultProps} cartTotal={15000} />)
    expect(screen.queryByText(/cart\.addForFreeShipping/)).toBeNull()
  })

  it('calls onCheckout when checkout button is clicked', () => {
    const onCheckout = vi.fn()
    render(<CartOrderSummary {...defaultProps} onCheckout={onCheckout} />)
    fireEvent.click(screen.getByText('cart.checkout'))
    expect(onCheckout).toHaveBeenCalledTimes(1)
  })

  it('renders quotation link', () => {
    render(<CartOrderSummary {...defaultProps} />)
    const link = screen.getByText('cart.createQuotation')
    expect(link.closest('a')?.getAttribute('href')).toBe('/quotations/new')
  })

  it('renders continue shopping link', () => {
    render(<CartOrderSummary {...defaultProps} />)
    const link = screen.getByText('cart.continueShopping')
    expect(link.closest('a')?.getAttribute('href')).toBe('/products')
  })
})
