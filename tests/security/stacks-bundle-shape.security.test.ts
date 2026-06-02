/**
 * Bundle-shape & boundary security test for the `./stacks` subpath
 * (specs/017-readable-error-stacks — ST-11, ST-12, FR-011/FR-012).
 *
 * (a) Source-import boundary: src/stacks/**.ts imports only intra-subpath or a
 *     type-only `../api/types.js` — no core src/ subtree, no vendor SDK.
 * (b) Vendor-neutral: dist/stacks.{mjs,cjs} names no source-map / vendor library.
 * (c) Default-entry isolation: dist/index.{mjs,cjs,d.ts} has no parser fingerprints.
 * (d) Gzip budget for dist/stacks.mjs.
 *
 * `npm run build` is a hard prerequisite.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd());
const DIST_ROOT = resolve(REPO_ROOT, 'dist');
const SRC_STACKS = resolve(REPO_ROOT, 'src/stacks');

const STACKS_MJS = resolve(DIST_ROOT, 'stacks.mjs');
const STACKS_CJS = resolve(DIST_ROOT, 'stacks.cjs');
const INDEX_MJS = resolve(DIST_ROOT, 'index.mjs');
const INDEX_CJS = resolve(DIST_ROOT, 'index.cjs');
const INDEX_DTS = resolve(DIST_ROOT, 'index.d.ts');

// Source-map / observability-vendor library package names the bundle must not
// contain. (Note: bare 'sourcemap' is intentionally excluded — it false-matches
// tsup's `//# sourceMappingURL=` comment; the npm package is 'source-map'.)
const FORBIDDEN_NAMES: ReadonlyArray<string> = [
  'source-map',
  '@jridgewell',
  'trace-mapping',
  '@opentelemetry/',
  '@datadog/',
  '@sentry/',
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
  '../breadcrumbs/',
];

/** Identifiers distinctive to the stacks subpath (must not leak into the default entry). */
const STACKS_FINGERPRINTS: ReadonlyArray<string> = [
  'createStackNormalizer',
  'includeNodeModules',
  'MAX_FRAMES_BOUND',
];

const SIZE_LIMIT_BYTES = 2048;

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
    STACKS_MJS,
    STACKS_CJS,
    INDEX_MJS,
    INDEX_CJS,
    INDEX_DTS,
  ]) {
    if (!existsSync(path)) {
      throw new Error(
        `Required build artifact ${path} is missing. Run 'npm run build' before invoking the stacks bundle-shape test.`,
      );
    }
  }
});

describe('(a) source-import boundary — src/stacks/**/*.ts', () => {
  const IMPORT_REGEX =
    /^\s*import\s+(?:(type)\s+)?[^'"]*\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm;
  const sourceFiles = [...walkTs(SRC_STACKS)];

  it('discovers the source module', () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(1);
  });

  it.each(
    sourceFiles.map((p) => [relative(REPO_ROOT, p), p] as const),
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
        if (!typeOnly) violations.push(`${from} must be type-only`);
        continue;
      }
      if (FORBIDDEN_RELATIVE_PREFIXES.some((p) => from.startsWith(p))) {
        violations.push(`${from} is a forbidden src/ subdirectory`);
        continue;
      }
      if (from.startsWith('../')) {
        violations.push(`unexpected parent import '${from}'`);
        continue;
      }
      if (FORBIDDEN_NAMES.some((n) => from.includes(n))) {
        violations.push(`${from} is a forbidden vendor/source-map package`);
      }
    }
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});

describe('(b) dist/stacks.{mjs,cjs} bundles no source-map / vendor library', () => {
  it.each(FORBIDDEN_NAMES)('mjs contains no reference to "%s"', (name) => {
    expect(read(STACKS_MJS).toLowerCase()).not.toContain(name.toLowerCase());
  });
  it.each(FORBIDDEN_NAMES)('cjs contains no reference to "%s"', (name) => {
    expect(read(STACKS_CJS).toLowerCase()).not.toContain(name.toLowerCase());
  });
});

describe('(c) dist/index.{mjs,cjs,d.ts} does NOT contain stacks fingerprints', () => {
  it.each(STACKS_FINGERPRINTS)('index.mjs has no "%s"', (s) => {
    expect(read(INDEX_MJS)).not.toContain(s);
  });
  it.each(STACKS_FINGERPRINTS)('index.cjs has no "%s"', (s) => {
    expect(read(INDEX_CJS)).not.toContain(s);
  });
  it.each(STACKS_FINGERPRINTS)('index.d.ts has no "%s"', (s) => {
    expect(read(INDEX_DTS)).not.toContain(s);
  });
});

describe('(d) dist/stacks.mjs gzipped size budget', () => {
  it(`is ≤ ${SIZE_LIMIT_BYTES} bytes gzipped`, () => {
    const gz = gzipSync(readFileSync(STACKS_MJS)).length;
    expect(
      gz,
      `dist/stacks.mjs gzipped is ${gz} bytes; limit is ${SIZE_LIMIT_BYTES}`,
    ).toBeLessThanOrEqual(SIZE_LIMIT_BYTES);
  });
});
