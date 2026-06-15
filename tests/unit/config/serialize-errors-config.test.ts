/**
 * ES-13 (`specs/023-error-serialization-depth/contracts/error-serialization.md`):
 * `serializeErrors` config normalization — `true` → documented defaults
 * (maxCauseDepth 8, maxMembers 10, maxFields 16, maxNodes 50); object keys
 * clamp to documented ranges ([1,16] / [1,100] / [0,64] / [1,256]) with one
 * `onInternalError` notice per clamped key; absent/false → disabled.
 */

import { describe, expect, it, vi } from 'vitest';

import { normalizeConfig } from '../../../src/config/config.js';

function clampNotices(
  onInternalError: ReturnType<typeof vi.fn>,
): Array<Error & { code?: string }> {
  return onInternalError.mock.calls
    .map((c) => c[0] as Error & { code?: string })
    .filter((err) => err.code === 'error_serialize_clamped');
}

describe('ES-13: serializeErrors disabled states', () => {
  it('absent → undefined (disabled)', () => {
    const normalized = normalizeConfig({});
    expect(normalized.serializeErrors).toBeUndefined();
  });

  it('false → undefined (disabled)', () => {
    const normalized = normalizeConfig({ serializeErrors: false });
    expect(normalized.serializeErrors).toBeUndefined();
  });
});

describe('ES-13: serializeErrors enabled with defaults', () => {
  it('true → documented defaults', () => {
    const normalized = normalizeConfig({ serializeErrors: true });
    expect(normalized.serializeErrors).toEqual({
      maxCauseDepth: 8,
      maxMembers: 10,
      maxFields: 16,
      maxNodes: 50,
    });
  });

  it('empty object → documented defaults, no notices', () => {
    const onInternalError = vi.fn();
    const normalized = normalizeConfig({
      serializeErrors: {},
      onInternalError,
    });
    expect(normalized.serializeErrors).toEqual({
      maxCauseDepth: 8,
      maxMembers: 10,
      maxFields: 16,
      maxNodes: 50,
    });
    expect(clampNotices(onInternalError)).toHaveLength(0);
  });

  it('in-range overrides are applied verbatim, no notices', () => {
    const onInternalError = vi.fn();
    const normalized = normalizeConfig({
      serializeErrors: {
        maxCauseDepth: 4,
        maxMembers: 5,
        maxFields: 0,
        maxNodes: 25,
      },
      onInternalError,
    });
    expect(normalized.serializeErrors).toEqual({
      maxCauseDepth: 4,
      maxMembers: 5,
      maxFields: 0,
      maxNodes: 25,
    });
    expect(clampNotices(onInternalError)).toHaveLength(0);
  });
});

describe('ES-13: out-of-range keys clamp with one notice per key', () => {
  it('above-max values clamp to documented max', () => {
    const onInternalError = vi.fn();
    const normalized = normalizeConfig({
      serializeErrors: {
        maxCauseDepth: 99, // max 16
        maxMembers: 1000, // max 100
        maxFields: 500, // max 64
        maxNodes: 9999, // max 256
      },
      onInternalError,
    });
    expect(normalized.serializeErrors).toEqual({
      maxCauseDepth: 16,
      maxMembers: 100,
      maxFields: 64,
      maxNodes: 256,
    });
    const notices = clampNotices(onInternalError);
    expect(notices).toHaveLength(4);
    const messages = notices.map((n) => n.message);
    expect(messages.some((m) => m.includes('maxCauseDepth'))).toBe(true);
    expect(messages.some((m) => m.includes('maxMembers'))).toBe(true);
    expect(messages.some((m) => m.includes('maxFields'))).toBe(true);
    expect(messages.some((m) => m.includes('maxNodes'))).toBe(true);
  });

  it('below-min values clamp to documented min (maxFields allows 0)', () => {
    const onInternalError = vi.fn();
    const normalized = normalizeConfig({
      serializeErrors: {
        maxCauseDepth: 0, // min 1
        maxMembers: -3, // min 1
        maxFields: -1, // min 0
        maxNodes: 0, // min 1
      },
      onInternalError,
    });
    expect(normalized.serializeErrors).toEqual({
      maxCauseDepth: 1,
      maxMembers: 1,
      maxFields: 0,
      maxNodes: 1,
    });
    expect(clampNotices(onInternalError)).toHaveLength(4);
  });

  it('a single out-of-range key emits exactly one notice; others stay default', () => {
    const onInternalError = vi.fn();
    const normalized = normalizeConfig({
      serializeErrors: { maxMembers: 101 },
      onInternalError,
    });
    expect(normalized.serializeErrors).toEqual({
      maxCauseDepth: 8,
      maxMembers: 100,
      maxFields: 16,
      maxNodes: 50,
    });
    const notices = clampNotices(onInternalError);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toMatch(/maxMembers/);
    expect(notices[0]!.message).toMatch(/100/);
  });

  it('non-finite values fall back to the default for that key without a notice', () => {
    const onInternalError = vi.fn();
    const normalized = normalizeConfig({
      serializeErrors: { maxCauseDepth: Number.NaN },
      onInternalError,
    });
    expect(normalized.serializeErrors).toEqual({
      maxCauseDepth: 8,
      maxMembers: 10,
      maxFields: 16,
      maxNodes: 50,
    });
    expect(clampNotices(onInternalError)).toHaveLength(0);
  });

  it('non-integer in-range values floor to integers', () => {
    const normalized = normalizeConfig({
      serializeErrors: { maxCauseDepth: 4.9 },
    });
    expect(normalized.serializeErrors?.maxCauseDepth).toBe(4);
  });
});
