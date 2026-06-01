// Deprecate-before-remove gate entrypoint for @tallyrow/safesignal.
//
// Invoked by `npm run api:check` locally and by the `api-surface` CI job. A
// cross-platform Node ESM entrypoint (no Bash wrapper) so the verdict and exit
// code are identical on Windows/macOS/Linux for the same source state
// (Principle IX). Fails closed (exit 1) on any unexcused public-API removal or
// incompatible change.
//
// Spec: specs/011-deprecate-before-remove/ (FR-001/002/003/008/010,
// contracts/api-surface-check.md).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareSurface, formatVerdict } from './compare-surface.mjs';
import { extractSurface } from './extract-surface.mjs';

const cwd = process.cwd();
const DIST_DECLS = [
  'index.d.ts',
  'testing.d.ts',
  'transport-beacon.d.ts',
  'transport-otlp.d.ts',
];
const BASELINE_PATH = join(cwd, 'api', 'surface.json');
const ALLOW_PATH = join(cwd, 'api', 'surface-allow.json');

// Honest prerequisite (Principle IX): the gate needs the built declarations.
const missing = DIST_DECLS.filter((f) => !existsSync(join(cwd, 'dist', f)));
if (missing.length > 0) {
  process.stderr.write(
    `api-surface: missing built declaration file(s) in dist/ ` +
      `(${missing.join(', ')}).\n` +
      '  Run `npm run build` first, then `npm run api:check`.\n',
  );
  process.exit(1);
}

// No prior baseline (first adoption): nothing to break — pass and guide.
if (!existsSync(BASELINE_PATH)) {
  process.stdout.write(
    'api-surface: no baseline at api/surface.json yet — nothing to compare.\n' +
      '  Seed it with `npm run api:extract` and commit it.\n',
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const allow = existsSync(ALLOW_PATH)
  ? JSON.parse(readFileSync(ALLOW_PATH, 'utf8'))
  : [];
const current = extractSurface({ cwd });

const verdict = compareSurface(baseline, current, allow);
const formatted = formatVerdict(verdict, baseline.version);

process.stdout.write(`${formatted.report.join('\n')}\n`);

if (formatted.ok) {
  process.exit(0);
}

process.stderr.write(`api-surface: ${formatted.remediation}\n`);
process.exit(1);
