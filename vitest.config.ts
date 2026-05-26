import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEV__: 'true',
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/testing/**',
        'src/index.ts',
      ],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
        'src/pipeline/sanitizer.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
        'src/pipeline/redactor.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
        'src/pipeline/url-scrubber.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
        'src/pipeline/control-char-guard.ts': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  },
});
