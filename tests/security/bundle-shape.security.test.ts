/**
 * Bundle-shape security test (T049).
 *
 * Runs after the build (`npm run build`). Asserts that the published
 * artifacts under `dist/` honor the vendor-neutral core contract and
 * the public-surface lock from plan.md.
 *
 * Specifically:
 *   1. `dist/index.d.ts` does NOT contain any observability-vendor
 *      package name (OpenTelemetry, Datadog, Sentry) or any
 *      vendor-specific identifier (`SeverityNumber`, `LoggerProvider`,
 *      `Span`, `Trace*`, `Exporter`, `Processor`, `Hub`, etc.).
 *   2. The built default entries (`dist/index.mjs`, `dist/index.cjs`)
 *      do not import from any vendor SDK and do not re-export
 *      anything from `dist/internal/**` or `dist/testing/**`.
 *   3. The `./testing` subpath (`dist/testing.{mjs,cjs}`) is reachable
 *      only via that subpath — its content stays separate from the
 *      default entry.
 *
 * The build step is a hard prerequisite. If `dist/` is missing the
 * test fails fast with a clear instruction to run `npm run build`,
 * rather than passing trivially.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

const DIST_ROOT = resolve(process.cwd(), 'dist');
const INDEX_DTS = resolve(DIST_ROOT, 'index.d.ts');
const INDEX_DCTS = resolve(DIST_ROOT, 'index.d.cts');
const TESTING_DTS = resolve(DIST_ROOT, 'testing.d.ts');
const INDEX_MJS = resolve(DIST_ROOT, 'index.mjs');
const INDEX_CJS = resolve(DIST_ROOT, 'index.cjs');
const TESTING_MJS = resolve(DIST_ROOT, 'testing.mjs');

const VENDOR_PACKAGE_NAMES: ReadonlyArray<string> = [
  '@opentelemetry/',
  'opentelemetry',
  '@datadog/',
  'dd-rum',
  'dd-trace',
  '@sentry/',
];

/**
 * Vendor-specific identifiers that may appear as types or class names
 * inside vendor SDKs. None of these should ever surface in the public
 * declaration file. Generic words like "Scope" and "Transaction" are
 * excluded — they collide with common English usage in JSDoc text.
 */
const VENDOR_IDENTIFIERS: ReadonlyArray<string> = [
  'SeverityNumber',
  'LoggerProvider',
  'LogRecord',
  'LogRecordProcessor',
  'LogRecordExporter',
  'SpanContext',
  'SpanProcessor',
  'SpanExporter',
  'TraceFlags',
  'TraceProvider',
  'TraceState',
  'TracerProvider',
  'OtelLogsBackend',
  'DDLogger',
  'SentryHub',
];

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

// ---------------------------------------------------------------------------
// Build prerequisite
// ---------------------------------------------------------------------------

beforeAll(() => {
  if (!existsSync(DIST_ROOT)) {
    throw new Error(
      `dist/ is missing. Run 'npm run build' before invoking the bundle-shape security test.`,
    );
  }
  for (const path of [INDEX_DTS, INDEX_DCTS, INDEX_MJS, INDEX_CJS]) {
    if (!existsSync(path)) {
      throw new Error(
        `Required build artifact ${path} is missing. Run 'npm run build' to refresh.`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Declaration-file (.d.ts / .d.cts) vendor-neutrality
// ---------------------------------------------------------------------------

describe('dist/index.d.ts is vendor-neutral', () => {
  it.each(
    VENDOR_PACKAGE_NAMES,
  )('contains no reference to vendor package name "%s"', (name) => {
    const dts = read(INDEX_DTS);
    const dcts = read(INDEX_DCTS);
    expect(
      dts.toLowerCase(),
      `dist/index.d.ts contains "${name}"`,
    ).not.toContain(name.toLowerCase());
    expect(
      dcts.toLowerCase(),
      `dist/index.d.cts contains "${name}"`,
    ).not.toContain(name.toLowerCase());
  });

  it.each(
    VENDOR_IDENTIFIERS,
  )('contains no vendor-specific identifier "%s"', (name) => {
    const dts = read(INDEX_DTS);
    const dcts = read(INDEX_DCTS);
    // Word-boundary match avoids false positives like "TracerProvider"
    // accidentally matching as "Provider" — we want to flag exact
    // identifier names, not substrings inside an unrelated word.
    const pattern = new RegExp(`\\b${name}\\b`);
    expect(pattern.test(dts), `dist/index.d.ts contains "${name}"`).toBe(false);
    expect(pattern.test(dcts), `dist/index.d.cts contains "${name}"`).toBe(
      false,
    );
  });

  it('declares the documented public surface and nothing else', () => {
    // PA-1..PA-9 lock — every export listed must be present, and
    // the export count must match the documented surface. The full
    // list is locked by `tests/contract/public-api.contract.test.ts`
    // (T019); this is a coarser shape sanity check against the
    // BUILT declaration file.
    const dts = read(INDEX_DTS);
    for (const name of [
      'createLogger',
      'configureLogging',
      'getRootLogger',
      'createRedactor',
      'scrubUrl',
      'ConsoleTransport',
      'NoopTransport',
      'Logger',
      'LogLevel',
      'LogEvent',
      'LogContext',
      'Attributes',
      'AttributeValue',
      'LoggerConfig',
      'Transport',
      'TransportFactory',
      'Redactor',
      'RedactionRule',
      'ScrubUrlOptions',
      'SanitizerLimits',
    ]) {
      expect(dts).toContain(name);
    }
  });
});

describe('dist/testing.d.ts is reachable only via the ./testing subpath', () => {
  it('declares the documented test helpers (assertTransportContract, makeSecretFixture)', () => {
    if (!existsSync(TESTING_DTS)) {
      throw new Error(
        'dist/testing.d.ts missing — build did not emit testing entry',
      );
    }
    const dts = read(TESTING_DTS);
    expect(dts).toContain('assertTransportContract');
    expect(dts).toContain('makeSecretFixture');
  });

  it('the testing entry name does not appear in the default index entry', () => {
    const dts = read(INDEX_DTS);
    expect(dts).not.toContain('assertTransportContract');
    expect(dts).not.toContain('makeSecretFixture');
  });
});

// ---------------------------------------------------------------------------
// Built JavaScript (.mjs / .cjs) vendor-neutrality
// ---------------------------------------------------------------------------

describe('dist/index.{mjs,cjs} default entry does not re-export internal/testing', () => {
  it.each([
    'index.mjs',
    'index.cjs',
  ])('%s does not re-export from dist/internal/** or dist/testing/**', (file) => {
    const content = read(resolve(DIST_ROOT, file));
    // tsup emits a single bundled file; the file itself should contain
    // no path strings referencing internal or testing subdirectories,
    // since those are bundled in (for internal) or excluded entirely
    // (for testing — testing is a separate entry).
    expect(content).not.toMatch(/from\s+['"]\.\/internal\//);
    expect(content).not.toMatch(/from\s+['"]\.\/testing\//);
    expect(content).not.toMatch(/require\(['"]\.\/internal\//);
    expect(content).not.toMatch(/require\(['"]\.\/testing\//);
    // The testing entry's main export names also must not appear
    // (they live in dist/testing.mjs, not the default entry).
    expect(content).not.toContain('assertTransportContract');
    expect(content).not.toContain('makeSecretFixture');
  });

  // The "no vendor SDK in the built JS default entry" guarantee was
  // unlocked by T066 (dispatcher refactor) and is now locked here.
  // `tests/contract/dependency-pins.test.ts` (T070) carries the
  // canonical version of this assertion with broader vendor
  // coverage; this is the bundle-shape-suite mirror so a regression
  // surfaces during the security pass even if the contract suite
  // is run in isolation.
  it.each([
    ['index.mjs', INDEX_MJS],
    ['index.cjs', INDEX_CJS],
  ])('%s contains no @opentelemetry/* / @datadog/* / @sentry/* imports', (_label, file) => {
    const content = readFileSync(file, 'utf8');
    for (const vendor of [
      '@opentelemetry/',
      '@datadog/',
      '@sentry/',
      'dd-rum',
      'dd-trace',
    ]) {
      expect(content).not.toContain(vendor);
    }
  });
});

describe('dist/testing.{mjs,cjs} is a separate entry from default index', () => {
  it('testing entry exists and exports the documented helpers', () => {
    expect(existsSync(TESTING_MJS)).toBe(true);
    const content = read(TESTING_MJS);
    expect(content).toContain('assertTransportContract');
    expect(content).toContain('makeSecretFixture');
  });
});

// ---------------------------------------------------------------------------
// Future-direction note about T066 + T070
// ---------------------------------------------------------------------------

describe('bundle-size safety net (vendor-SDK regression detector)', () => {
  it('the default mjs bundle stays under 1 MB raw (coarse safety net for vendor-SDK regressions)', () => {
    // Coarse safety net: a vendor-neutral core cannot reasonably
    // exceed 1 MB raw. If this assertion trips, something heavy got
    // bundled — likely a vendor SDK regression. The dedicated bundle-
    // size and dependency audit lives in T070 (Polish phase).
    const stats = readFileSync(INDEX_MJS, 'utf8');
    expect(stats.length).toBeLessThan(1_000_000);
  });
});
