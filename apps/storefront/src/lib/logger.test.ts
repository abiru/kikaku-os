import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logError } from './logger';

describe('logError', () => {
	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	it('logs error with Error instance', () => {
		logError('Test failure', new Error('Something broke'), { page: 'test', action: 'run' });

		expect(console.error).toHaveBeenCalled();
	});

	it('logs error with string error', () => {
		logError('Test failure', 'string error');

		expect(console.error).toHaveBeenCalled();
	});

	it('logs error without context', () => {
		logError('Test failure', new Error('no context'));

		expect(console.error).toHaveBeenCalled();
	});

	it('logs error with resourceId in context', () => {
		logError('Test failure', new Error('detail'), {
			page: 'admin/products',
			action: 'update',
			resourceId: '42',
		});

		expect(console.error).toHaveBeenCalled();
	});
});
