/**
 * Bundle-shape & boundary security test for the `./dev-console` subpath
 * (specs/015-dev-console-rendering — DC-10, FR-008/FR-010, SC-006).
 *
 * Four invariant groups:
 *
 * (a) Source-import boundary: every `.ts` under `src/dev-console/**` imports
 *     only from intra-subpath paths or a **type-only** `'../api/types.js'`,
 *     and never reaches into core src/ subtrees or a vendor SDK.
 *
 * (b) Subpath bundle vendor-neutrality: `dist/dev-console.{mjs,cjs}` names no
 *     observability-vendor package or identifier.
 *
 * (c) Default-entry isolation: `dist/index.{mjs,cjs,d.ts}` does NOT contain
 *     `DevConsoleTransport` or other dev-console fingerprints — proving the
 *     renderer never leaks into the default `.` entry (DC-10 / SC-006).
 *
 * (d) Gzip budget: the new subpath is tiny.
 *
 * `npm run build` is a hard prerequisite.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd());
const DIST_ROOT = resolve(REPO_ROOT, 'dist');
const SRC_DEV_CONSOLE = resolve(REPO_ROOT, 'src/dev-console');

const DEV_CONSOLE_MJS = resolve(DIST_ROOT, 'dev-console.mjs');
const DEV_CONSOLE_CJS = resolve(DIST_ROOT, 'dev-console.cjs');
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
  'SpanContext',
  'TracerProvider',
  'OtelLogsBackend',
];

const FORBIDDEN_RELATIVE_PREFIXES: ReadonlyArray<string> = [
  '../internal/',
  '../runtime/',
  '../pipeline/',
  '../config/',
  '../context/',
  '../transport/',
  '../transport-beacon/',
  '../capture/',
];

/** Identifiers distinctive to the dev-console subpath. */
const DEV_CONSOLE_FINGERPRINTS: ReadonlyArray<string> = [
  'DevConsoleTransport',
  'dev-console',
  '↳ trace',
];

const SIZE_LIMIT_BYTES = 3072;

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) yield* walkTs(full);
    else if (s.isFile() && full.endsWith('.ts')) yield full;
  }
}

beforeAll(() => {
  for (const path of [
    DEV_CONSOLE_MJS,
    DEV_CONSOLE_CJS,
    INDEX_MJS,
    INDEX_CJS,
    INDEX_DTS,
  ]) {
    if (!existsSync(path)) {
      throw new Error(
        `Required build artifact ${path} is missing. Run 'npm run build' before invoking the dev-console bundle-shape test.`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// (a) Source-import boundary
// ---------------------------------------------------------------------------

describe('(a) source-import boundary — src/dev-console/**/*.ts', () => {
  const IMPORT_REGEX =
    /^\s*import\s+(?:(type)\s+)?[^'"]*\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm;
  const sourceFiles = [...walkTs(SRC_DEV_CONSOLE)];

  it('discovers the source module', () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(1);
  });

  it.each(
    sourceFiles.map((path) => [relative(REPO_ROOT, path), path] as const),
  )('%s: imports only from permitted paths', (_label, path) => {
    const source = read(path);
    const violations: string[] = [];
    let match: RegExpExecArray | null;
    IMPORT_REGEX.lastIndex = 0;
    // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic RegExp.exec() iteration.
    while ((match = IMPORT_REGEX.exec(source)) !== null) {
      const typeOnly = match[1] === 'type';
      const from = match[2];
      if (from === undefined) continue;
      if (from.startsWith('./')) continue;
      if (from === '../api/types.js') {
        if (!typeOnly) {
          violations.push(`${from} must be type-only (use \`import type\`)`);
        }
        continue;
      }
      if (FORBIDDEN_RELATIVE_PREFIXES.some((p) => from.startsWith(p))) {
        violations.push(`${from} is in a forbidden src/ subdirectory`);
        continue;
      }
      if (from.startsWith('../')) {
        violations.push(
          `unexpected parent-relative import '${from}' — only '../api/types.js' (type-only) is allowed`,
        );
        continue;
      }
      if (VENDOR_PACKAGE_NAMES.some((v) => from.startsWith(v))) {
        violations.push(`${from} is an observability-vendor package`);
      }
    }
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (b) Subpath bundle vendor-neutrality
// ---------------------------------------------------------------------------

describe('(b) dist/dev-console.{mjs,cjs} contains no vendor reference', () => {
  it.each(VENDOR_PACKAGE_NAMES)('mjs contains no reference to "%s"', (name) => {
    expect(read(DEV_CONSOLE_MJS).toLowerCase()).not.toContain(name.toLowerCase());
  });
  it.each(VENDOR_PACKAGE_NAMES)('cjs contains no reference to "%s"', (name) => {
    expect(read(DEV_CONSOLE_CJS).toLowerCase()).not.toContain(name.toLowerCase());
  });
  it.each(VENDOR_IDENTIFIERS)('mjs contains no vendor identifier "%s"', (name) => {
    expect(read(DEV_CONSOLE_MJS)).not.toMatch(new RegExp(`\\b${name}\\b`));
  });
});

// ---------------------------------------------------------------------------
// (c) Default-entry isolation
// ---------------------------------------------------------------------------

describe('(c) dist/index.{mjs,cjs,d.ts} does NOT contain dev-console fingerprints', () => {
  it.each(DEV_CONSOLE_FINGERPRINTS)('index.mjs does not contain "%s"', (s) => {
    expect(read(INDEX_MJS)).not.toContain(s);
  });
  it.each(DEV_CONSOLE_FINGERPRINTS)('index.cjs does not contain "%s"', (s) => {
    expect(read(INDEX_CJS)).not.toContain(s);
  });
  it.each(DEV_CONSOLE_FINGERPRINTS)('index.d.ts does not contain "%s"', (s) => {
    expect(read(INDEX_DTS)).not.toContain(s);
  });
});

// ---------------------------------------------------------------------------
// (d) Gzip budget
// ---------------------------------------------------------------------------

describe('(d) dist/dev-console.mjs gzipped size budget', () => {
  it(`is ≤ ${SIZE_LIMIT_BYTES} bytes gzipped`, () => {
    const gz = gzipSync(readFileSync(DEV_CONSOLE_MJS)).length;
    expect(
      gz,
      `dist/dev-console.mjs gzipped is ${gz} bytes; limit is ${SIZE_LIMIT_BYTES}`,
    ).toBeLessThanOrEqual(SIZE_LIMIT_BYTES);
  });
});
