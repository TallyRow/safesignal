/**
 * Contract test: the published `.d.ts` surface must not mention any
 * OpenTelemetry concept. Locks PA-5 from `contracts/public-api.md` and the
 * "no OTel types in public API" mitigation #5 from `plan.md`.
 *
 * REQUIRES `npm run build` to have run. The test fails loudly with a
 * helpful message if `dist/index.d.ts` is missing so the build step is not
 * silently skipped in CI.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const DIST_INDEX_DTS = join(REPO_ROOT, 'dist', 'index.d.ts');
const DIST_TESTING_DTS = join(REPO_ROOT, 'dist', 'testing.d.ts');

/**
 * Substrings that must NEVER appear in the published declarations (case-
 * insensitive). The package documents OpenTelemetry as an internal-only
 * dependency; any mention here would indicate a leak through the public
 * surface or a re-exported OTel type.
 */
const FORBIDDEN_STRINGS = [
  'opentelemetry',
  '@opentelemetry',
];

/**
 * OTel concept names that must not appear as exported identifiers. Word-
 * boundary matched so a project-local identifier like `MyTracer` does not
 * trigger the test.
 */
const FORBIDDEN_NAMES = [
  'SeverityNumber',
  'LoggerProvider',
  'LogRecordProcessor',
  'LogRecordExporter',
  'ReadableLogRecord',
  'Span',
  'SpanContext',
  'Tracer',
  'TracerProvider',
  'TraceId',
  'TraceFlags',
  'Exporter',
  'Meter',
  'MeterProvider',
];

interface DtsCheck {
  label: string;
  path: string;
  source: string | undefined;
}

function loadDts(path: string, label: string): DtsCheck {
  if (!existsSync(path)) {
    return { label, path, source: undefined };
  }
  return { label, path, source: readFileSync(path, 'utf8') };
}

const checks: ReadonlyArray<DtsCheck> = [
  loadDts(DIST_INDEX_DTS, 'dist/index.d.ts'),
  loadDts(DIST_TESTING_DTS, 'dist/testing.d.ts'),
];

describe('public .d.ts surface', () => {
  for (const check of checks) {
    describe(check.label, () => {
      it('exists (run `npm run build` first)', () => {
        expect(
          check.source !== undefined,
          `${check.path} not found — run \`npm run build\` before this test.`,
        ).toBe(true);
      });

      it.each(FORBIDDEN_STRINGS)(
        'does not contain the forbidden substring %s',
        (forbidden) => {
          if (check.source === undefined) return;
          expect(
            check.source.toLowerCase().includes(forbidden.toLowerCase()),
            `${check.label} contains forbidden substring '${forbidden}'`,
          ).toBe(false);
        },
      );

      it.each(FORBIDDEN_NAMES)(
        'does not expose the OTel name %s',
        (name) => {
          if (check.source === undefined) return;
          const regex = new RegExp(`\\b${name}\\b`);
          expect(
            regex.test(check.source),
            `${check.label} exposes forbidden OTel name '${name}'`,
          ).toBe(false);
        },
      );
    });
  }
});
