/**
 * Contract test: deprecate-before-remove gate verdict logic
 * (specs/011-deprecate-before-remove — FR-001/002/003/005, contracts/
 * api-surface-check.md). Exercises the pure `compareSurface` rule over
 * committed fixtures so the contract holds independently of the live package
 * surface.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  AllowEntry,
  PublicSurface,
} from '../../scripts/api/compare-surface.mjs';
import { compareSurface } from '../../scripts/api/compare-surface.mjs';

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'api-surface',
);

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixtures, name), 'utf8')) as T;
}

const baseline = load<PublicSurface>('baseline.json');
const allow = load<AllowEntry[]>('allow.json');

describe('deprecate-before-remove gate verdict', () => {
  it('FAILS closed on an undeprecated removal, naming the symbol', () => {
    const current = load<PublicSurface>('current-removed.json');
    const verdict = compareSurface(baseline, current, []);
    expect(verdict.pass).toBe(false);
    expect(verdict.violations).toContainEqual(
      expect.objectContaining({ name: 'createLogger', class: 'removed' }),
    );
  });

  it('PASSES a removal that was @deprecated in the baseline', () => {
    const current = load<PublicSurface>('current-removed-deprecated.json');
    const verdict = compareSurface(baseline, current, []);
    expect(verdict.pass).toBe(true);
    expect(verdict.removed).toContainEqual(
      expect.objectContaining({ name: 'oldHelper', excusedBy: 'deprecated' }),
    );
  });

  it('PASSES a pure addition without any acknowledgment', () => {
    const current = load<PublicSurface>('current-added.json');
    const verdict = compareSurface(baseline, current, []);
    expect(verdict.pass).toBe(true);
    expect(verdict.added).toContainEqual(
      expect.objectContaining({ name: 'newHelper', class: 'added' }),
    );
  });

  it('FAILS a signature change with no allow-entry and no deprecation', () => {
    const current = load<PublicSurface>('current-changed.json');
    const verdict = compareSurface(baseline, current, []);
    expect(verdict.pass).toBe(false);
    expect(verdict.violations).toContainEqual(
      expect.objectContaining({ name: 'createLogger', class: 'changed' }),
    );
  });

  it('PASSES a signature change cleared by a matching allow-entry', () => {
    const current = load<PublicSurface>('current-changed.json');
    const verdict = compareSurface(baseline, current, allow);
    expect(verdict.pass).toBe(true);
    expect(verdict.changed).toContainEqual(
      expect.objectContaining({
        name: 'createLogger',
        excusedBy: 'allow-list',
      }),
    );
  });

  it('PASSES a signature change on a baseline-deprecated symbol', () => {
    const current: PublicSurface = {
      version: '1.1.0',
      symbols: baseline.symbols.map((s) =>
        s.name === 'oldHelper'
          ? { ...s, signature: 'function oldHelper(x: number): void;' }
          : s,
      ),
    };
    const verdict = compareSurface(baseline, current, []);
    expect(verdict.pass).toBe(true);
    expect(verdict.changed).toContainEqual(
      expect.objectContaining({ name: 'oldHelper', excusedBy: 'deprecated' }),
    );
  });

  it('treats a whole removed entry point as per-symbol removals', () => {
    const current = load<PublicSurface>('current-entrypoint-removed.json');
    const verdict = compareSurface(baseline, current, []);
    expect(verdict.pass).toBe(false);
    expect(verdict.violations).toContainEqual(
      expect.objectContaining({
        entry: './testing',
        name: 'assertContract',
        class: 'removed',
      }),
    );
  });

  it('does not flag a symbol that was never in the baseline (add-then-remove)', () => {
    const current = load<PublicSurface>('current-add-then-removed.json');
    const verdict = compareSurface(baseline, current, []);
    expect(verdict.pass).toBe(true);
    expect(verdict.removed).toHaveLength(0);
    expect(verdict.changed).toHaveLength(0);
    expect(verdict.added).toHaveLength(0);
  });

  it('does not exempt a removal just because the version bumped', () => {
    const current: PublicSurface = {
      version: '2.0.0',
      symbols: baseline.symbols.filter((s) => s.name !== 'createLogger'),
    };
    const verdict = compareSurface(baseline, current, []);
    expect(verdict.pass).toBe(false);
    expect(verdict.violations).toContainEqual(
      expect.objectContaining({ name: 'createLogger', class: 'removed' }),
    );
  });
});
