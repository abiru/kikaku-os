import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.integration.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  }
});
