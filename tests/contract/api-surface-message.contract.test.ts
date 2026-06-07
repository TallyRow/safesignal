/**
 * Contract test: gate failure output is actionable
 * (specs/011-deprecate-before-remove — FR-010 / SC-006). Every violation MUST
 * name the offending symbol and state the deprecate-before-remove remediation —
 * no opaque failures.
 */

import { describe, expect, it } from 'vitest';
import type { GateVerdict } from '../../scripts/api/compare-surface.mjs';
import { formatVerdict } from '../../scripts/api/compare-surface.mjs';

const removalVerdict: GateVerdict = {
  removed: [{ entry: '.', name: 'scrubUrl', class: 'removed' }],
  changed: [],
  added: [],
  violations: [{ entry: '.', name: 'scrubUrl', class: 'removed' }],
  pass: false,
};

const changeVerdict: GateVerdict = {
  removed: [],
  changed: [
    {
      entry: './transport-beacon',
      name: 'createBeaconTransport',
      class: 'changed',
    },
  ],
  added: [],
  violations: [
    {
      entry: './transport-beacon',
      name: 'createBeaconTransport',
      class: 'changed',
    },
  ],
  pass: false,
};

describe('gate failure message', () => {
  it('names the removed symbol and the deprecate-before-remove remediation', () => {
    const { ok, remediation } = formatVerdict(removalVerdict, '1.3.0');
    expect(ok).toBe(false);
    expect(remediation).toContain('scrubUrl');
    expect(remediation).toContain('REMOVED');
    expect(remediation).toContain('@deprecated');
    expect(remediation).toContain('migration');
    expect(remediation).toContain('one minor release');
  });

  it('names a changed symbol and points to the allow-list path', () => {
    const { remediation } = formatVerdict(changeVerdict, '1.3.0');
    expect(remediation).toContain('createBeaconTransport');
    expect(remediation).toContain('api/surface-allow.json');
  });

  it('reports a clean pass without a remediation block', () => {
    const pass: GateVerdict = {
      removed: [],
      changed: [],
      added: [],
      violations: [],
      pass: true,
    };
    const { ok, remediation, report } = formatVerdict(pass, '1.3.0');
    expect(ok).toBe(true);
    expect(remediation).toBeNull();
    expect(report.join('\n')).toContain('PASS');
  });
});
