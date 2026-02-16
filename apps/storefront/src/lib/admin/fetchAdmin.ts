import { getApiBase } from '../api'
import { logError } from '../logger'

type AdminFetchResult<T> = {
  data: T | null
  error: string | null
}

const getAdminHeaders = (): HeadersInit => ({
  'x-admin-key': import.meta.env.ADMIN_API_KEY || '',
})

const buildAdminUrl = (path: string, query?: URLSearchParams): string => {
  const base = getApiBase()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const qs = query ? `?${query}` : ''
  return `${base}${normalizedPath}${qs}`
}

export async function adminFetch<T>(
  path: string,
  options: RequestInit & { query?: URLSearchParams } = {}
): Promise<AdminFetchResult<T>> {
  if (!import.meta.env.ADMIN_API_KEY) {
    return { data: null, error: 'ADMIN_API_KEY is not configured' }
  }

  const { query, ...fetchOptions } = options

  try {
    const url = buildAdminUrl(path, query)
    const res = await fetch(url, {
      ...fetchOptions,
      headers: {
        ...getAdminHeaders(),
        ...fetchOptions.headers,
      },
    })

    if (!res.ok) {
      throw new Error(`API Error: ${res.status}`)
    }

    const data = (await res.json()) as T
    return { data, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    logError('Admin fetch failed', e, { page: 'lib/admin/fetchAdmin', action: path })
    return { data: null, error: message }
  }
}

export async function adminFetchList<T>(
  path: string,
  query?: URLSearchParams
): Promise<AdminFetchResult<T>> {
  return adminFetch<T>(path, { query })
}

export async function adminFetchOne<T>(
  path: string
): Promise<AdminFetchResult<T>> {
  return adminFetch<T>(path)
}

export async function adminPost<T>(
  path: string,
  body: unknown
): Promise<AdminFetchResult<T>> {
  return adminFetch<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function adminPut<T>(
  path: string,
  body: unknown
): Promise<AdminFetchResult<T>> {
  return adminFetch<T>(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function adminDelete<T>(
  path: string
): Promise<AdminFetchResult<T>> {
  return adminFetch<T>(path, { method: 'DELETE' })
}
