import { createProxyHandler } from '../../../lib/apiProxy'

export const prerender = false

const handler = createProxyHandler('/admin')

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler
