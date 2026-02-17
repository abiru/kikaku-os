import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/logger', () => ({
	logError: vi.fn(),
}));

import { logError } from './logger';

describe('utils/logger', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('re-exports logError from lib/logger', () => {
		expect(typeof logError).toBe('function');
	});

	it('calls the underlying logError', () => {
		logError('test', new Error('err'));
		expect(logError).toHaveBeenCalledWith('test', expect.any(Error));
	});
});
