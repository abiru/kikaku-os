import { afterEach, describe, expect, it } from 'vitest';
import { getApiBase } from './api';

describe('getApiBase', () => {
	const original = process.env.PUBLIC_API_BASE;

	afterEach(() => {
		if (original === undefined) {
			delete process.env.PUBLIC_API_BASE;
		} else {
			process.env.PUBLIC_API_BASE = original;
		}
	});

	it('prefers PUBLIC_API_BASE env', () => {
		process.env.PUBLIC_API_BASE = 'https://example.com';
		expect(getApiBase()).toBe('https://example.com');
	});
});
