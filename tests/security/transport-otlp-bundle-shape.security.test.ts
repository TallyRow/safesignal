/**
 * T013 [US1] — Bundle-shape & boundary security test for the
 * `./transport-otlp` subpath (mirror of the beacon equivalent).
 *
 * Locks TO-7:
 *   (a) source-import boundary: every `.ts` under
 *       `src/transport-otlp/**` imports only intra-subpath (`./…`) or a
 *       type-only `'../api/types.js'`; never `../internal/` (incl.
 *       `../internal/telemetry/otel/`), `../runtime/`, `../pipeline/`,
 *       `../config/`, `../context/`, `../transport/`, nor any
 *       `@opentelemetry/*` package.
 *   (b) bundle vendor-neutrality: `dist/transport-otlp.{mjs,cjs}` has no
 *       `@opentelemetry/` reference and no vendor identifier.
 *   (c) default-entry isolation: `dist/index.{mjs,cjs,d.ts}` has no
 *       OTLP-subpath fingerprint.
 *   (d) gzip budget: `dist/transport-otlp.mjs` gz ≤ 9390 bytes (measured 8164 B + 15% headroom per R4).
 *
 * The build is a hard prerequisite — `beforeAll` fails loudly if `dist/`
 * is missing.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import { beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd());
const DIST_ROOT = resolve(REPO_ROOT, 'dist');
const SRC_TRANSPORT_OTLP = resolve(REPO_ROOT, 'src/transport-otlp');

const OTLP_MJS = resolve(DIST_ROOT, 'transport-otlp.mjs');
const OTLP_CJS = resolve(DIST_ROOT, 'transport-otlp.cjs');
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
  'LogRecordProcessor',
  'LogRecordExporter',
  'OtelLogsBackend',
];

const FORBIDDEN_RELATIVE_PREFIXES: ReadonlyArray<string> = [
  '../internal/',
  '../runtime/',
  '../pipeline/',
  '../config/',
  '../context/',
  '../transport/',
];

/** Identifiers distinctive enough to fingerprint OTLP-subpath code leakage. */
const OTLP_SOURCE_FINGERPRINTS: ReadonlyArray<string> = [
  'createOtlpTransport',
  'OtlpError',
  'buffer_overflow',
  'partial_rejection',
  'delivery_unavailable',
];

const SIZE_LIMIT_BYTES = 9390; // Measured: 8164 B gzipped. +15% headroom for small changes (R4).

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
      `dist/ is missing. Run 'npm run build' before the transport-otlp bundle-shape test.`,
    );
  }
  for (const path of [OTLP_MJS, OTLP_CJS, INDEX_MJS, INDEX_CJS, INDEX_DTS]) {
    if (!existsSync(path)) {
      throw new Error(
        `Required build artifact ${path} is missing. Run 'npm run build'.`,
      );
    }
  }
});

describe('(a) source-import boundary — src/transport-otlp/**/*.ts', () => {
  const IMPORT_REGEX =
    /^\s*import\s+(?:(type)\s+)?[^'"]*\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm;
  const sourceFiles = [...walkTs(SRC_TRANSPORT_OTLP)];

  it('discovers source files to scan', () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(7);
  });

  it.each(
    sourceFiles.map((p) => [relative(REPO_ROOT, p), p] as const),
  )('%s: imports only from permitted paths', (_label, path) => {
    const source = read(path);
    const violations: Array<{ from: string; reason: string }> = [];
    let match: RegExpExecArray | null;
    IMPORT_REGEX.lastIndex = 0;
    // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic RegExp.exec iteration.
    while ((match = IMPORT_REGEX.exec(source)) !== null) {
      const typeOnly = match[1] === 'type';
      const from = match[2];
      if (from === undefined) continue;
      if (from.startsWith('./')) continue;
      if (from === '../api/types.js') {
        if (!typeOnly) {
          violations.push({
            from,
            reason: `'../api/types.js' must be type-only`,
          });
        }
        continue;
      }
      if (FORBIDDEN_RELATIVE_PREFIXES.some((p) => from.startsWith(p))) {
        violations.push({ from, reason: `forbidden src/ subdirectory (TO-7)` });
        continue;
      }
      if (from.startsWith('../')) {
        violations.push({
          from,
          reason: `unexpected parent import — only '../api/types.js' (type-only) allowed`,
        });
        continue;
      }
      if (VENDOR_PACKAGE_NAMES.some((v) => from.startsWith(v))) {
        violations.push({ from, reason: `vendor package import (TO-7)` });
      }
    }
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});

describe('(b) dist/transport-otlp.{mjs,cjs} contains no vendor reference', () => {
  it.each(VENDOR_PACKAGE_NAMES)('mjs contains no "%s"', (name) => {
    expect(read(OTLP_MJS).toLowerCase()).not.toContain(name.toLowerCase());
  });
  it.each(VENDOR_PACKAGE_NAMES)('cjs contains no "%s"', (name) => {
    expect(read(OTLP_CJS).toLowerCase()).not.toContain(name.toLowerCase());
  });
  it.each(VENDOR_IDENTIFIERS)('mjs contains no identifier "%s"', (name) => {
    expect(read(OTLP_MJS)).not.toMatch(new RegExp(`\\b${name}\\b`));
  });
  it.each(VENDOR_IDENTIFIERS)('cjs contains no identifier "%s"', (name) => {
    expect(read(OTLP_CJS)).not.toMatch(new RegExp(`\\b${name}\\b`));
  });
});

describe('(c) dist/index.{mjs,cjs,d.ts} has no OTLP-subpath fingerprint', () => {
  it.each(OTLP_SOURCE_FINGERPRINTS)('index.mjs lacks "%s"', (s) => {
    expect(read(INDEX_MJS)).not.toContain(s);
  });
  it.each(OTLP_SOURCE_FINGERPRINTS)('index.cjs lacks "%s"', (s) => {
    expect(read(INDEX_CJS)).not.toContain(s);
  });
  it.each(OTLP_SOURCE_FINGERPRINTS)('index.d.ts lacks "%s"', (s) => {
    expect(read(INDEX_DTS)).not.toContain(s);
  });
});

describe('(d) dist/transport-otlp.mjs gzipped size budget', () => {
  it(`is ≤ ${SIZE_LIMIT_BYTES} bytes gzipped`, () => {
    const gz = gzipSync(readFileSync(OTLP_MJS)).length;
    expect(
      gz,
      `dist/transport-otlp.mjs gzipped is ${gz} bytes; limit is ${SIZE_LIMIT_BYTES}`,
    ).toBeLessThanOrEqual(SIZE_LIMIT_BYTES);
  });
});
