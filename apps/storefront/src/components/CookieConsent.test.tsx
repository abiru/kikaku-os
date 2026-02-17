import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('../i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

import CookieConsent from './CookieConsent'

// localStorage is mocked by the setup file; provide a simple in-memory mock
const storageMap = new Map<string, string>()
const mockLocalStorage = {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { storageMap.set(key, value) }),
  removeItem: vi.fn((key: string) => { storageMap.delete(key) }),
  clear: vi.fn(() => { storageMap.clear() }),
  get length() { return storageMap.size },
  key: vi.fn((index: number) => [...storageMap.keys()][index] ?? null),
}

Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true })

describe('CookieConsent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    storageMap.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not show banner immediately', () => {
    render(<CookieConsent />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('shows banner after delay when consent not given', () => {
    render(<CookieConsent />)
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.getByRole('alertdialog')).toBeDefined()
    expect(screen.getByText('cookie.message')).toBeDefined()
  })

  it('does not show banner if consent already accepted', () => {
    storageMap.set('cookie-consent-accepted', 'true')
    render(<CookieConsent />)
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('hides banner and stores consent on accept', () => {
    render(<CookieConsent />)
    act(() => {
      vi.advanceTimersByTime(600)
    })

    const acceptButton = screen.getByText('cookie.accept')
    fireEvent.click(acceptButton)

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('cookie-consent-accepted', 'accepted')
  })

  it('shows learn more link to privacy page', () => {
    render(<CookieConsent />)
    act(() => {
      vi.advanceTimersByTime(600)
    })

    const link = screen.getByText('cookie.learnMore')
    expect(link.getAttribute('href')).toBe('/privacy')
  })
})
