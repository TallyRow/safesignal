/**
 * Security test: `./capture` bundle shape & boundary
 * (specs/013-global-error-capture — FR-014; constitution Principle XI).
 *
 *   (a) Source-import boundary: `src/capture/**` imports nothing from the core
 *       runtime/pipeline — the only `src/` import is a **type-only** import from
 *       `../api/types.js`.
 *   (b) Bundle vendor-neutrality: `dist/capture.{mjs,cjs}` names no
 *       observability-vendor package or identifier.
 *   (c) Default-entry isolation: `dist/index.{mjs,cjs}` does not pull the
 *       capture entrypoint name.
 *
 * Build is a hard prerequisite — `beforeAll` fails fast if `dist/` is missing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd());
const DIST = resolve(REPO_ROOT, 'dist');
const SRC_CAPTURE = resolve(REPO_ROOT, 'src', 'capture', 'index.ts');

const VENDOR_FRAGMENTS = [
  '@opentelemetry',
  'opentelemetry',
  '@datadog',
  '@sentry',
  'SeverityNumber',
  'LoggerProvider',
];

describe('./capture bundle shape (Principle XI)', () => {
  beforeAll(() => {
    if (!existsSync(resolve(DIST, 'capture.mjs'))) {
      throw new Error('dist/ not built — run `npm run build` first.');
    }
  });

  it('(a) src/capture only type-only-imports from ../api/types.js', () => {
    const text = readFileSync(SRC_CAPTURE, 'utf8');
    const importLines = text
      .split('\n')
      .filter((l) => /\bfrom\s+['"]/.test(l) && l.includes("'"));
    for (const line of importLines) {
      const spec = line.match(/from\s+['"]([^'"]+)['"]/)?.[1] ?? '';
      if (!spec.startsWith('.')) continue; // node:/external are fine
      expect(spec).toBe('../api/types.js'); // only intra-package src import allowed
      expect(line).toMatch(/^\s*import\s+type\b/); // and it MUST be type-only
    }
  });

  it('(b) dist/capture.{mjs,cjs} are vendor-neutral', () => {
    for (const file of ['capture.mjs', 'capture.cjs']) {
      const text = readFileSync(resolve(DIST, file), 'utf8');
      for (const fragment of VENDOR_FRAGMENTS) {
        expect(text).not.toContain(fragment);
      }
    }
  });

  it('(c) the default entry does not bundle the capture entrypoint', () => {
    for (const file of ['index.mjs', 'index.cjs']) {
      const text = readFileSync(resolve(DIST, file), 'utf8');
      expect(text).not.toContain('installGlobalErrorCapture');
    }
  });
});
