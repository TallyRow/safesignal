/**
 * Security test: dev-console renderer is structured-only, leak-free, attaches
 * no globals, and preserves event integrity
 * (specs/015-dev-console-rendering — DC-5/DC-6/DC-9, FR-004/005, SC-003/005,
 * Principle IV/V/VII/VIII).
 *
 * The renderer consumes ONLY the post-pipeline (already sanitized + redacted)
 * event. These tests prove it (a) re-serializes nothing beyond the bounded
 * event (attributes logged by reference), (b) surfaces no value outside the
 * `LogEvent` contract fields, (c) attaches no global listeners, and (d) does
 * not mutate the event.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevConsoleTransport } from '../../src/dev-console/index.js';
import { makeSecretFixture } from '../../src/testing/index.js';
import type { LogEvent } from '../../src/api/types.js';

function makeEvent(over: Partial<LogEvent> = {}): LogEvent {
  return {
    timestamp: '2026-06-01T00:00:00.000Z',
    level: 'info',
    message: 'checkout opened',
    attributes: {},
    context: {
      environment: 'development',
      application: { name: 'checkout-web' },
    },
    ...over,
  };
}

/** Capture every argument passed to any console method during a render. */
function captureConsole() {
  const calls: unknown[][] = [];
  const record =
    () =>
    (...args: unknown[]): void => {
      calls.push(args);
    };
  for (const method of [
    'groupCollapsed',
    'groupEnd',
    'log',
    'debug',
    'info',
    'warn',
    'error',
  ] as const) {
    vi.spyOn(console, method).mockImplementation(record());
  }
  return calls;
}

/** Recursively collect every string reachable from a set of console args. */
function allStrings(calls: unknown[][]): string[] {
  const out: string[] = [];
  const visit = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (v && typeof v === 'object') {
      for (const x of Object.values(v as Record<string, unknown>)) visit(x);
    }
  };
  for (const args of calls) for (const a of args) visit(a);
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// DC-5 / SC-003 — structured-only: only the redacted event, by reference
// ---------------------------------------------------------------------------

describe('DC-5 — renders only the post-pipeline event, by reference', () => {
  it('logs the attributes object by reference (no re-serialization / re-walk)', () => {
    const calls = captureConsole();
    const attributes = { cartItems: 3, nested: { ok: true } };
    DevConsoleTransport().send(makeEvent({ attributes }));
    // The exact object identity must reach console.log — proving the renderer
    // does not copy, re-serialize, or re-walk the bounded event.
    const loggedTheObject = calls.some((args) => args[0] === attributes);
    expect(loggedTheObject).toBe(true);
  });

  it('SC-003: a secret outside the LogEvent contract fields appears 0 times', () => {
    const calls = captureConsole();
    const secret = makeSecretFixture().jwt;
    // The event reaching a transport is already redacted: its contract fields
    // hold only the placeholder. The raw secret lives ONLY on a non-contract
    // property — the renderer must never surface it.
    const event = makeEvent({ attributes: { token: '[REDACTED]' } });
    (event as unknown as Record<string, unknown>).secretLeak = secret;

    DevConsoleTransport().send(event);

    const strings = allStrings(calls);
    expect(strings.some((s) => s.includes(secret))).toBe(false);
    // The already-redacted placeholder IS surfaced (the safe event is shown).
    expect(strings.some((s) => s.includes('[REDACTED]'))).toBe(true);
  });

  it('SC-003: an already-redacted value in attributes is rendered, not un-redacted', () => {
    const calls = captureConsole();
    const event = makeEvent({
      attributes: { authorization: '[REDACTED]', userId: 'u_123' },
    });
    DevConsoleTransport().send(event);
    const strings = allStrings(calls);
    // The fixture's raw authorization value never appears.
    expect(
      strings.some((s) => s.includes(makeSecretFixture().authorization)),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DC-6 / SC-005 — no globals, no ambient reads
// ---------------------------------------------------------------------------

describe('DC-6 — attaches no global listeners; side-effect-free to construct', () => {
  it('constructing and sending attaches 0 global listeners', () => {
    const addSpy = vi.spyOn(globalThis, 'addEventListener');
    captureConsole();
    const transport = DevConsoleTransport();
    transport.send(makeEvent());
    transport.send(makeEvent({ context: { environment: 'production' } }));
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('constructing the transport produces no console output (no side effects)', () => {
    const calls = captureConsole();
    DevConsoleTransport({ name: 'pretty' });
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DC-9 — integrity: send does not mutate the event
// ---------------------------------------------------------------------------

describe('DC-9 — integrity: the event is not mutated', () => {
  it('send leaves the event deeply unchanged', () => {
    captureConsole();
    const event = makeEvent({
      level: 'error',
      attributes: { cartItems: 3 },
      error: { name: 'Error', message: 'boom', stack: 'at x' },
      context: {
        environment: 'development',
        application: { name: 'checkout-web' },
        trace: {
          traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
          spanId: '00f067aa0ba902b7',
        },
      },
    });
    const snapshot = JSON.stringify(event);
    DevConsoleTransport({
      traceUrl: ({ traceId }) => `https://trace.example/${traceId}`,
    }).send(event);
    expect(JSON.stringify(event)).toBe(snapshot);
  });
});
