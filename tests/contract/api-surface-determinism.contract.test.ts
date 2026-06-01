/**
 * Contract test: the surface extractor is deterministic
 * (specs/011-deprecate-before-remove — FR-008 / SC-003, Principle IX).
 * Re-extracting the same build twice MUST yield byte-identical output, so the
 * gate's verdict is reproducible across local and CI runs.
 *
 * Requires a built dist/ (CI consumes the build artifact; locally run
 * `npm run build` first).
 */

import { describe, expect, it } from 'vitest';
import {
  extractSurface,
  serializeSurface,
} from '../../scripts/api/extract-surface.mjs';

describe('surface extractor determinism', () => {
  it('produces byte-identical output across re-extractions', () => {
    const first = serializeSurface(extractSurface());
    const second = serializeSurface(extractSurface());
    expect(second).toBe(first);
  });

  it('emits sorted symbols and a trailing newline', () => {
    const out = serializeSurface(extractSurface());
    expect(out.endsWith('\n')).toBe(true);

    const { symbols } = extractSurface();
    const keys = symbols.map((s) => `${s.entry} ${s.name}`);
    const sorted = [...keys].sort((a, b) => a.localeCompare(b));
    expect(keys).toEqual(sorted);
  });
});
