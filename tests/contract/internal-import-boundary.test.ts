/**
 * Contract test: source-tree boundary scan.
 *
 * Two locked invariants:
 *
 *   1. The `@opentelemetry/*` packages may be imported ONLY from inside
 *      `src/internal/telemetry/otel/**`. Mitigation #1 from plan.md.
 *
 *   2. The public runtime entry `src/index.ts` and the testing-subpath
 *      entry `src/testing/index.ts` MUST NOT re-export from
 *      `src/internal/**` (the documented "hidden internals" boundary)
 *      or — for the runtime entry — from `src/testing/**`.
 *
 * Deviation from the literal T014 acceptance text:
 *   The acceptance says `src/index.ts` may only re-export from `src/api/`.
 *   That contradicts T018's design (`ConsoleTransport` from `src/transport/`,
 *   `scrubUrl` from `src/pipeline/`, etc., are listed as public exports in
 *   `contracts/public-api.md`). The exact public surface is locked by
 *   `tests/contract/public-api.contract.test.ts` (T019) once it lands; this
 *   test enforces the architectural rule the acceptance *intended* — no
 *   internal leakage — without contradicting the public API contract.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(HERE, '..', '..', 'src');
const PUBLIC_ENTRY = join(SRC_ROOT, 'index.ts');
const TESTING_ENTRY = join(SRC_ROOT, 'testing', 'index.ts');

/** Path (relative to `src/`) that is the SOLE permitted home for @opentelemetry/* imports. */
const OTEL_ALLOWED_PREFIX = join('internal', 'telemetry', 'otel');

/** Path prefixes that must never appear in re-exports from a public entry. */
const FORBIDDEN_REEXPORT_PREFIXES_FOR_RUNTIME = [
  join('src', 'internal'),
  join('src', 'testing'),
];
const FORBIDDEN_REEXPORT_PREFIXES_FOR_TESTING = [
  join('src', 'internal'),
];

/**
 * Match either a static import or a dynamic `import('...')` whose target
 * starts with `@opentelemetry/`. Captures the full module specifier.
 */
const OTEL_IMPORT_RE = /(?:from\s+['"](@opentelemetry\/[^'"]+)['"]|import\s*\(\s*['"](@opentelemetry\/[^'"]+)['"]\s*\))/g;

/**
 * Match common re-export forms and capture the source module path:
 *   export * from '...'
 *   export * as ns from '...'
 *   export { a, b as c } from '...'
 *   export type { Foo } from '...'
 */
const REEXPORT_RE = /^\s*export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[\s\S]*?\})\s+from\s+['"]([^'"]+)['"]/gm;

function findTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      findTsFiles(full, out);
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source: string): string {
  let stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
  stripped = stripped.replace(/\/\/.*$/gm, '');
  return stripped;
}

function isUnderPrefix(relativePath: string, prefix: string): boolean {
  return (
    relativePath === prefix ||
    relativePath.startsWith(prefix + sep) ||
    relativePath.startsWith(prefix + '/')
  );
}

function findOtelImports(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(OTEL_IMPORT_RE)) {
    const specifier = match[1] ?? match[2];
    if (specifier !== undefined) out.push(specifier);
  }
  return out;
}

function findReexportPaths(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(REEXPORT_RE)) {
    const path = match[1];
    if (path !== undefined) out.push(path);
  }
  return out;
}

/**
 * Resolve a re-export path (e.g. `'./api/types.js'`) to a repo-relative
 * path against an entry's containing directory. Used so we can ask
 * "does this resolve under `src/internal/...`?"
 */
function resolveReexportPath(entryFile: string, importPath: string): string {
  const entryDir = dirname(entryFile);
  // Strip a trailing `.js` if present — tsc bundler resolution maps it to `.ts`.
  const normalizedImport = importPath.replace(/\.(?:js|mjs|cjs)$/, '');
  const absolute = resolve(entryDir, normalizedImport);
  return relative(resolve(SRC_ROOT, '..'), absolute);
}

describe('source-tree boundary scan', () => {
  // ──────────────────────────────────────────────────────────────────────
  // 1. OTel import boundary
  // ──────────────────────────────────────────────────────────────────────
  describe('@opentelemetry/* imports are confined to src/internal/telemetry/otel/**', () => {
    const allFiles = findTsFiles(SRC_ROOT);

    for (const file of allFiles) {
      const rel = relative(SRC_ROOT, file);
      const inAllowedDir = isUnderPrefix(rel, OTEL_ALLOWED_PREFIX);
      const label = `${rel}${inAllowedDir ? ' (permitted)' : ''}`;

      it(`${label}: respects the OTel import boundary`, () => {
        const source = stripComments(readFileSync(file, 'utf8'));
        const matches = findOtelImports(source);

        if (inAllowedDir) {
          // OTel imports are permitted here; no assertion needed beyond
          // the test running. Use a tautology so the test still runs.
          expect(true).toBe(true);
        } else {
          expect(
            matches,
            `${rel} imports from @opentelemetry/* but is outside ` +
              `src/${OTEL_ALLOWED_PREFIX}/. Move the OTel coupling into the ` +
              `adapter or expose it through TelemetryBackend.\nFound: ${matches.join(', ')}`,
          ).toEqual([]);
        }
      });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // 2. Public-entry re-export boundary
  // ──────────────────────────────────────────────────────────────────────
  describe('public entries do not re-export from internal directories', () => {
    it('src/index.ts does not re-export from src/internal/** or src/testing/**', () => {
      const source = stripComments(readFileSync(PUBLIC_ENTRY, 'utf8'));
      const paths = findReexportPaths(source);
      const violations: string[] = [];

      for (const importPath of paths) {
        // Bare module specifiers (e.g. '@opentelemetry/api') are caught by
        // the OTel check above. Only relative re-exports are evaluated here.
        if (!importPath.startsWith('.')) continue;
        const resolved = resolveReexportPath(PUBLIC_ENTRY, importPath);
        for (const forbidden of FORBIDDEN_REEXPORT_PREFIXES_FOR_RUNTIME) {
          if (isUnderPrefix(resolved, forbidden)) {
            violations.push(`${importPath} → ${resolved} (forbidden prefix: ${forbidden})`);
          }
        }
      }

      expect(
        violations,
        `src/index.ts re-exports from a forbidden directory:\n  ${violations.join('\n  ')}`,
      ).toEqual([]);
    });

    it('src/testing/index.ts does not re-export from src/internal/**', () => {
      const source = stripComments(readFileSync(TESTING_ENTRY, 'utf8'));
      const paths = findReexportPaths(source);
      const violations: string[] = [];

      for (const importPath of paths) {
        if (!importPath.startsWith('.')) continue;
        const resolved = resolveReexportPath(TESTING_ENTRY, importPath);
        for (const forbidden of FORBIDDEN_REEXPORT_PREFIXES_FOR_TESTING) {
          if (isUnderPrefix(resolved, forbidden)) {
            violations.push(`${importPath} → ${resolved} (forbidden prefix: ${forbidden})`);
          }
        }
      }

      expect(
        violations,
        `src/testing/index.ts re-exports from a forbidden directory:\n  ${violations.join('\n  ')}`,
      ).toEqual([]);
    });
  });
});
