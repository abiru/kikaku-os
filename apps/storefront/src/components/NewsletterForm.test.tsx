import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../lib/api', () => ({
  getApiBase: () => 'http://localhost:8787',
  buildStoreUrl: (path: string, base: string) => `${base}/store${path}`,
}))

vi.mock('./catalyst/button', () => ({
  Button: ({ children, href, outline, plain, color, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: string; outline?: boolean; plain?: boolean; color?: string }) => {
    if (href) return <a href={href}>{children}</a>
    return <button {...props}>{children}</button>
  },
}))

vi.mock('./catalyst/input', () => ({
  Input: ({ invalid, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) =>
    <input data-invalid={invalid || undefined} {...props} />,
}))

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

import NewsletterForm from './NewsletterForm'

describe('NewsletterForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders email input and submit button', () => {
    render(<NewsletterForm />)
    expect(screen.getByPlaceholderText('newsletter.placeholder')).toBeDefined()
    expect(screen.getByText('newsletter.subscribe')).toBeDefined()
  })

  it('shows validation error for invalid email', async () => {
    render(<NewsletterForm />)
    const input = screen.getByPlaceholderText('newsletter.placeholder')
    const form = input.closest('form')!

    fireEvent.change(input, { target: { value: 'not-an-email' } })
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('newsletter.invalidEmail')).toBeDefined()
    })
  })

  it('shows validation error for empty email', async () => {
    render(<NewsletterForm />)
    const input = screen.getByPlaceholderText('newsletter.placeholder')
    const form = input.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('newsletter.invalidEmail')).toBeDefined()
    })
  })

  it('submits valid email and shows success', async () => {
    // First call: CSRF token fetch, second call: subscribe
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'csrf-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      })

    render(<NewsletterForm />)
    const input = screen.getByPlaceholderText('newsletter.placeholder')
    const form = input.closest('form')!

    fireEvent.change(input, { target: { value: 'test@example.com' } })
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('newsletter.success')).toBeDefined()
    })
  })

  it('shows error message on API failure', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'csrf-token' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ ok: false, message: 'Server error' }),
      })

    render(<NewsletterForm />)
    const input = screen.getByPlaceholderText('newsletter.placeholder')
    const form = input.closest('form')!

    fireEvent.change(input, { target: { value: 'test@example.com' } })
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeDefined()
    })
  })

  it('shows error message on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    render(<NewsletterForm />)
    const input = screen.getByPlaceholderText('newsletter.placeholder')
    const form = input.closest('form')!

    fireEvent.change(input, { target: { value: 'test@example.com' } })
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeDefined()
    })
  })

  it('disables input and button while submitting', async () => {
    let resolvePromise: (value: unknown) => void
    mockFetch.mockReturnValueOnce(new Promise((resolve) => { resolvePromise = resolve }))

    render(<NewsletterForm />)
    const input = screen.getByPlaceholderText('newsletter.placeholder')
    const form = input.closest('form')!

    fireEvent.change(input, { target: { value: 'test@example.com' } })
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('newsletter.subscribing')).toBeDefined()
    })

    resolvePromise!({
      ok: true,
      json: async () => ({ token: 'csrf-token' }),
    })
  })

  it('clears error message on input change', async () => {
    render(<NewsletterForm />)
    const input = screen.getByPlaceholderText('newsletter.placeholder')
    const form = input.closest('form')!

    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText('newsletter.invalidEmail')).toBeDefined()
    })

    fireEvent.change(input, { target: { value: 'a' } })
    expect(screen.queryByText('newsletter.invalidEmail')).toBeNull()
  })
})
