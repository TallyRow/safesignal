/**
 * Contract test: React-import / no-globals boundary
 * (specs/018-react-error-boundary — FR-R6/R8, SC-005/SC-006).
 *
 * Mirrors `internal-import-boundary.test.ts`. Three locked invariants:
 *
 *   (a) Only `src/framework-react/**` may import `react` — no other `src/`
 *       module pulls React in (keeps the core + every other subpath
 *       framework-neutral, Principle IV).
 *   (b) `src/framework-react/**` attaches no globals and patches nothing —
 *       no `window.onerror`, `addEventListener`, console patch, or timer
 *       (Principle VIII; the no-globals contrast with `./capture`).
 *   (c) The built default entry `dist/index.{mjs,cjs}` imports zero React and
 *       exposes none of the React-subpath identifiers.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const SRC_ROOT = join(REPO_ROOT, 'src');
const FRAMEWORK_REACT_PREFIX = join('framework-react');
const DIST = join(REPO_ROOT, 'dist');

/** Strip block + line comments so doc prose ("no window.onerror") isn't scanned as code. */
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

/** Match a static/dynamic/require import of `react` (exact or subpath). */
const REACT_IMPORT_RE =
  /(?:from\s+['"]react(?:\/[^'"]*)?['"]|import\s*\(\s*['"]react(?:\/[^'"]*)?['"]\s*\)|require\(\s*['"]react(?:\/[^'"]*)?['"]\s*\))/;

describe('React-import boundary (FR-R8 / SC-005)', () => {
  it('(a) only src/framework-react/** imports `react`', () => {
    const offenders: string[] = [];
    for (const file of collectTsFiles(SRC_ROOT)) {
      const relToSrc = relative(SRC_ROOT, file);
      if (relToSrc.split(sep)[0] === FRAMEWORK_REACT_PREFIX) continue;
      if (REACT_IMPORT_RE.test(stripComments(readFileSync(file, 'utf8')))) {
        offenders.push(relToSrc);
      }
    }
    expect(
      offenders,
      `Only src/framework-react/** may import react. Offenders: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});

describe('No-globals boundary (FR-R6 / SC-006)', () => {
  it('(b) src/framework-react/** patches no globals and attaches no listeners', () => {
    const forbidden: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /\bwindow\s*\.\s*onerror\b/, label: 'window.onerror' },
      {
        pattern: /\bonunhandledrejection\b/,
        label: 'onunhandledrejection',
      },
      { pattern: /\.addEventListener\s*\(/, label: 'addEventListener(' },
      { pattern: /\bsetInterval\s*\(/, label: 'setInterval(' },
      { pattern: /\bsetTimeout\s*\(/, label: 'setTimeout(' },
    ];
    const reactDir = join(SRC_ROOT, FRAMEWORK_REACT_PREFIX);
    const hits: string[] = [];
    for (const file of collectTsFiles(reactDir)) {
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const { pattern, label } of forbidden) {
        if (pattern.test(text)) {
          hits.push(`${relative(SRC_ROOT, file)} → ${label}`);
        }
      }
    }
    expect(
      hits,
      `src/framework-react/** must attach no globals / patch nothing. Hits: ${hits.join(', ')}`,
    ).toEqual([]);
  });
});

describe('Default-entry React neutrality (FR-R8 / SC-005)', () => {
  beforeAll(() => {
    if (!existsSync(join(DIST, 'index.mjs'))) {
      throw new Error('dist/ not built — run `npm run build` first.');
    }
  });

  it.each([
    'index.mjs',
    'index.cjs',
  ])('(c) dist/%s imports zero React and exposes no React-subpath identifier', (file) => {
    const text = readFileSync(join(DIST, file), 'utf8');
    expect(REACT_IMPORT_RE.test(text)).toBe(false);
    expect(text).not.toContain('LogErrorBoundary');
    expect(text).not.toContain('useLogError');
  });
});
