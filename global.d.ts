/**
 * Build-time global injected by tsup's `define` (see tsup.config.ts).
 *
 * - `true` in development builds (and during tests).
 * - `false` in production builds.
 *
 * This is the ONLY build-time flag the runtime code may consult. The package
 * source must never read `process.env`, `import.meta.env`, `location`, or
 * `document.cookie` (enforced by tests/contract/no-ambient-state.test.ts in T013).
 */
declare const __DEV__: boolean;
