import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.{ts,tsx}'],
		setupFiles: ['src/__tests__/setup.ts'],
		testTimeout: 10_000,
		hookTimeout: 10_000,
		retry: 2,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/**/*.ts', 'src/**/*.tsx'],
			exclude: [
				'src/**/*.test.{ts,tsx}',
				'src/__tests__/**',
				'src/env.d.ts',
				'src/components/catalyst/**'
			],
			thresholds: {
				lines: 28,
				statements: 28
			}
		}
	}
});
