/**
 * Contract test: Vue-import / no-globals boundary
 * (specs/020-vue-error-handler — FR-V8/V10, SC-004).
 *
 * Mirrors `react-import-boundary.test.ts`. Three locked invariants:
 *
 *   (a) Only `src/framework-vue/**` may import `vue` — no other `src/` module
 *       pulls Vue in (keeps the core + every other subpath framework-neutral,
 *       Principle IV).
 *   (b) `src/framework-vue/**` attaches no globals and patches nothing —
 *       no `window.onerror`, `addEventListener`, console patch, or timer
 *       (Principle VIII; the no-globals contrast with `./capture`).
 *   (c) The built default entry `dist/index.{mjs,cjs}` imports zero Vue and
 *       exposes none of the Vue-subpath identifiers.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const SRC_ROOT = join(REPO_ROOT, 'src');
const FRAMEWORK_VUE_PREFIX = join('framework-vue');
const DIST = join(REPO_ROOT, 'dist');

/** Strip block + line comments so doc prose isn't scanned as code. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Recursively collect every .ts file under `dir` (absolute paths). */
function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Match a static/dynamic/require import of `vue` (exact or subpath). */
const VUE_IMPORT_RE =
  /(?:from\s+['"]vue(?:\/[^'"]*)?['"]|import\s*\(\s*['"]vue(?:\/[^'"]*)?['"]\s*\)|require\(\s*['"]vue(?:\/[^'"]*)?['"]\s*\))/;

describe('Vue-import boundary (FR-V10 / SC-004)', () => {
  it('(a) only src/framework-vue/** imports `vue`', () => {
    const offenders: string[] = [];
    for (const file of collectTsFiles(SRC_ROOT)) {
      const relToSrc = relative(SRC_ROOT, file);
      if (relToSrc.split(sep)[0] === FRAMEWORK_VUE_PREFIX) continue;
      if (VUE_IMPORT_RE.test(stripComments(readFileSync(file, 'utf8')))) {
        offenders.push(relToSrc);
      }
    }
    expect(
      offenders,
      `Only src/framework-vue/** may import vue. Offenders: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});

describe('No-globals boundary (FR-V8 / SC-004)', () => {
  it('(b) src/framework-vue/** patches no globals and attaches no listeners', () => {
    const forbidden: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /\bwindow\s*\.\s*onerror\b/, label: 'window.onerror' },
      { pattern: /\bonunhandledrejection\b/, label: 'onunhandledrejection' },
      { pattern: /\.addEventListener\s*\(/, label: 'addEventListener(' },
      { pattern: /\bsetInterval\s*\(/, label: 'setInterval(' },
      { pattern: /\bsetTimeout\s*\(/, label: 'setTimeout(' },
    ];
    const vueDir = join(SRC_ROOT, FRAMEWORK_VUE_PREFIX);
    const hits: string[] = [];
    for (const file of collectTsFiles(vueDir)) {
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const { pattern, label } of forbidden) {
        if (pattern.test(text)) {
          hits.push(`${relative(SRC_ROOT, file)} → ${label}`);
        }
      }
    }
    expect(
      hits,
      `src/framework-vue/** must attach no globals / patch nothing. Hits: ${hits.join(', ')}`,
    ).toEqual([]);
  });
});

describe('Default-entry Vue neutrality (FR-V10 / SC-004)', () => {
  beforeAll(() => {
    if (!existsSync(join(DIST, 'index.mjs'))) {
      throw new Error('dist/ not built — run `npm run build` first.');
    }
  });

  it.each([
    'index.mjs',
    'index.cjs',
  ])('(c) dist/%s imports zero Vue and exposes no Vue-subpath identifier', (file) => {
    const text = readFileSync(join(DIST, file), 'utf8');
    expect(VUE_IMPORT_RE.test(text)).toBe(false);
    expect(text).not.toContain('createErrorHandler');
    expect(text).not.toContain('safesignalErrorHandler');
    expect(text).not.toContain('useErrorCapture');
  });
});
