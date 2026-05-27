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
        // Pure type-only module — v8 reports 0% for files with no
        // runtime code, which would falsely drag the aggregate.
        'src/api/types.ts',
        // Dormant future-adapter seam (per plan.md "Vendor-Neutral
        // Core Architecture"). T066 made these unreachable from the
        // v1 default emit path; T070's dependency-pins.test.ts
        // structurally locks that they are never bundled, imported,
        // or named in the published surface. The files remain in
        // the source tree as a documented seam for future vendor
        // adapters; including them in v1 coverage would force
        // adapter-specific tests that have no purpose at this
        // phase.
        'src/internal/telemetry/**',
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
