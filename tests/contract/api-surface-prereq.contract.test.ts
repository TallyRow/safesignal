/**
 * Contract test: gate entrypoint prerequisites and bootstrap edge cases
 * (specs/011-deprecate-before-remove — FR-008 / Principle IX honest
 * prerequisites; spec Edge Cases "no prior baseline"). Runs the real
 * `check-surface.mjs` entrypoint in throwaway working directories.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const GATE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'scripts',
  'api',
  'check-surface.mjs',
);

const DIST_DECLS = [
  'index.d.ts',
  'testing.d.ts',
  'transport-beacon.d.ts',
  'transport-otlp.d.ts',
];

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runGate(cwd: string): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [GATE], {
      cwd,
      encoding: 'utf8',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      status: e.status ?? 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
    };
  }
}

describe('api-surface gate prerequisites', () => {
  let work: string;

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'api-surface-'));
  });

  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  it('fails closed with an actionable message when dist/ is absent', () => {
    const result = runGate(work);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('npm run build');
  });

  it('passes (bootstraps) when dist exists but no baseline is committed', () => {
    mkdirSync(join(work, 'dist'), { recursive: true });
    for (const file of DIST_DECLS) {
      writeFileSync(join(work, 'dist', file), 'export {};\n');
    }
    const result = runGate(work);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('api:extract');
  });
});
