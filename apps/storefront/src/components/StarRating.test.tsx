import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}))

import { StarRatingDisplay, StarRatingInput } from './StarRating'

describe('StarRatingDisplay', () => {
  it('renders 5 star SVGs', () => {
    const { container } = render(<StarRatingDisplay rating={3} />)
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBe(5)
  })

  it('shows numeric value when showValue is true', () => {
    render(<StarRatingDisplay rating={4.5} showValue />)
    expect(screen.getByText('4.5')).toBeDefined()
  })

  it('does not show numeric value by default', () => {
    render(<StarRatingDisplay rating={4.5} />)
    expect(screen.queryByText('4.5')).toBeNull()
  })

  it('applies different size classes', () => {
    const { container: smContainer } = render(<StarRatingDisplay rating={3} size="sm" />)
    expect(smContainer.querySelector('.size-4')).toBeDefined()

    const { container: lgContainer } = render(<StarRatingDisplay rating={3} size="lg" />)
    expect(lgContainer.querySelector('.size-6')).toBeDefined()
  })
})

describe('StarRatingInput', () => {
  it('renders 5 clickable star buttons', () => {
    const onChange = vi.fn()
    render(<StarRatingInput value={0} onChange={onChange} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(5)
  })

  it('calls onChange with correct star value when clicked', () => {
    const onChange = vi.fn()
    render(<StarRatingInput value={0} onChange={onChange} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[2]!)
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('has aria-labels for accessibility', () => {
    const onChange = vi.fn()
    render(<StarRatingInput value={0} onChange={onChange} />)
    expect(screen.getByLabelText('1reviews.stars')).toBeDefined()
    expect(screen.getByLabelText('5reviews.stars')).toBeDefined()
  })
})
