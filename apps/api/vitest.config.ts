import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['src/__tests__/**/*.integration.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    retry: 2,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/__tests__/**',
        'src/test-utils/**'
      ],
      thresholds: {
        lines: 55,
        functions: 60,
        branches: 70,
        statements: 55
      }
    }
  }
});
