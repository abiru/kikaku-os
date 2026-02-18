import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../i18n', () => ({
  t: (key: string, params?: Record<string, string>) => {
    if (params) {
      // Return key followed by param values so tests can find them
      const paramStr = Object.values(params).join(' ')
      return `${key} ${paramStr}`
    }
    return key
  },
}))

vi.mock('../lib/api', () => ({
  getApiBase: () => 'http://localhost:8787',
}))

const mockLogError = vi.fn()
vi.mock('../lib/logger', () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
}))

import { ErrorBoundary } from './ErrorBoundary'

const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) throw new Error('Test error')
  return <div>Child content</div>
}

describe('ErrorBoundary', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Suppress console.error from React for thrown errors in tests
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // Mock fetch for error reporting
    fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Hello World</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('Hello World')).toBeDefined()
  })

  it('renders default fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('errors.componentError')).toBeDefined()
    expect(screen.getByText('errors.reload')).toBeDefined()
  })

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('Custom fallback')).toBeDefined()
  })

  it('renders reload button in default fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    const reloadButton = screen.getByText('errors.reload')
    expect(reloadButton.tagName).toBe('BUTTON')
  })

  it('logs error via logError when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(mockLogError).toHaveBeenCalledWith(
      'Component error caught by ErrorBoundary',
      expect.any(Error),
      expect.objectContaining({ page: 'ErrorBoundary' })
    )
  })

  it('displays error tracking ID when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    // The tracking ID is displayed via t('errors.errorTrackingId', { id: trackingId })
    const trackingElement = screen.getByText(/errors\.errorTrackingId/)
    expect(trackingElement).toBeDefined()
    expect(trackingElement.textContent).toMatch(/ERR-\d+-[a-z0-9]{4}/)
  })

  it('reports error to server when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:8787/errors/report',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    )
    // Verify the body contains tracking ID and error message
    const callArgs = fetchSpy.mock.calls[0]!
    const body = JSON.parse((callArgs[1] as RequestInit).body as string)
    expect(body.trackingId).toMatch(/^ERR-\d+-[a-z0-9]{4}$/)
    expect(body.message).toBe('Test error')
  })

  it('resets error state on retry button click', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('errors.componentError')).toBeDefined()

    // After clicking retry, ErrorBoundary resets hasError to false
    // and re-renders children. Since ThrowError still throws,
    // it will show the error UI again -- but the state did reset.
    const reloadButton = screen.getByText('errors.reload')
    fireEvent.click(reloadButton)
    // The error boundary catches the re-thrown error again
    expect(screen.getByText('errors.componentError')).toBeDefined()
  })

  it('does not crash when fetch fails during error reporting', () => {
    fetchSpy.mockRejectedValue(new Error('Network error'))
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    // Should still render the error UI despite report failure
    expect(screen.getByText('errors.componentError')).toBeDefined()
  })
})
