import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts'],
		testTimeout: 10_000,
		hookTimeout: 10_000,
		retry: 2,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/**/*.ts'],
			exclude: [
				'src/**/*.test.ts',
				'src/env.d.ts'
			]
		}
	}
});
