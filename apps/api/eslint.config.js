import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'src/**/*.test.ts',
      'src/**/*.integration.test.ts',
      'src/test-utils/**',
    ],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
