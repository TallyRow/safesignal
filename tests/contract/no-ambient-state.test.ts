/**
 * Contract test: no file under `src/**` (excluding the OTel adapter
 * directory) may directly read ambient runtime state. Locks LC-9 from
 * `contracts/logger-config.md` and the "no ambient reads" guarantee from
 * `plan.md` Technical Context.
 *
 * The scan strips line and block comments before searching, so
 * documentation that *mentions* `process.env` (e.g., "the package MUST NOT
 * read process.env") does not produce a false positive.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(HERE, '..', '..', 'src');

/**
 * Path prefixes (relative to `src/`) that are excluded from the scan. The
 * OTel adapter directory is exempted by acceptance because the OTel SDK
 * itself may need limited platform introspection inside that boundary;
 * our adapter files there still avoid ambient reads, but the exclusion
 * matches the T013 acceptance contract.
 */
const EXCLUDED_PREFIXES: ReadonlyArray<string> = [
  join('internal', 'telemetry', 'otel'),
];

/** Forbidden ambient-state read patterns. */
const FORBIDDEN_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: 'process.env', regex: /\bprocess\s*\.\s*env\b/ },
  { name: 'import.meta.env', regex: /\bimport\s*\.\s*meta\s*\.\s*env\b/ },
  { name: 'window.location', regex: /\bwindow\s*\.\s*location\b/ },
  { name: 'document.cookie', regex: /\bdocument\s*\.\s*cookie\b/ },
];

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

function isExcluded(relativePath: string): boolean {
  return EXCLUDED_PREFIXES.some(
    (prefix) =>
      relativePath === prefix ||
      relativePath.startsWith(prefix + sep) ||
      relativePath.startsWith(prefix + '/'),
  );
}

/**
 * Strip block (`/* … *​/`) and line (`// …`) comments. Naive — does NOT
 * handle these constructs appearing inside string or regex literals. That
 * trade-off is intentional: false negatives in the comment-stripper would
 * leave a comment unstripped (producing a clear, debuggable test failure
 * on a documentation hit), never a real ambient-state read going undetected.
 */
function stripComments(source: string): string {
  let stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
  stripped = stripped.replace(/\/\/.*$/gm, '');
  return stripped;
}

function statExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

describe('no ambient-state reads in src/**', () => {
  it(`source root ${SRC_ROOT} exists`, () => {
    expect(statExists(SRC_ROOT)).toBe(true);
  });

  const allFiles = statExists(SRC_ROOT) ? findTsFiles(SRC_ROOT) : [];
  const scannedFiles = allFiles.filter(
    (file) => !isExcluded(relative(SRC_ROOT, file)),
  );

  it('discovers at least one .ts file', () => {
    expect(scannedFiles.length).toBeGreaterThan(0);
  });

  for (const file of scannedFiles) {
    const relPath = relative(SRC_ROOT, file);
    it(`${relPath} does not read ambient state`, () => {
      const source = readFileSync(file, 'utf8');
      const code = stripComments(source);
      for (const { name, regex } of FORBIDDEN_PATTERNS) {
        if (regex.test(code)) {
          throw new Error(
            `${relPath} contains a direct read of ${name}. ` +
              `The package must not consult ambient state; ` +
              `pass it explicitly via LoggerConfig.`,
          );
        }
      }
    });
  }
});
