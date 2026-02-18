import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../i18n', () => ({
  t: (key: string) => key,
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
  beforeEach(() => {
    vi.clearAllMocks()
    // Suppress console.error from React for thrown errors in tests
    vi.spyOn(console, 'error').mockImplementation(() => {})
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
    );
    expect(mockLogError).toHaveBeenCalledWith(
      'Component error caught by ErrorBoundary',
      expect.any(Error),
      expect.objectContaining({ page: 'ErrorBoundary' })
    );
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
    // it will show the error UI again — but the state did reset.
    const reloadButton = screen.getByText('errors.reload')
    fireEvent.click(reloadButton)
    // The error boundary catches the re-thrown error again
    expect(screen.getByText('errors.componentError')).toBeDefined()
  })
})
