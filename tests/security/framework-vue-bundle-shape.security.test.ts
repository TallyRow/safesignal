/**
 * Security test: `./framework-vue` bundle shape & boundary
 * (specs/020-vue-error-handler — FR-V10/V11; constitution Principle XI).
 *
 *   (a) Source-import boundary: the only intra-package `src` import in
 *       `src/framework-vue/**` is a **type-only** import from
 *       `../api/types.js`; non-relative externals (`vue`) are allowed.
 *   (b) Bundle vendor-neutrality: `dist/framework-vue.{mjs,cjs}` name no
 *       observability-vendor package or identifier.
 *   (c) Vue is **externalized**: the bundle imports `vue` as a bare module
 *       (not inlined — no Vue runtime source markers).
 *   (d) Default-entry isolation: `dist/index.{mjs,cjs}` do not pull the Vue
 *       subpath's identifiers.
 *
 * Build is a hard prerequisite — `beforeAll` fails fast if `dist/` is missing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd());
const DIST = resolve(REPO_ROOT, 'dist');
const SRC = resolve(REPO_ROOT, 'src', 'framework-vue', 'index.ts');

const VENDOR_FRAGMENTS = [
  '@opentelemetry',
  'opentelemetry',
  '@datadog',
  '@sentry',
  'SeverityNumber',
];

const VUE_SUBPATH_IDENTIFIERS = [
  'createErrorHandler',
  'safesignalErrorHandler',
  'useErrorCapture',
  'useLogError',
];

describe('./framework-vue bundle shape (Principle XI)', () => {
  beforeAll(() => {
    if (!existsSync(resolve(DIST, 'framework-vue.mjs'))) {
      throw new Error('dist/ not built — run `npm run build` first.');
    }
  });

  it('(a) src/framework-vue only type-only-imports from ../api/types.js (externals allowed)', () => {
    const text = readFileSync(SRC, 'utf8');
    const importLines = text
      .split('\n')
      .filter((l) => /\bfrom\s+['"]/.test(l) && l.includes("'"));
    for (const line of importLines) {
      const spec = line.match(/from\s+['"]([^'"]+)['"]/)?.[1] ?? '';
      if (!spec.startsWith('.')) continue; // node:/external (vue) are fine
      expect(spec).toBe('../api/types.js'); // only intra-package src import allowed
      expect(line).toMatch(/^\s*import\s+type\b/); // and it MUST be type-only
    }
  });

  it('(b) dist/framework-vue.{mjs,cjs} are vendor-neutral', () => {
    for (const file of ['framework-vue.mjs', 'framework-vue.cjs']) {
      const text = readFileSync(resolve(DIST, file), 'utf8');
      for (const fragment of VENDOR_FRAGMENTS) {
        expect(
          text,
          `${file} contains vendor fragment "${fragment}"`,
        ).not.toContain(fragment);
      }
    }
  });

  it('(c) vue is externalized (imported, not inlined) in dist/framework-vue.*', () => {
    const mjs = readFileSync(resolve(DIST, 'framework-vue.mjs'), 'utf8');
    const cjs = readFileSync(resolve(DIST, 'framework-vue.cjs'), 'utf8');
    // A bare external import/require of vue is present...
    expect(mjs).toMatch(/from\s*['"]vue['"]/);
    expect(cjs).toMatch(/require\(\s*['"]vue['"]\s*\)/);
    // ...and Vue's own runtime source is NOT inlined into the bundle.
    for (const text of [mjs, cjs]) {
      expect(text).not.toContain('__VUE_OPTIONS_API__');
      expect(text).not.toContain('vue.runtime.esm-bundler');
    }
  });

  it('(d) the default entry does not bundle the Vue subpath', () => {
    for (const file of ['index.mjs', 'index.cjs']) {
      const text = readFileSync(resolve(DIST, file), 'utf8');
      for (const ident of VUE_SUBPATH_IDENTIFIERS) {
        expect(text, `dist/${file} leaks "${ident}"`).not.toContain(ident);
      }
    }
  });
});
