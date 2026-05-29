/**
 * T011 — Delivery primitives unit tests.
 *
 * Locks the per-primitive behaviour of T006:
 *   - getPayloadByteLength: UTF-8 byte count (TextEncoder)
 *   - BEACON_SIZE_LIMIT_BYTES: 65536 constant
 *   - tryBeacon: sendBeacon wrapper that never throws
 *   - tryFetchKeepalive: fetch wrapper with the documented call shape
 *
 * Composition-level behaviours (size check precedes primitive,
 * sendBeacon-true skips fetch, etc.) live with the
 * `createBeaconTransport` factory and unlock at T016 — those are
 * marked here with `it.skip(name, body)` so the full assertion is
 * already encoded; T016 simply removes the `.skip`.
 *
 * Covers contract IDs: D-2, D-3 (size limit), D-4, D-5, D-6, D-7,
 * F-2 (oversized), F-3 (unavailable), F-4 (send failed), F-7 (cause).
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  BEACON_SIZE_LIMIT_BYTES,
  getPayloadByteLength,
  tryBeacon,
  tryFetchKeepalive,
} from '../../../src/transport-beacon/delivery.js';
import {
  installFetchDouble,
  installSendBeaconDouble,
  installSendBeaconUnavailable,
} from '../../helpers/beacon-network.js';

// ---------------------------------------------------------------------------
// getPayloadByteLength
// ---------------------------------------------------------------------------

describe('getPayloadByteLength — UTF-8 byte count', () => {
  it('returns 0 for the empty string', () => {
    expect(getPayloadByteLength('')).toBe(0);
  });

  it('returns one byte per ASCII character', () => {
    expect(getPayloadByteLength('hello')).toBe(5);
  });

  it('counts UTF-8 bytes for multi-byte characters', () => {
    // 'é' is 2 bytes in UTF-8; '日' is 3 bytes; '🚀' is 4 bytes.
    expect(getPayloadByteLength('é')).toBe(2);
    expect(getPayloadByteLength('日')).toBe(3);
    expect(getPayloadByteLength('🚀')).toBe(4);
  });

  it('counts bytes, NOT UTF-16 code units (the .length trap)', () => {
    const s = '🚀'.repeat(10);
    expect(s.length).toBe(20); // 10 surrogate pairs = 20 code units
    expect(getPayloadByteLength(s)).toBe(40); // 10 × 4 bytes
  });
});

describe('BEACON_SIZE_LIMIT_BYTES', () => {
  it('is exactly 65536 (research §1)', () => {
    expect(BEACON_SIZE_LIMIT_BYTES).toBe(65536);
  });
});

// ---------------------------------------------------------------------------
// tryBeacon
// ---------------------------------------------------------------------------

describe('tryBeacon — synchronous primitive', () => {
  let beaconCtrl: ReturnType<typeof installSendBeaconDouble> | null = null;

  afterEach(() => {
    if (beaconCtrl !== null) {
      beaconCtrl.uninstall();
      beaconCtrl = null;
    }
  });

  it('returns false when navigator.sendBeacon is unavailable', () => {
    const unavailable = installSendBeaconUnavailable();
    try {
      expect(tryBeacon('https://example.com', '{"a":1}')).toBe(false);
    } finally {
      unavailable.uninstall();
    }
  });

  it('returns true when navigator.sendBeacon returns true', () => {
    beaconCtrl = installSendBeaconDouble({ returnValue: true });
    expect(tryBeacon('https://example.com/ingest', '{"a":1}')).toBe(true);
    expect(beaconCtrl.calls.length).toBe(1);
  });

  it('returns false when navigator.sendBeacon returns false', () => {
    beaconCtrl = installSendBeaconDouble({ returnValue: false });
    expect(tryBeacon('https://example.com/ingest', '{"a":1}')).toBe(false);
    expect(beaconCtrl.calls.length).toBe(1);
  });

  it('passes a Blob with type application/json (D-4)', async () => {
    beaconCtrl = installSendBeaconDouble({ returnValue: true });
    tryBeacon('https://example.com/ingest', '{"a":1}');
    expect(beaconCtrl.calls.length).toBe(1);
    const call = beaconCtrl.calls[0];
    expect(call?.endpoint).toBe('https://example.com/ingest');
    expect(call?.bodyType).toBe('application/json');
    // Body content lives on the raw Blob (happy-dom has no sync Blob reader).
    expect(call?.blob).toBeInstanceOf(Blob);
    const text = await call?.blob?.text();
    expect(text).toBe('{"a":1}');
  });

  it('never throws even when the underlying sendBeacon throws', () => {
    const ctrl = installSendBeaconDouble({
      returnValue: (): boolean => {
        throw new Error('synthetic underlying throw');
      },
    });
    try {
      expect(() => tryBeacon('https://example.com', '{"a":1}')).not.toThrow();
      expect(tryBeacon('https://example.com', '{"a":1}')).toBe(false);
    } finally {
      ctrl.uninstall();
    }
  });
});

// ---------------------------------------------------------------------------
// tryFetchKeepalive
// ---------------------------------------------------------------------------

describe('tryFetchKeepalive — async primitive', () => {
  let fetchCtrl: ReturnType<typeof installFetchDouble> | null = null;

  afterEach(() => {
    if (fetchCtrl !== null) {
      fetchCtrl.uninstall();
      fetchCtrl = null;
    }
  });

  it('resolves false when fetch is unavailable', async () => {
    fetchCtrl = installFetchDouble({ behavior: { kind: 'unavailable' } });
    await expect(
      tryFetchKeepalive('https://example.com', '{"a":1}'),
    ).resolves.toBe(false);
  });

  it.each([200, 201, 202, 204, 299])('resolves true when fetch returns %d (2xx)', async (status) => {
    fetchCtrl = installFetchDouble({ behavior: { kind: 'resolve', status } });
    await expect(
      tryFetchKeepalive('https://example.com', '{"a":1}'),
    ).resolves.toBe(true);
  });

  it.each([300, 301, 400, 401, 403, 404, 500, 502, 503])(
    'resolves false when fetch returns %d (non-2xx)',
    async (status) => {
      fetchCtrl = installFetchDouble({ behavior: { kind: 'resolve', status } });
      await expect(
        tryFetchKeepalive('https://example.com', '{"a":1}'),
      ).resolves.toBe(false);
    },
  );

  it('rejection from fetch bubbles to the caller (F-7)', async () => {
    const cause = new TypeError('Failed to fetch: synthetic');
    fetchCtrl = installFetchDouble({ behavior: { kind: 'reject', reason: cause } });
    await expect(
      tryFetchKeepalive('https://example.com', '{"a":1}'),
    ).rejects.toBe(cause);
  });

  it('call shape matches D-5: method=POST, body, headers, keepalive, credentials', async () => {
    fetchCtrl = installFetchDouble({ behavior: { kind: 'resolve', status: 204 } });
    await tryFetchKeepalive('https://example.com/ingest', '{"a":1}');
    expect(fetchCtrl.calls.length).toBe(1);
    const call = fetchCtrl.calls[0];
    expect(call?.url).toBe('https://example.com/ingest');
    expect(call?.body).toBe('{"a":1}');
    expect(call?.init?.method).toBe('POST');
    expect(call?.init?.keepalive).toBe(true);
    expect(call?.init?.credentials).toBe('same-origin');
    const headers = call?.init?.headers as Record<string, string> | undefined;
    expect(headers?.['content-type']).toBe('application/json');
  });

  it('does not add an Authorization header or set credentials=include', async () => {
    fetchCtrl = installFetchDouble({ behavior: { kind: 'resolve', status: 204 } });
    await tryFetchKeepalive('https://example.com', '{}');
    const headers = fetchCtrl.calls[0]?.init?.headers as Record<string, string> | undefined;
    expect(headers?.authorization ?? headers?.Authorization).toBeUndefined();
    expect(fetchCtrl.calls[0]?.init?.credentials).not.toBe('include');
  });
});

// ---------------------------------------------------------------------------
// Composition-level behaviours (createBeaconTransport policy)
// ---------------------------------------------------------------------------

import { createBeaconTransport } from '../../../src/transport-beacon/index.js';

type AnyLogEvent = {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  attributes: Record<string, unknown>;
  context: Record<string, unknown>;
};

function event(message: string, attributes: Record<string, unknown> = {}): AnyLogEvent {
  return {
    timestamp: '2026-05-27T00:00:00.000Z',
    level: 'warn',
    message,
    attributes,
    context: {},
  };
}

function settleMicrotasks(): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, 0));
}

describe('createBeaconTransport composition', () => {
  let beaconCtrl: ReturnType<typeof installSendBeaconDouble> | null = null;
  let fetchCtrl: ReturnType<typeof installFetchDouble> | null = null;

  afterEach(() => {
    beaconCtrl?.uninstall();
    fetchCtrl?.uninstall();
    beaconCtrl = null;
    fetchCtrl = null;
  });

  it('payload is exactly JSON.stringify(event) (D-2)', async () => {
    beaconCtrl = installSendBeaconDouble({ returnValue: true });
    fetchCtrl = installFetchDouble({ behavior: { kind: 'resolve', status: 204 } });
    const t = createBeaconTransport({ endpoint: 'https://example.com/ingest' });
    const e = event('payment retry', { attemptCount: 4 });
    t.send(e as never);
    expect(beaconCtrl.calls.length).toBe(1);
    const body = await beaconCtrl.calls[0]?.blob?.text();
    expect(body).toBe(JSON.stringify(e));
  });

  it('size check precedes primitive call; oversized → drop + oversized_event notice (D-3, F-2)', () => {
    beaconCtrl = installSendBeaconDouble({ returnValue: true });
    fetchCtrl = installFetchDouble({ behavior: { kind: 'resolve', status: 204 } });
    const notices: Error[] = [];
    const t = createBeaconTransport({
      endpoint: 'https://example.com/ingest',
      onInternalError: (err) => notices.push(err),
    });
    // 70_000 ASCII bytes > 65_536 limit. The JSON envelope adds a few
    // bytes of structure, so 70_000 is safely over the threshold.
    const big = 'x'.repeat(70_000);
    const e = event('oversized', { v: big });
    t.send(e as never);
    expect(beaconCtrl.calls.length).toBe(0); // no primitive call
    expect(fetchCtrl.calls.length).toBe(0);
    expect(notices.length).toBe(1);
    expect((notices[0] as Error & { code?: string }).code).toBe('oversized_event');
  });

  it('sendBeacon true → no fetch call (D-6)', () => {
    beaconCtrl = installSendBeaconDouble({ returnValue: true });
    fetchCtrl = installFetchDouble({ behavior: { kind: 'resolve', status: 204 } });
    const t = createBeaconTransport({ endpoint: 'https://example.com/ingest' });
    t.send(event('x') as never);
    expect(beaconCtrl.calls.length).toBe(1);
    expect(fetchCtrl.calls.length).toBe(0);
  });

  it('sendBeacon false → fetch called exactly once (D-6)', async () => {
    beaconCtrl = installSendBeaconDouble({ returnValue: false });
    fetchCtrl = installFetchDouble({ behavior: { kind: 'resolve', status: 204 } });
    const t = createBeaconTransport({ endpoint: 'https://example.com/ingest' });
    t.send(event('x') as never);
    expect(beaconCtrl.calls.length).toBe(1);
    await settleMicrotasks();
    expect(fetchCtrl.calls.length).toBe(1);
  });

  it('sendBeacon undefined → fetch called exactly once (D-6)', async () => {
    const unavailable = installSendBeaconUnavailable();
    fetchCtrl = installFetchDouble({ behavior: { kind: 'resolve', status: 204 } });
    try {
      const t = createBeaconTransport({ endpoint: 'https://example.com/ingest' });
      t.send(event('x') as never);
      await settleMicrotasks();
      expect(fetchCtrl.calls.length).toBe(1);
    } finally {
      unavailable.uninstall();
    }
  });

  it('both primitives undefined → drop + beacon_unavailable notice (D-7, F-3)', () => {
    const unavailable = installSendBeaconUnavailable();
    fetchCtrl = installFetchDouble({ behavior: { kind: 'unavailable' } });
    try {
      const notices: Error[] = [];
      const t = createBeaconTransport({
        endpoint: 'https://example.com/ingest',
        onInternalError: (err) => notices.push(err),
      });
      t.send(event('x') as never);
      expect(notices.length).toBe(1);
      expect((notices[0] as Error & { code?: string }).code).toBe('beacon_unavailable');
    } finally {
      unavailable.uninstall();
    }
  });

  it('fetch rejection → drop + transport_send_failed notice carrying .cause (F-4, F-7)', async () => {
    beaconCtrl = installSendBeaconDouble({ returnValue: false });
    const cause = new TypeError('Failed to fetch (synthetic)');
    fetchCtrl = installFetchDouble({ behavior: { kind: 'reject', reason: cause } });
    const notices: Error[] = [];
    const t = createBeaconTransport({
      endpoint: 'https://example.com/ingest',
      onInternalError: (err) => notices.push(err),
    });
    t.send(event('x') as never);
    await settleMicrotasks();
    expect(notices.length).toBe(1);
    const err = notices[0] as Error & { code?: string; cause?: unknown };
    expect(err.code).toBe('transport_send_failed');
    expect(err.cause).toBe(cause);
  });

  it('fetch non-2xx → drop + transport_send_failed notice (D-5, F-4)', async () => {
    beaconCtrl = installSendBeaconDouble({ returnValue: false });
    fetchCtrl = installFetchDouble({ behavior: { kind: 'resolve', status: 500 } });
    const notices: Error[] = [];
    const t = createBeaconTransport({
      endpoint: 'https://example.com/ingest',
      onInternalError: (err) => notices.push(err),
    });
    t.send(event('x') as never);
    await settleMicrotasks();
    expect(notices.length).toBe(1);
    expect((notices[0] as Error & { code?: string }).code).toBe('transport_send_failed');
  });

  it('oversized_event notice fires once per session (rate-limited per F-8)', () => {
    beaconCtrl = installSendBeaconDouble({ returnValue: true });
    fetchCtrl = installFetchDouble({ behavior: { kind: 'resolve', status: 204 } });
    const notices: Error[] = [];
    const t = createBeaconTransport({
      endpoint: 'https://example.com/ingest',
      onInternalError: (err) => notices.push(err),
    });
    const big = 'x'.repeat(70_000);
    for (let i = 0; i < 5; i += 1) {
      t.send(event(`oversized ${i}`, { v: big }) as never);
    }
    expect(notices.length).toBe(1);
    expect((notices[0] as Error & { code?: string }).code).toBe('oversized_event');
  });
});
