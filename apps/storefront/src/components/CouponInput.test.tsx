import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../lib/format', () => ({
  formatPrice: (amount: number, currency: string) => `${currency} ${amount}`,
}))

const { mockApplyCoupon, mockRemoveCoupon, mockAppliedCouponGet, mockCartTotalGet } = vi.hoisted(() => {
  const mockAppliedCouponGet = vi.fn(() => null)
  const mockCartTotalGet = vi.fn(() => 5000)
  return {
    mockApplyCoupon: vi.fn(),
    mockRemoveCoupon: vi.fn(),
    mockAppliedCouponGet,
    mockCartTotalGet,
  }
})

vi.mock('../lib/cart', () => ({
  $appliedCoupon: { subscribe: vi.fn(), get: mockAppliedCouponGet },
  $cartTotal: { subscribe: vi.fn(), get: mockCartTotalGet },
  applyCoupon: mockApplyCoupon,
  removeCoupon: mockRemoveCoupon,
}))

vi.mock('../lib/api', () => ({
  getApiBase: () => 'http://localhost:8787',
  fetchJson: vi.fn(),
}))

vi.mock('@nanostores/react', () => ({
  useStore: (store: { get: () => unknown }) => store.get(),
}))

import { fetchJson } from '../lib/api'
import { CouponInput } from './CouponInput'

describe('CouponInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAppliedCouponGet.mockReturnValue(null)
    mockCartTotalGet.mockReturnValue(5000)
  })

  it('renders input and apply button when no coupon applied', () => {
    render(<CouponInput />)
    expect(screen.getByPlaceholderText('cart.couponPlaceholder')).toBeDefined()
    expect(screen.getByText('cart.applyCoupon')).toBeDefined()
  })

  it('disables apply button when input is empty', () => {
    render(<CouponInput />)
    const button = screen.getByText('cart.applyCoupon') as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('enables apply button when code is entered', () => {
    render(<CouponInput />)
    const input = screen.getByPlaceholderText('cart.couponPlaceholder')
    fireEvent.change(input, { target: { value: 'SAVE10' } })
    const button = screen.getByText('cart.applyCoupon') as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })

  it('converts input to uppercase', () => {
    render(<CouponInput />)
    const input = screen.getByPlaceholderText('cart.couponPlaceholder') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'save10' } })
    expect(input.value).toBe('SAVE10')
  })

  it('applies valid coupon successfully', async () => {
    const couponData = { code: 'SAVE10', discountAmount: 500 }
    ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      valid: true,
      coupon: couponData,
    })

    render(<CouponInput />)
    const input = screen.getByPlaceholderText('cart.couponPlaceholder')
    fireEvent.change(input, { target: { value: 'SAVE10' } })
    fireEvent.click(screen.getByText('cart.applyCoupon'))

    await waitFor(() => {
      expect(mockApplyCoupon).toHaveBeenCalledWith(couponData)
    })
  })

  it('shows error for invalid coupon', async () => {
    ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      valid: false,
      message: 'Coupon expired',
    })

    render(<CouponInput />)
    const input = screen.getByPlaceholderText('cart.couponPlaceholder')
    fireEvent.change(input, { target: { value: 'EXPIRED' } })
    fireEvent.click(screen.getByText('cart.applyCoupon'))

    await waitFor(() => {
      expect(screen.getByText('Coupon expired')).toBeDefined()
    })
  })

  it('shows error on network failure', async () => {
    ;(fetchJson as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'))

    render(<CouponInput />)
    const input = screen.getByPlaceholderText('cart.couponPlaceholder')
    fireEvent.change(input, { target: { value: 'TEST' } })
    fireEvent.click(screen.getByText('cart.applyCoupon'))

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeDefined()
    })
  })

  it('renders applied coupon with remove button', () => {
    mockAppliedCouponGet.mockReturnValue({
      code: 'SAVE10',
      discountAmount: 500,
    })

    render(<CouponInput />)
    expect(screen.getByText('SAVE10')).toBeDefined()
    expect(screen.getByText('-JPY 500')).toBeDefined()
    expect(screen.getByText('cart.removeCoupon')).toBeDefined()
  })

  it('calls removeCoupon when remove button clicked', () => {
    mockAppliedCouponGet.mockReturnValue({
      code: 'SAVE10',
      discountAmount: 500,
    })

    render(<CouponInput />)
    fireEvent.click(screen.getByText('cart.removeCoupon'))
    expect(mockRemoveCoupon).toHaveBeenCalled()
  })
})
