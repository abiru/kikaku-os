import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock crypto.getRandomValues before importing
const mockGetRandomValues = vi.fn((buffer: Uint8Array) => {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = i % 256
  }
  return buffer
})

Object.defineProperty(globalThis, 'crypto', {
  value: { getRandomValues: mockGetRandomValues },
  writable: true,
})

import { getCsrfToken, validateCsrfToken, CSRF_FIELD_NAME } from './csrf'

describe('csrf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('CSRF_FIELD_NAME', () => {
    it('exports the correct field name', () => {
      expect(CSRF_FIELD_NAME).toBe('_csrf')
    })
  })

  describe('getCsrfToken', () => {
    it('returns existing token from cookie without setting new cookie', () => {
      const request = new Request('https://example.com', {
        headers: { cookie: '__csrf_ssr=existing-token-123' },
      })

      const result = getCsrfToken(request)
      expect(result.token).toBe('existing-token-123')
      expect(result.cookieHeader).toBeNull()
    })

    it('generates a new token when no cookie exists', () => {
      const request = new Request('https://example.com', {
        headers: {},
      })

      const result = getCsrfToken(request)
      expect(result.token).toBeTruthy()
      expect(result.token.length).toBeGreaterThan(0)
      expect(result.cookieHeader).toBeTruthy()
      expect(result.cookieHeader).toContain('__csrf_ssr=')
      expect(result.cookieHeader).toContain('HttpOnly')
      expect(result.cookieHeader).toContain('SameSite=Strict')
    })

    it('sets Secure flag for HTTPS requests', () => {
      const request = new Request('https://example.com', {
        headers: {},
      })

      const result = getCsrfToken(request)
      expect(result.cookieHeader).toContain('; Secure')
    })

    it('omits Secure flag for HTTP requests', () => {
      const request = new Request('http://localhost:4321', {
        headers: {},
      })

      const result = getCsrfToken(request)
      expect(result.cookieHeader).not.toContain('; Secure')
    })

    it('generates URL-safe base64 token (no +, /, or =)', () => {
      const request = new Request('https://example.com')
      const result = getCsrfToken(request)
      expect(result.token).not.toMatch(/[+/=]/)
    })

    it('handles empty cookie header', () => {
      const request = new Request('https://example.com', {
        headers: { cookie: '' },
      })

      const result = getCsrfToken(request)
      expect(result.token).toBeTruthy()
      expect(result.cookieHeader).toBeTruthy()
    })

    it('handles multiple cookies, picking the right one', () => {
      const request = new Request('https://example.com', {
        headers: { cookie: 'session=abc; __csrf_ssr=my-token; other=xyz' },
      })

      const result = getCsrfToken(request)
      expect(result.token).toBe('my-token')
      expect(result.cookieHeader).toBeNull()
    })
  })

  describe('validateCsrfToken', () => {
    it('returns true when cookie and form tokens match', () => {
      const request = new Request('https://example.com', {
        headers: { cookie: '__csrf_ssr=valid-token-123' },
      })
      const formData = new FormData()
      formData.set('_csrf', 'valid-token-123')

      expect(validateCsrfToken(request, formData)).toBe(true)
    })

    it('returns false when tokens do not match', () => {
      const request = new Request('https://example.com', {
        headers: { cookie: '__csrf_ssr=token-a' },
      })
      const formData = new FormData()
      formData.set('_csrf', 'token-b')

      expect(validateCsrfToken(request, formData)).toBe(false)
    })

    it('returns false when cookie token is missing', () => {
      const request = new Request('https://example.com', {
        headers: {},
      })
      const formData = new FormData()
      formData.set('_csrf', 'some-token')

      expect(validateCsrfToken(request, formData)).toBe(false)
    })

    it('returns false when form token is missing', () => {
      const request = new Request('https://example.com', {
        headers: { cookie: '__csrf_ssr=some-token' },
      })
      const formData = new FormData()

      expect(validateCsrfToken(request, formData)).toBe(false)
    })

    it('returns false when both tokens are empty', () => {
      const request = new Request('https://example.com', {
        headers: { cookie: '' },
      })
      const formData = new FormData()

      expect(validateCsrfToken(request, formData)).toBe(false)
    })

    it('uses constant-time comparison (same-length different tokens)', () => {
      const request = new Request('https://example.com', {
        headers: { cookie: '__csrf_ssr=aaaa' },
      })
      const formData = new FormData()
      formData.set('_csrf', 'bbbb')

      expect(validateCsrfToken(request, formData)).toBe(false)
    })

    it('rejects tokens of different lengths', () => {
      const request = new Request('https://example.com', {
        headers: { cookie: '__csrf_ssr=short' },
      })
      const formData = new FormData()
      formData.set('_csrf', 'a-much-longer-token')

      expect(validateCsrfToken(request, formData)).toBe(false)
    })
  })
})
