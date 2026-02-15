import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { vi } from 'vitest';

// Ensure DOM cleanup between tests
afterEach(() => {
	cleanup();
});

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

// Mock window.location
Object.defineProperty(window, 'location', {
	value: {
		href: 'http://localhost:4321',
		origin: 'http://localhost:4321',
		pathname: '/',
		search: '',
		hash: '',
		reload: vi.fn(),
		assign: vi.fn(),
	},
	writable: true,
});
