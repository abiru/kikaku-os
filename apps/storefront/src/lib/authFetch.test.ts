import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./clerk', () => ({
  getToken: vi.fn(),
}))

vi.mock('./api', () => ({
  getApiBase: vi.fn(() => 'http://localhost:8787'),
  fetchJson: vi.fn(),
}))

import { getToken } from './clerk'
import { getApiBase, fetchJson } from './api'
import { authFetch, adminFetch, adminGet, adminPost, adminPut, adminDelete } from './authFetch'

describe('authFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('authFetch', () => {
    it('sets Authorization header with token', async () => {
      ;(getToken as ReturnType<typeof vi.fn>).mockResolvedValue('test-token-123')
      ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })

      await authFetch('https://api.example.com/data')

      expect(fetchJson).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          headers: expect.any(Headers),
        })
      )

      const callArgs = (fetchJson as ReturnType<typeof vi.fn>).mock.calls[0]!
      const headers = callArgs[1].headers as Headers
      expect(headers.get('Authorization')).toBe('Bearer test-token-123')
    })

    it('does not set Authorization header when token is null', async () => {
      ;(getToken as ReturnType<typeof vi.fn>).mockResolvedValue(null)
      ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })

      await authFetch('https://api.example.com/data')

      const callArgs = (fetchJson as ReturnType<typeof vi.fn>).mock.calls[0]!
      const headers = callArgs[1].headers as Headers
      expect(headers.get('Authorization')).toBeNull()
    })

    it('passes through additional options', async () => {
      ;(getToken as ReturnType<typeof vi.fn>).mockResolvedValue('token')
      ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })

      await authFetch('https://api.example.com/data', { method: 'POST', body: '{}' })

      const callArgs = (fetchJson as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect(callArgs[1].method).toBe('POST')
      expect(callArgs[1].body).toBe('{}')
    })

    it('returns the result from fetchJson', async () => {
      ;(getToken as ReturnType<typeof vi.fn>).mockResolvedValue('token')
      const expectedData = { id: 1, name: 'test' }
      ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValue(expectedData)

      const result = await authFetch('https://api.example.com/data')
      expect(result).toEqual(expectedData)
    })
  })

  describe('adminFetch', () => {
    it('builds URL from API base and path', async () => {
      ;(getToken as ReturnType<typeof vi.fn>).mockResolvedValue('token')
      ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })

      await adminFetch('/admin/products')

      expect(fetchJson).toHaveBeenCalledWith(
        'http://localhost:8787/admin/products',
        expect.any(Object)
      )
    })

    it('normalizes path without leading slash', async () => {
      ;(getToken as ReturnType<typeof vi.fn>).mockResolvedValue('token')
      ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })

      await adminFetch('admin/products')

      expect(fetchJson).toHaveBeenCalledWith(
        'http://localhost:8787/admin/products',
        expect.any(Object)
      )
    })

    it('passes options through to authFetch', async () => {
      ;(getToken as ReturnType<typeof vi.fn>).mockResolvedValue('token')
      ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })

      await adminFetch('/admin/products', { method: 'DELETE' })

      const callArgs = (fetchJson as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect(callArgs[1].method).toBe('DELETE')
    })
  })

  describe('adminGet', () => {
    it('makes a GET request', async () => {
      ;(getToken as ReturnType<typeof vi.fn>).mockResolvedValue('token')
      ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] })

      await adminGet('/admin/orders')

      const callArgs = (fetchJson as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect(callArgs[1].method).toBe('GET')
    })
  })

  describe('adminPost', () => {
    it('makes a POST request with JSON body', async () => {
      ;(getToken as ReturnType<typeof vi.fn>).mockResolvedValue('token')
      ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })

      await adminPost('/admin/products', { title: 'Test' })

      const callArgs = (fetchJson as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect(callArgs[1].method).toBe('POST')
      expect(callArgs[1].body).toBe(JSON.stringify({ title: 'Test' }))
    })
  })

  describe('adminPut', () => {
    it('makes a PUT request with JSON body', async () => {
      ;(getToken as ReturnType<typeof vi.fn>).mockResolvedValue('token')
      ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })

      await adminPut('/admin/products/1', { title: 'Updated' })

      const callArgs = (fetchJson as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect(callArgs[1].method).toBe('PUT')
      expect(callArgs[1].body).toBe(JSON.stringify({ title: 'Updated' }))
    })
  })

  describe('adminDelete', () => {
    it('makes a DELETE request', async () => {
      ;(getToken as ReturnType<typeof vi.fn>).mockResolvedValue('token')
      ;(fetchJson as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })

      await adminDelete('/admin/products/1')

      const callArgs = (fetchJson as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect(callArgs[1].method).toBe('DELETE')
    })
  })
})
