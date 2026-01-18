import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCheckoutSession, getApiBase } from './api';

const buildResponse = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});

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

describe('createCheckoutSession', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('throws on 400 responses', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(buildResponse(400, { message: 'Bad request' }))
		);

		await expect(
			createCheckoutSession({ variantId: 123, quantity: 1, email: 'test@example.com' })
		).rejects.toThrow('Bad request');
	});

	it('throws on 500 responses', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(buildResponse(500, { message: 'Server error' }))
		);

		await expect(createCheckoutSession({ variantId: 123, quantity: 1 })).rejects.toThrow(
			'Server error'
		);
	});
});
