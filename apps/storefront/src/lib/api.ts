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

	// Default for SSR build
	return 'http://localhost:8787';
};

export const buildStoreUrl = (path: string, base: string = getApiBase()) => {
	const normalizedBase = base.replace(/\/+$/, '');
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	const storePath = normalizedPath === '/store' || normalizedPath.startsWith('/store/')
		? normalizedPath
		: `/store${normalizedPath}`;

	return `${normalizedBase}${storePath}`;
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
