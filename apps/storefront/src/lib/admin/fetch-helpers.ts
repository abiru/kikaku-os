import { logError } from '../logger'

type FetchResult<T> = {
	data: T | null
	error: string | null
}

/**
 * Fetch a single admin resource by ID/slug with standardised
 * error handling, 404 detection, and structured logging.
 *
 * @example
 * const { data, error } = await fetchAdminResource<{ product: Product }>({
 *   apiBase, apiKey, resource: 'products', id,
 * })
 * if (data) product = data.product
 */
export async function fetchAdminResource<T>(options: {
	apiBase: string
	apiKey: string
	resource: string
	id: string
	notFoundMessage?: string
	errorMessage?: string
}): Promise<FetchResult<T>> {
	const { apiBase, apiKey, resource, id, notFoundMessage, errorMessage } = options

	if (!apiKey) {
		return { data: null, error: 'ADMIN_API_KEY is not configured' }
	}

	try {
		const res = await fetch(`${apiBase}/admin/${resource}/${id}`, {
			headers: { 'x-admin-key': apiKey },
		})

		if (!res.ok) {
			if (res.status === 404) {
				return {
					data: null,
					error: notFoundMessage ?? `${resource} not found`,
				}
			}
			const body = await res.json().catch(() => ({})) as Record<string, unknown>
			return {
				data: null,
				error: (body.message as string | undefined)
					?? (body.error as string | undefined)
					?? errorMessage
					?? `API Error: ${res.status}`,
			}
		}

		const data = (await res.json()) as T
		return { data, error: null }
	} catch (e) {
		logError(`Failed to load ${resource}`, e, {
			page: `admin/${resource}/[id]`,
			action: 'fetch',
			resourceId: id,
		})
		return {
			data: null,
			error: errorMessage ?? `Failed to load ${resource}. Please check your connection.`,
		}
	}
}
