import { logError } from '../logger'

type FormResult<T = unknown> = {
	data: T | null
	success: boolean
	error: string | null
}

/**
 * Handle an admin form POST (typically an update via PUT).
 *
 * `transformFormData` converts the raw FormData into the JSON body sent to the
 * API.  It may also throw an Error to signal a validation failure — the thrown
 * message is returned as `error` without hitting the network.
 *
 * @example
 * const result = await adminFormHandler<{ customer: Customer }>({
 *   request: Astro.request,
 *   apiBase, apiKey, resource: 'customers', id: id!,
 *   transformFormData: (fd) => {
 *     const name = fd.get('name')?.toString().trim() || ''
 *     if (!name) throw new Error('Name is required')
 *     return { name }
 *   },
 * })
 */
export async function adminFormHandler<T = unknown>(options: {
	request: Request
	apiBase: string
	apiKey: string
	resource: string
	id: string
	transformFormData?: (formData: FormData) => Record<string, unknown>
	method?: 'PUT' | 'POST'
	errorMessage?: string
}): Promise<FormResult<T>> {
	const {
		request,
		apiBase,
		apiKey,
		resource,
		id,
		method = 'PUT',
		errorMessage,
	} = options

	if (!apiKey) {
		return { data: null, success: false, error: 'ADMIN_API_KEY is not configured' }
	}

	try {
		const formData = await request.formData()

		let body: Record<string, unknown>
		try {
			body = options.transformFormData
				? options.transformFormData(formData)
				: Object.fromEntries(formData.entries()) as Record<string, unknown>
		} catch (validationError) {
			if (validationError instanceof Error) {
				return { data: null, success: false, error: validationError.message }
			}
			throw validationError
		}

		const res = await fetch(`${apiBase}/admin/${resource}/${id}`, {
			method,
			headers: {
				'Content-Type': 'application/json',
				'x-admin-key': apiKey,
			},
			body: JSON.stringify(body),
		})

		const data = (await res.json()) as Record<string, unknown>

		if (!res.ok) {
			return {
				data: null,
				success: false,
				error: (data.message as string | undefined)
					?? (data.error as string | undefined)
					?? errorMessage
					?? `Failed to update ${resource}`,
			}
		}

		return { data: data as T, success: true, error: null }
	} catch (e) {
		logError(`Failed to update ${resource}`, e, {
			page: `admin/${resource}/[id]`,
			action: 'update',
			resourceId: id,
		})
		return {
			data: null,
			success: false,
			error: errorMessage ?? `Failed to update ${resource}. Please check your connection.`,
		}
	}
}
