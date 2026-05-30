/**
 * T009 [US1] — Unit tests for `buildResource` (OP-2 / D3).
 *
 * The Resource carries runtime-global identity only (service.* +
 * deployment.environment); module.* is per-record (asserted in the
 * serializer test). Absent fields are omitted.
 */

import { describe, expect, it } from 'vitest';

import type { LogContext } from '../../../src/api/types.js';
import { buildResource } from '../../../src/transport-otlp/resource.js';

describe('buildResource', () => {
  it('maps application + environment to standard semantic-convention keys', () => {
    const ctx: LogContext = {
      application: { name: 'checkout', version: '4.2.0' },
      environment: 'production',
    };
    expect(buildResource(ctx).attributes).toEqual([
      { key: 'service.name', value: { stringValue: 'checkout' } },
      { key: 'service.version', value: { stringValue: '4.2.0' } },
      { key: 'deployment.environment', value: { stringValue: 'production' } },
    ]);
  });

  it('omits absent identity fields', () => {
    expect(buildResource({ application: { name: 'a' } }).attributes).toEqual([
      { key: 'service.name', value: { stringValue: 'a' } },
    ]);
  });

  it('does NOT place module identity on the Resource (it is per-record)', () => {
    const ctx: LogContext = {
      application: { name: 'a' },
      module: { name: 'reco', version: '1.0.0' },
    };
    const keys = buildResource(ctx).attributes.map((kv) => kv.key);
    expect(keys).not.toContain('module.name');
    expect(keys).not.toContain('module.version');
  });

  it('returns an empty attribute list for an empty context', () => {
    expect(buildResource({}).attributes).toEqual([]);
  });
});
