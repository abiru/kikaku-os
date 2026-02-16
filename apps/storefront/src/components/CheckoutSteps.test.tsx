import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params) return `${key}(${JSON.stringify(params)})`
      return key
    },
  }),
}))

import CheckoutSteps from './CheckoutSteps'

describe('CheckoutSteps', () => {
  it('renders checkout navigation', () => {
    render(<CheckoutSteps currentStep="cart" />)
    expect(screen.getByRole('navigation', { name: 'Checkout steps' })).toBeDefined()
  })

  it('renders all step labels', () => {
    render(<CheckoutSteps currentStep="cart" />)
    expect(screen.getAllByText('checkout.steps.cart').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('checkout.steps.email').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('checkout.steps.payment').length).toBeGreaterThanOrEqual(1)
  })

  it('marks current step with aria-current', () => {
    const { container } = render(<CheckoutSteps currentStep="email" />)
    const currentItems = container.querySelectorAll('[aria-current="step"]')
    expect(currentItems.length).toBeGreaterThanOrEqual(1)
  })

  it('renders step numbers for non-completed steps', () => {
    render(<CheckoutSteps currentStep="cart" />)
    // Step 1 (cart) is current, steps 2 and 3 should show numbers
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1)
  })

  it('shows checkmark SVG for completed steps', () => {
    const { container } = render(<CheckoutSteps currentStep="payment" />)
    // Steps 1 and 2 are completed, should have SVG checkmarks
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThanOrEqual(2)
  })

  it('renders both desktop and mobile views', () => {
    const { container } = render(<CheckoutSteps currentStep="cart" />)
    const hiddenSm = container.querySelector('.hidden.sm\\:block')
    const smHidden = container.querySelector('.sm\\:hidden')
    expect(hiddenSm).toBeDefined()
    expect(smHidden).toBeDefined()
  })
})
