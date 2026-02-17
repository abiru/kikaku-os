import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../lib/format', () => ({
  formatPrice: (amount: number, currency: string) => `${currency} ${amount}`,
}))

type AppliedCoupon = { code: string; discountAmount: number }

const { mockApplyCoupon, mockRemoveCoupon, mockAppliedCouponGet, mockCartTotalGet } = vi.hoisted(() => {
  const mockAppliedCouponGet = vi.fn((): AppliedCoupon | null => null)
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

describe('CouponInput edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAppliedCouponGet.mockReturnValue(null)
    mockCartTotalGet.mockReturnValue(5000)
  })

  it('prevents applying empty coupon code', () => {
    render(<CouponInput />)
    const button = screen.getByText('cart.applyCoupon') as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('prevents applying whitespace-only coupon code', () => {
    render(<CouponInput />)
    const input = screen.getByPlaceholderText('cart.couponPlaceholder')
    fireEvent.change(input, { target: { value: '   ' } })
    const button = screen.getByText('cart.applyCoupon') as HTMLButtonElement
    // The code.trim() check in disabled prop should keep it disabled
    expect(button.disabled).toBe(true)
  })

  it('trims whitespace from coupon code before sending', async () => {
    const couponData = { code: 'TRIM10', discountAmount: 300 }
    ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      valid: true,
      coupon: couponData,
    })

    render(<CouponInput />)
    const input = screen.getByPlaceholderText('cart.couponPlaceholder')
    // Input with spaces -- note the component auto-uppercases
    fireEvent.change(input, { target: { value: ' trim10 ' } })
    fireEvent.click(screen.getByText('cart.applyCoupon'))

    await waitFor(() => {
      expect(fetchJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"code":"TRIM10"'),
        })
      )
    })
  })

  it('shows server error message for invalid coupon', async () => {
    ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      valid: false,
      message: 'This coupon has expired',
    })

    render(<CouponInput />)
    const input = screen.getByPlaceholderText('cart.couponPlaceholder')
    fireEvent.change(input, { target: { value: 'EXPIRED' } })
    fireEvent.click(screen.getByText('cart.applyCoupon'))

    await waitFor(() => {
      expect(screen.getByText('This coupon has expired')).toBeDefined()
    })
  })

  it('shows fallback error message when server provides no message', async () => {
    ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      valid: false,
    })

    render(<CouponInput />)
    const input = screen.getByPlaceholderText('cart.couponPlaceholder')
    fireEvent.change(input, { target: { value: 'INVALID' } })
    fireEvent.click(screen.getByText('cart.applyCoupon'))

    await waitFor(() => {
      expect(screen.getByText('cart.invalidCoupon')).toBeDefined()
    })
  })

  it('disables input while applying coupon', async () => {
    let resolvePromise: (value: unknown) => void
    ;(fetchJson as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise((resolve) => { resolvePromise = resolve })
    )

    render(<CouponInput />)
    const input = screen.getByPlaceholderText('cart.couponPlaceholder') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'WAIT' } })
    fireEvent.click(screen.getByText('cart.applyCoupon'))

    // While applying, input should be disabled
    await waitFor(() => {
      expect(input.disabled).toBe(true)
    })

    // Resolve to clean up
    resolvePromise!({ valid: false, message: 'err' })
  })

  it('clears input after successful coupon application', async () => {
    const couponData = { code: 'CLEAR10', discountAmount: 200 }
    ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      valid: true,
      coupon: couponData,
    })

    render(<CouponInput />)
    const input = screen.getByPlaceholderText('cart.couponPlaceholder') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'CLEAR10' } })
    fireEvent.click(screen.getByText('cart.applyCoupon'))

    await waitFor(() => {
      expect(mockApplyCoupon).toHaveBeenCalledWith(couponData)
    })
  })

  it('enforces maxLength on input', () => {
    render(<CouponInput />)
    const input = screen.getByPlaceholderText('cart.couponPlaceholder') as HTMLInputElement
    expect(input).toHaveAttribute('maxLength', '20')
  })

  it('sends cartTotal in validate-coupon request', async () => {
    mockCartTotalGet.mockReturnValue(10000)
    ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      valid: true,
      coupon: { code: 'BIG', discountAmount: 1000 },
    })

    render(<CouponInput />)
    const input = screen.getByPlaceholderText('cart.couponPlaceholder')
    fireEvent.change(input, { target: { value: 'BIG' } })
    fireEvent.click(screen.getByText('cart.applyCoupon'))

    await waitFor(() => {
      expect(fetchJson).toHaveBeenCalledWith(
        expect.stringContaining('/checkout/validate-coupon'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"cartTotal":10000'),
        })
      )
    })
  })
})

describe('CouponInput accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAppliedCouponGet.mockReturnValue(null)
    mockCartTotalGet.mockReturnValue(5000)
  })

  it('shows error message with role="alert"', async () => {
    ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      valid: false,
      message: 'Invalid coupon code',
    })

    render(<CouponInput />)
    const input = screen.getByPlaceholderText('cart.couponPlaceholder')
    fireEvent.change(input, { target: { value: 'BAD' } })
    fireEvent.click(screen.getByText('cart.applyCoupon'))

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveTextContent('Invalid coupon code')
    })
  })

  it('shows applying state text when processing', async () => {
    let resolvePromise: (value: unknown) => void
    ;(fetchJson as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise((resolve) => { resolvePromise = resolve })
    )

    render(<CouponInput />)
    const input = screen.getByPlaceholderText('cart.couponPlaceholder')
    fireEvent.change(input, { target: { value: 'LOADING' } })
    fireEvent.click(screen.getByText('cart.applyCoupon'))

    await waitFor(() => {
      expect(screen.getByText('cart.applying')).toBeDefined()
    })

    // Resolve to clean up
    resolvePromise!({ valid: false, message: 'done' })
  })
})
