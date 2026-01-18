type FetchOptions = RequestInit & { parseJson?: boolean };

export const getApiBase = () => {
	const envBase =
		(typeof import.meta !== 'undefined' &&
			typeof import.meta.env !== 'undefined' &&
			import.meta.env.PUBLIC_API_BASE) ||
		(typeof process !== 'undefined' ? process.env?.PUBLIC_API_BASE : undefined);

	if (typeof envBase === 'string' && envBase.trim() !== '') {
		return envBase;
	}

	if (typeof window !== 'undefined' && window.location?.origin) {
		return window.location.origin;
	}

	throw new Error('PUBLIC_API_BASE is not set and window is unavailable');
};

export const fetchJson = async <T = unknown>(url: string, options: FetchOptions = {}) => {
	const { parseJson = true, ...fetchOptions } = options;
	const res = await fetch(url, fetchOptions);
	const text = await res.text();
	let data: unknown = text;

	if (parseJson && text) {
		try {
			data = JSON.parse(text);
		} catch {
			data = text;
		}
	}

	if (!res.ok) {
		const message =
			typeof data === 'object' && data && 'message' in data
				? String((data as { message?: string }).message)
				: res.statusText || 'Request failed';
		const error = new Error(message);
		(error as Error & { status?: number; payload?: unknown }).status = res.status;
		(error as Error & { status?: number; payload?: unknown }).payload = data;
		throw error;
	}

	return data as T;
};

type CheckoutParams = {
	variantId: number;
	quantity: number;
	email?: string;
};

type CheckoutResponse = {
	ok: boolean;
	url?: string;
	message?: string;
};

export const createCheckoutSession = async ({ variantId, quantity, email }: CheckoutParams) => {
	const payload = { variantId, quantity, email };
	const data = await fetchJson<CheckoutResponse>(`${getApiBase()}/checkout/session`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload)
	});

	if (!data.ok || !data.url) {
		throw new Error(data.message || 'Failed to start checkout');
	}

	return data;
};
