/**
 * URL validation and SSRF protection for fetch-url endpoint
 */

export const normalizeHostname = (hostname: string): string =>
	hostname.trim().toLowerCase().replace(/\.$/, '');

export const parseIpv4Literal = (hostname: string): string | null => {
	const host = normalizeHostname(hostname);

	// Dotted decimal form (e.g. 127.0.0.1)
	const dotted = host.split('.');
	if (dotted.length === 4 && dotted.every((part) => /^\d+$/.test(part))) {
		const octets = dotted.map((part) => Number(part));
		if (octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
			return octets.join('.');
		}
	}

	// Single-integer decimal form (e.g. 2130706433 => 127.0.0.1)
	if (/^\d+$/.test(host)) {
		const value = Number(host);
		if (Number.isInteger(value) && value >= 0 && value <= 0xffffffff) {
			const asUint = value >>> 0;
			return [
				(asUint >>> 24) & 255,
				(asUint >>> 16) & 255,
				(asUint >>> 8) & 255,
				asUint & 255,
			].join('.');
		}
	}

	// Single-integer hex form (e.g. 0x7f000001 => 127.0.0.1)
	if (/^0x[0-9a-f]+$/i.test(host)) {
		const value = Number.parseInt(host, 16);
		if (Number.isInteger(value) && value >= 0 && value <= 0xffffffff) {
			const asUint = value >>> 0;
			return [
				(asUint >>> 24) & 255,
				(asUint >>> 16) & 255,
				(asUint >>> 8) & 255,
				asUint & 255,
			].join('.');
		}
	}

	return null;
};

export const isBlockedInternalHost = (hostname: string): boolean => {
	const host = normalizeHostname(hostname);

	if (
		host === 'localhost' ||
		host.endsWith('.localhost') ||
		host === 'metadata.google.internal' ||
		host.endsWith('.local') ||
		host.endsWith('.internal')
	) {
		return true;
	}

	// Block IPv6 literal hosts directly (e.g. [::1], [fe80::1]).
	if (host.includes(':')) {
		return true;
	}

	return false;
};

type UrlValidationResult =
	| { valid: true; parsedUrl: URL }
	| { valid: false; error: string; status: number };

export const validateFetchUrl = (url: string | undefined): UrlValidationResult => {
	if (!url) {
		return { valid: false, error: 'URL is required', status: 400 };
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(url);
	} catch {
		return { valid: false, error: 'Invalid URL format', status: 400 };
	}

	if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
		return { valid: false, error: 'Only HTTP(S) URLs are allowed', status: 400 };
	}

	const hostname = normalizeHostname(parsedUrl.hostname);
	const ipv4 = parseIpv4Literal(hostname);

	if (ipv4) {
		return { valid: false, error: 'Direct IP URLs are not allowed', status: 400 };
	}

	if (isBlockedInternalHost(hostname)) {
		return { valid: false, error: 'Private or internal URLs are not allowed', status: 400 };
	}

	return { valid: true, parsedUrl };
};
