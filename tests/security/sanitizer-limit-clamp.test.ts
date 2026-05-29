/**
 * Sanitizer-limit clamp security test (T047).
 *
 * Locks LC-10 from `contracts/logger-config.md` and S-10 from
 * `contracts/sanitization.md`:
 *   - Consumers MAY tighten sanitizer limits but MUST NOT raise them
 *     above the documented Max.
 *   - Any value above Max is clamped to Max, and any value below Min
 *     is clamped to Min, with one `onInternalError` notice per
 *     `configureLogging()` call per clamped key.
 *
 * Documented bounds (`contracts/sanitization.md`):
 *   maxDepth          default  8, min  1, max     16
 *   maxStringLength   default  8192, min 64, max 65536
 *   maxArrayLength    default  1000, min  1, max 10000
 *   maxAttributeCount default  256, min  1, max  4096
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { configureLogging, createLogger } from '../../src/index.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const APP = { name: 'sanitizer-limit-clamp', version: '1.0.0' };

let capture = makeCapturingTransport('capture');
let onInternalError = vi.fn();

beforeEach(() => {
  capture = makeCapturingTransport('capture');
  onInternalError = vi.fn();
});

function clampNotices(): Array<Error & { code?: string }> {
  return onInternalError.mock.calls
    .map((c) => c[0] as Error & { code?: string })
    .filter((err) => err.code === 'sanitizer_limit_clamped');
}

// ---------------------------------------------------------------------------
// S-10 / LC-10: maxDepth above max clamps to 16
// ---------------------------------------------------------------------------

describe('S-10 / LC-10: maxDepth=99 clamps to 16 and emits one onInternalError', () => {
  it('emits exactly one clamp notice on configureLogging', () => {
    configureLogging({
      application: APP,
      transports: [capture],
      sanitizerLimits: { maxDepth: 99 },
      onInternalError,
    });
    const notices = clampNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toMatch(/maxDepth/);
    expect(notices[0]!.message).toMatch(/16/);
  });

  it('the runtime enforces the clamped max (16), not the supplied 99', () => {
    configureLogging({
      application: APP,
      level: 'debug',
      transports: [capture],
      sanitizerLimits: { maxDepth: 99 },
      onInternalError,
    });
    // Build an attribute object 20 levels deep.
    const deep: Record<string, unknown> = {};
    let cursor: Record<string, unknown> = deep;
    for (let i = 0; i < 20; i++) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }
    cursor.leaf = 'deepest';
    createLogger().info('deep', { d: deep as never });
    // Walk into the captured event. The runtime stops at the clamped
    // max (16), not 99 — so the "[MaxDepth]" marker is reachable
    // within the first ~20 hops.
    let probe: unknown = capture.calls[0]!.attributes.d;
    let hops = 0;
    while (
      hops < 30 &&
      probe !== null &&
      typeof probe === 'object' &&
      'next' in (probe as Record<string, unknown>)
    ) {
      probe = (probe as Record<string, unknown>).next;
      hops++;
    }
    expect(probe).toBe('[MaxDepth]');
  });
});

// ---------------------------------------------------------------------------
// Each documented limit is clamped at the documented Max
// ---------------------------------------------------------------------------

describe('S-10 / LC-10: every documented limit clamps to its documented Max', () => {
  it('maxStringLength above 65536 clamps to 65536', () => {
    configureLogging({
      application: APP,
      transports: [capture],
      sanitizerLimits: { maxStringLength: 999999 },
      onInternalError,
    });
    const notices = clampNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toMatch(/maxStringLength/);
    expect(notices[0]!.message).toMatch(/65536/);
  });

  it('maxArrayLength above 10000 clamps to 10000', () => {
    configureLogging({
      application: APP,
      transports: [capture],
      sanitizerLimits: { maxArrayLength: 100000 },
      onInternalError,
    });
    const notices = clampNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toMatch(/maxArrayLength/);
    expect(notices[0]!.message).toMatch(/10000/);
  });

  it('maxAttributeCount above 4096 clamps to 4096', () => {
    configureLogging({
      application: APP,
      transports: [capture],
      sanitizerLimits: { maxAttributeCount: 1000000 },
      onInternalError,
    });
    const notices = clampNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toMatch(/maxAttributeCount/);
    expect(notices[0]!.message).toMatch(/4096/);
  });
});

// ---------------------------------------------------------------------------
// Below-min clamping
// ---------------------------------------------------------------------------

describe('S-10 / LC-10: values below the documented Min clamp to Min', () => {
  it('maxStringLength=0 clamps to 64 (the documented min) and emits a notice', () => {
    configureLogging({
      application: APP,
      level: 'debug',
      transports: [capture],
      sanitizerLimits: { maxStringLength: 0 },
      onInternalError,
    });
    const notices = clampNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toMatch(/maxStringLength/);
    expect(notices[0]!.message).toMatch(/64/);

    // Runtime enforces 64. A 100-char string truncates at 64 + suffix.
    createLogger().info('s', { s: 'x'.repeat(100) });
    expect(capture.calls[0]!.attributes.s).toBe(
      `${'x'.repeat(64)}...[truncated]`,
    );
  });

  it('maxDepth=0 clamps to 1 (the documented min)', () => {
    configureLogging({
      application: APP,
      transports: [capture],
      sanitizerLimits: { maxDepth: 0 },
      onInternalError,
    });
    const notices = clampNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toMatch(/maxDepth/);
    expect(notices[0]!.message).toMatch(/\b1\b/);
  });

  it('maxArrayLength=0 clamps to 1', () => {
    configureLogging({
      application: APP,
      transports: [capture],
      sanitizerLimits: { maxArrayLength: 0 },
      onInternalError,
    });
    const notices = clampNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toMatch(/maxArrayLength/);
  });

  it('maxAttributeCount=0 clamps to 1', () => {
    configureLogging({
      application: APP,
      transports: [capture],
      sanitizerLimits: { maxAttributeCount: 0 },
      onInternalError,
    });
    const notices = clampNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toMatch(/maxAttributeCount/);
  });
});

// ---------------------------------------------------------------------------
// Multiple clamps in one configureLogging() call
// ---------------------------------------------------------------------------

describe('S-10 / LC-10: multiple out-of-range limits in one configureLogging emit one notice per clamped key', () => {
  it('three out-of-range values emit three notices', () => {
    configureLogging({
      application: APP,
      transports: [capture],
      sanitizerLimits: {
        maxDepth: 99,
        maxStringLength: 999999,
        maxArrayLength: -5,
      },
      onInternalError,
    });
    const notices = clampNotices();
    expect(notices).toHaveLength(3);
    const messages = notices.map((n) => n.message);
    expect(messages.some((m) => m.includes('maxDepth'))).toBe(true);
    expect(messages.some((m) => m.includes('maxStringLength'))).toBe(true);
    expect(messages.some((m) => m.includes('maxArrayLength'))).toBe(true);
  });

  it('in-range overrides do NOT emit notices (only out-of-range values clamp)', () => {
    configureLogging({
      application: APP,
      transports: [capture],
      sanitizerLimits: {
        maxDepth: 5, // valid
        maxStringLength: 1024, // valid
        maxArrayLength: 500, // valid
        maxAttributeCount: 100, // valid
      },
      onInternalError,
    });
    expect(clampNotices()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Consumers cannot disable bounds entirely
// ---------------------------------------------------------------------------

describe('S-10: the package never allows a limit above the documented Max regardless of consumer input', () => {
  it('rejects Number.MAX_SAFE_INTEGER as maxStringLength (clamped silently to Max)', () => {
    configureLogging({
      application: APP,
      level: 'debug',
      transports: [capture],
      sanitizerLimits: { maxStringLength: Number.MAX_SAFE_INTEGER },
      onInternalError,
    });
    const notices = clampNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toMatch(/65536/);
    // Verify the runtime actually enforces 65536, not MAX_SAFE_INTEGER.
    const huge = 'x'.repeat(70000);
    createLogger().info('s', { s: huge });
    const out = capture.calls[0]!.attributes.s as string;
    expect(out.length).toBe(65536 + '...[truncated]'.length);
  });
});
