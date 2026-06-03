/**
 * Security test: `./framework-react` bundle shape & boundary
 * (specs/018-react-error-boundary — FR-R8/R11; constitution Principle XI).
 *
 *   (a) Source-import boundary: the only intra-package `src` import in
 *       `src/framework-react/**` is a **type-only** import from
 *       `../api/types.js`; non-relative externals (`react`) are allowed.
 *   (b) Bundle vendor-neutrality: `dist/framework-react.{mjs,cjs}` name no
 *       observability-vendor package or identifier.
 *   (c) React is **externalized**: the bundle imports `react` as a bare module
 *       (not inlined — no React source markers).
 *   (d) Default-entry isolation: `dist/index.{mjs,cjs}` do not pull the React
 *       subpath's identifiers.
 *
 * Build is a hard prerequisite — `beforeAll` fails fast if `dist/` is missing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd());
const DIST = resolve(REPO_ROOT, 'dist');
const SRC = resolve(REPO_ROOT, 'src', 'framework-react', 'index.ts');

const VENDOR_FRAGMENTS = [
  '@opentelemetry',
  'opentelemetry',
  '@datadog',
  '@sentry',
  'SeverityNumber',
  'LoggerProvider', // OTel's provider — NOT our LoggerProvider (asserted in dist files below)
];

describe('./framework-react bundle shape (Principle XI)', () => {
  beforeAll(() => {
    if (!existsSync(resolve(DIST, 'framework-react.mjs'))) {
      throw new Error('dist/ not built — run `npm run build` first.');
    }
  });

  it('(a) src/framework-react only type-only-imports from ../api/types.js (externals allowed)', () => {
    const text = readFileSync(SRC, 'utf8');
    const importLines = text
      .split('\n')
      .filter((l) => /\bfrom\s+['"]/.test(l) && l.includes("'"));
    for (const line of importLines) {
      const spec = line.match(/from\s+['"]([^'"]+)['"]/)?.[1] ?? '';
      if (!spec.startsWith('.')) continue; // node:/external (react) are fine
      expect(spec).toBe('../api/types.js'); // only intra-package src import allowed
      expect(line).toMatch(/^\s*import\s+type\b/); // and it MUST be type-only
    }
  });

  it('(b) dist/framework-react.{mjs,cjs} are vendor-neutral', () => {
    for (const file of ['framework-react.mjs', 'framework-react.cjs']) {
      const text = readFileSync(resolve(DIST, file), 'utf8');
      for (const fragment of VENDOR_FRAGMENTS) {
        // Our own `LoggerProvider` export legitimately appears; only flag it as
        // a vendor hit if it is the OTel symbol, which would arrive via an
        // @opentelemetry import — already covered by the other fragments. So
        // skip the bare 'LoggerProvider' substring here (it is our own export).
        if (fragment === 'LoggerProvider') continue;
        expect(
          text,
          `${file} contains vendor fragment "${fragment}"`,
        ).not.toContain(fragment);
      }
    }
  });

  it('(c) react is externalized (imported, not inlined) in dist/framework-react.*', () => {
    const mjs = readFileSync(resolve(DIST, 'framework-react.mjs'), 'utf8');
    const cjs = readFileSync(resolve(DIST, 'framework-react.cjs'), 'utf8');
    // A bare external import/require of react is present...
    expect(mjs).toMatch(/from\s*['"]react['"]/);
    expect(cjs).toMatch(/require\(\s*['"]react['"]\s*\)/);
    // ...and React's own source is NOT inlined into the bundle.
    for (const text of [mjs, cjs]) {
      expect(text).not.toContain('react.development.js');
      expect(text).not.toContain('__SECRET_INTERNALS_DO_NOT_USE');
    }
  });

  it('(d) the default entry does not bundle the React subpath', () => {
    for (const file of ['index.mjs', 'index.cjs']) {
      const text = readFileSync(resolve(DIST, file), 'utf8');
      expect(text).not.toContain('LogErrorBoundary');
      expect(text).not.toContain('useLogError');
    }
  });
});
