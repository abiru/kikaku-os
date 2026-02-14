import type { APIRoute } from 'astro'

export function createProxyHandler(basePath: string): APIRoute {
  return async ({ request, params }) => {
    const apiKey = import.meta.env.ADMIN_API_KEY || ''
    const apiBase = import.meta.env.PUBLIC_API_BASE || 'http://localhost:8787'
    const path = params.path || ''
    const url = new URL(request.url)
    const queryString = url.search
    const targetUrl = `${apiBase}${basePath}/${path}${queryString}`

    const headers = new Headers()
    headers.set('x-admin-key', apiKey)

    const contentType = request.headers.get('content-type')
    if (contentType) {
      headers.set('content-type', contentType)
    }

    const authHeader = request.headers.get('authorization')
    if (authHeader) {
      headers.set('authorization', authHeader)
    }

    const init: RequestInit = {
      method: request.method,
      headers,
    }

    if (!['GET', 'HEAD'].includes(request.method) && request.body) {
      init.body = request.body
      // @ts-ignore - duplex needed for streaming body
      init.duplex = 'half'
    }

    const response = await fetch(targetUrl, init)

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  }
}
