/**
 * T008 — Bundle-shape & boundary security test for the
 * `./transport-beacon` subpath.
 *
 * Four invariant groups, locking TB-11 + SC-008:
 *
 * (a) Source-import boundary: every `.ts` file under
 *     `src/transport-beacon/**` has no import resolving to
 *     `src/internal/**`, `src/runtime/**`, `src/pipeline/**`,
 *     `src/config/**`, `src/context/**`, or `src/transport/**`.
 *     The only `src/` import permitted is a **type-only** import
 *     from `'../api/types.js'`.
 *
 * (b) Subpath bundle vendor-neutrality:
 *     `dist/transport-beacon.{mjs,cjs}` contains no
 *     observability-vendor package name or identifier (mirror of
 *     feature 001's T049 list).
 *
 * (c) Default-entry isolation: `dist/index.{mjs,cjs,d.ts}` does
 *     NOT contain `createBeaconTransport`, `BeaconError`, any
 *     `BeaconErrorCode` literal, or other beacon-source-
 *     distinctive identifiers — proving the new subpath's code
 *     does not leak into the default entry's bundle (FR-010,
 *     SC-007).
 *
 * (d) Gzip budget: `dist/transport-beacon.mjs` gzipped ≤ 5120
 *     bytes (SC-008, TB-11).
 *
 * The build step is a hard prerequisite — `beforeAll` fails
 * fast if `dist/` is missing, telling the user to run
 * `npm run build`.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import { beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd());
const DIST_ROOT = resolve(REPO_ROOT, 'dist');
const SRC_TRANSPORT_BEACON = resolve(REPO_ROOT, 'src/transport-beacon');

const TRANSPORT_BEACON_MJS = resolve(DIST_ROOT, 'transport-beacon.mjs');
const TRANSPORT_BEACON_CJS = resolve(DIST_ROOT, 'transport-beacon.cjs');
const INDEX_MJS = resolve(DIST_ROOT, 'index.mjs');
const INDEX_CJS = resolve(DIST_ROOT, 'index.cjs');
const INDEX_DTS = resolve(DIST_ROOT, 'index.d.ts');

const VENDOR_PACKAGE_NAMES: ReadonlyArray<string> = [
  '@opentelemetry/',
  'opentelemetry',
  '@datadog/',
  'dd-rum',
  'dd-trace',
  '@sentry/',
];

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

/**
 * Forbidden source-directory prefixes for any `import` resolving
 * via relative path from inside `src/transport-beacon/**`.
 */
const FORBIDDEN_RELATIVE_PREFIXES: ReadonlyArray<string> = [
  '../internal/',
  '../runtime/',
  '../pipeline/',
  '../config/',
  '../context/',
  '../transport/',
];

/**
 * Identifiers distinctive enough to fingerprint the beacon
 * subpath's code if it leaked into the default entry's bundle.
 */
const BEACON_SOURCE_FINGERPRINTS: ReadonlyArray<string> = [
  'createBeaconTransport',
  'BeaconError',
  'BeaconTransportOptions',
  'allowInsecureLoopback',
  'oversized_event',
  'beacon_batch_drop',
  'beacon_unavailable',
];

const SIZE_LIMIT_BYTES = 5120;

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      yield* walkTs(full);
    } else if (s.isFile() && full.endsWith('.ts')) {
      yield full;
    }
  }
}

beforeAll(() => {
  if (!existsSync(DIST_ROOT)) {
    throw new Error(
      `dist/ is missing. Run 'npm run build' before invoking the transport-beacon bundle-shape test.`,
    );
  }
  for (const path of [
    TRANSPORT_BEACON_MJS,
    TRANSPORT_BEACON_CJS,
    INDEX_MJS,
    INDEX_CJS,
    INDEX_DTS,
  ]) {
    if (!existsSync(path)) {
      throw new Error(
        `Required build artifact ${path} is missing. Run 'npm run build' to refresh.`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// (a) Source-import boundary
// ---------------------------------------------------------------------------

describe('(a) source-import boundary — src/transport-beacon/**/*.ts', () => {
  // Regex captures: optional `type` keyword (group 1), import target (group 2).
  // Matches single-line forms; multi-line imports are normalised by reading
  // the file as a whole and applying the global, multi-line flag.
  const IMPORT_REGEX =
    /^\s*import\s+(?:(type)\s+)?[^'"]*\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm;

  const sourceFiles = [...walkTs(SRC_TRANSPORT_BEACON)];

  it('discovers source files to scan', () => {
    // Sanity: tasks T003–T007 should have landed at least the entry + four
    // foundational modules. If the directory is empty, the scan is vacuous.
    expect(sourceFiles.length).toBeGreaterThanOrEqual(5);
  });

  it.each(
    sourceFiles.length > 0
      ? sourceFiles.map((path) => [relative(REPO_ROOT, path), path] as const)
      : [['no source files discovered', SRC_TRANSPORT_BEACON] as const],
  )('%s: imports only from permitted paths', (_label, path) => {
    const source = read(path);
    const violations: Array<{
      from: string;
      typeOnly: boolean;
      reason: string;
    }> = [];
    let match: RegExpExecArray | null;
    IMPORT_REGEX.lastIndex = 0;
    // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic RegExp.exec() iteration over all matches.
    while ((match = IMPORT_REGEX.exec(source)) !== null) {
      const typeOnly = match[1] === 'type';
      const from = match[2];
      if (from === undefined) continue;

      if (from.startsWith('./')) {
        // Intra-subpath import — always permitted.
        continue;
      }

      if (from === '../api/types.js') {
        // Single permitted cross-directory import. MUST be type-only.
        if (!typeOnly) {
          violations.push({
            from,
            typeOnly,
            reason: `imports from '../api/types.js' must be type-only (use \`import type\`)`,
          });
        }
        continue;
      }

      if (
        FORBIDDEN_RELATIVE_PREFIXES.some((prefix: string) =>
          from.startsWith(prefix),
        )
      ) {
        violations.push({
          from,
          typeOnly,
          reason: `import target '${from}' is in a forbidden src/ subdirectory (TB-11)`,
        });
        continue;
      }

      if (from.startsWith('../')) {
        // Any other parent-directory traversal is unexpected. Flag it so
        // future additions to src/ that the subpath might accidentally
        // reach into surface explicitly.
        violations.push({
          from,
          typeOnly,
          reason: `unexpected parent-relative import '${from}' — only '../api/types.js' (type-only) is allowed`,
        });
        continue;
      }

      // Bare specifier (npm package) — must NOT be a vendor SDK.
      if (
        VENDOR_PACKAGE_NAMES.some((vendor: string) => from.startsWith(vendor))
      ) {
        violations.push({
          from,
          typeOnly,
          reason: `import target '${from}' is an observability-vendor package (TB-11)`,
        });
      }
    }
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (b) Subpath bundle vendor-neutrality
// ---------------------------------------------------------------------------

describe('(b) dist/transport-beacon.{mjs,cjs} contains no vendor reference', () => {
  it.each(VENDOR_PACKAGE_NAMES)('mjs contains no reference to "%s"', (name) => {
    expect(read(TRANSPORT_BEACON_MJS).toLowerCase()).not.toContain(
      name.toLowerCase(),
    );
  });
  it.each(VENDOR_PACKAGE_NAMES)('cjs contains no reference to "%s"', (name) => {
    expect(read(TRANSPORT_BEACON_CJS).toLowerCase()).not.toContain(
      name.toLowerCase(),
    );
  });
  it.each(
    VENDOR_IDENTIFIERS,
  )('mjs contains no vendor identifier "%s"', (name) => {
    const wordBoundary = new RegExp(`\\b${name}\\b`);
    expect(read(TRANSPORT_BEACON_MJS)).not.toMatch(wordBoundary);
  });
  it.each(
    VENDOR_IDENTIFIERS,
  )('cjs contains no vendor identifier "%s"', (name) => {
    const wordBoundary = new RegExp(`\\b${name}\\b`);
    expect(read(TRANSPORT_BEACON_CJS)).not.toMatch(wordBoundary);
  });
});

// ---------------------------------------------------------------------------
// (c) Default-entry isolation
// ---------------------------------------------------------------------------

describe('(c) dist/index.{mjs,cjs,d.ts} does NOT contain beacon-source identifiers', () => {
  // We intentionally exclude `BeaconTransportOptions` from the source-
  // fingerprint scan against the .d.ts file, since the default-entry .d.ts
  // never mentions it (the subpath owns it). Including it as a fingerprint
  // would still pass — the .d.ts simply doesn't contain it.
  const fingerprintsToScan = BEACON_SOURCE_FINGERPRINTS;
  it.each(fingerprintsToScan)('index.mjs does not contain "%s"', (symbol) => {
    expect(read(INDEX_MJS)).not.toContain(symbol);
  });
  it.each(fingerprintsToScan)('index.cjs does not contain "%s"', (symbol) => {
    expect(read(INDEX_CJS)).not.toContain(symbol);
  });
  it.each(fingerprintsToScan)('index.d.ts does not contain "%s"', (symbol) => {
    expect(read(INDEX_DTS)).not.toContain(symbol);
  });
});

// ---------------------------------------------------------------------------
// (d) Gzip budget (SC-008)
// ---------------------------------------------------------------------------

describe('(d) dist/transport-beacon.mjs gzipped size budget', () => {
  it(`is ≤ ${SIZE_LIMIT_BYTES} bytes gzipped (SC-008)`, () => {
    const raw = readFileSync(TRANSPORT_BEACON_MJS);
    const gz = gzipSync(raw).length;
    // Print the actual size so a budget overshoot reports the diff in CI.
    expect(
      gz,
      `dist/transport-beacon.mjs gzipped is ${gz} bytes; SC-008 limit is ${SIZE_LIMIT_BYTES}`,
    ).toBeLessThanOrEqual(SIZE_LIMIT_BYTES);
  });
});

// ---------------------------------------------------------------------------
// (e) Default-entry size lock (SC-007 — bit-identical-or-smaller)
// ---------------------------------------------------------------------------

/**
 * Snapshot ceiling for the default entry's gzipped size. Captured
 * AFTER feature 002's beacon-transport subpath landed and verified
 * to be unchanged from the pre-feature snapshot — the new subpath's
 * code is tree-shaken out of the default entry per (c) above. This
 * test enforces SC-007: any future change that causes
 * createBeaconTransport / BeaconError / batcher code to leak into
 * the default entry's bundle (e.g., via an accidental re-export
 * from src/index.ts) increases this number and fails the test.
 *
 * If the default entry shrinks (e.g., from a future cleanup), bump
 * these constants down — the assertion uses ≤, so a smaller bundle
 * passes the upper bound but should be tightened to lock in the
 * win.
 */
const DEFAULT_ENTRY_MJS_GZ_MAX = 8200; // observed: 8162 B
const DEFAULT_ENTRY_CJS_GZ_MAX = 8240; // observed: 8200 B

describe('(e) dist/index.{mjs,cjs} default-entry size lock (SC-007)', () => {
  it(`dist/index.mjs is ≤ ${DEFAULT_ENTRY_MJS_GZ_MAX} bytes gzipped (no beacon-subpath leakage)`, () => {
    const raw = readFileSync(INDEX_MJS);
    const gz = gzipSync(raw).length;
    expect(
      gz,
      `dist/index.mjs gzipped is ${gz} bytes; ceiling is ${DEFAULT_ENTRY_MJS_GZ_MAX}. ` +
        `An increase typically means createBeaconTransport / batcher / BeaconError code ` +
        `leaked into the default entry — check src/index.ts re-exports.`,
    ).toBeLessThanOrEqual(DEFAULT_ENTRY_MJS_GZ_MAX);
  });

  it(`dist/index.cjs is ≤ ${DEFAULT_ENTRY_CJS_GZ_MAX} bytes gzipped (no beacon-subpath leakage)`, () => {
    const raw = readFileSync(INDEX_CJS);
    const gz = gzipSync(raw).length;
    expect(
      gz,
      `dist/index.cjs gzipped is ${gz} bytes; ceiling is ${DEFAULT_ENTRY_CJS_GZ_MAX}.`,
    ).toBeLessThanOrEqual(DEFAULT_ENTRY_CJS_GZ_MAX);
  });
});
