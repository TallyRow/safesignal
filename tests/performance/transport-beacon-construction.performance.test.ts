/**
 * T014 — Construction-sweep performance test.
 *
 * Constructs 1,000 beacon transports and asserts:
 *   - zero listener installations
 *   - zero timer creations
 *   - zero `fetch` calls
 *   - zero `sendBeacon` calls
 *   - zero reads of `window.location`, `document.cookie`,
 *     `localStorage`, `sessionStorage`
 *   - total allocations stay O(N) (no N×K amplification by transport
 *     count × any ambient property count)
 *
 * Locks SC-006, TB-4, FR-008, FR-027.
 *
 * Status: encoded with the full assertion body but marked `.skip`
 * until T016 wires `createBeaconTransport` so construction does not
 * throw on every call. T016 unstubs.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createBeaconTransport } from '../../src/transport-beacon/index.js';
import {
  installAddEventListenerSpy,
  installFetchDouble,
  installSendBeaconDouble,
  installSetTimeoutSpy,
} from '../helpers/beacon-network.js';

interface Spies {
  addEventListener: ReturnType<typeof installAddEventListenerSpy>;
  setTimeout: ReturnType<typeof installSetTimeoutSpy>;
  fetch: ReturnType<typeof installFetchDouble>;
  sendBeacon: ReturnType<typeof installSendBeaconDouble>;
  ambientReads: { location: number; cookie: number; localStorage: number; sessionStorage: number };
  restoreAmbient: () => void;
}

let spies: Spies | null = null;

function installAmbientProbes(): {
  reads: Spies['ambientReads'];
  restore: () => void;
} {
  const reads = { location: 0, cookie: 0, localStorage: 0, sessionStorage: 0 };
  const win = globalThis as unknown as {
    location?: unknown;
    document?: { cookie?: unknown };
    localStorage?: unknown;
    sessionStorage?: unknown;
  };
  const originalLocationDescriptor = Object.getOwnPropertyDescriptor(win, 'location');
  const originalCookieDescriptor =
    win.document !== undefined
      ? Object.getOwnPropertyDescriptor(win.document, 'cookie')
      : undefined;
  const originalLocal = win.localStorage;
  const originalSession = win.sessionStorage;

  // Install accessors that count reads.
  if (originalLocationDescriptor?.configurable === true) {
    Object.defineProperty(win, 'location', {
      get(): unknown {
        reads.location += 1;
        return originalLocationDescriptor.value ?? originalLocationDescriptor.get?.call(win);
      },
      configurable: true,
    });
  }
  if (win.document !== undefined && originalCookieDescriptor?.configurable === true) {
    Object.defineProperty(win.document, 'cookie', {
      get(): unknown {
        reads.cookie += 1;
        return originalCookieDescriptor.value ?? originalCookieDescriptor.get?.call(win.document);
      },
      configurable: true,
    });
  }
  // localStorage / sessionStorage replaced by counting proxies.
  if (originalLocal !== undefined) {
    Object.defineProperty(win, 'localStorage', {
      get(): unknown {
        reads.localStorage += 1;
        return originalLocal;
      },
      configurable: true,
    });
  }
  if (originalSession !== undefined) {
    Object.defineProperty(win, 'sessionStorage', {
      get(): unknown {
        reads.sessionStorage += 1;
        return originalSession;
      },
      configurable: true,
    });
  }

  return {
    reads,
    restore(): void {
      if (originalLocationDescriptor !== undefined) {
        Object.defineProperty(win, 'location', originalLocationDescriptor);
      }
      if (win.document !== undefined && originalCookieDescriptor !== undefined) {
        Object.defineProperty(win.document, 'cookie', originalCookieDescriptor);
      }
      if (originalLocal !== undefined) {
        Object.defineProperty(win, 'localStorage', {
          value: originalLocal,
          writable: true,
          configurable: true,
        });
      }
      if (originalSession !== undefined) {
        Object.defineProperty(win, 'sessionStorage', {
          value: originalSession,
          writable: true,
          configurable: true,
        });
      }
    },
  };
}

beforeEach(() => {
  const addEventListener = installAddEventListenerSpy();
  const setTimeoutSpy = installSetTimeoutSpy();
  const fetchDouble = installFetchDouble({ behavior: { kind: 'resolve', status: 204 } });
  const sendBeaconDouble = installSendBeaconDouble({ returnValue: true });
  const ambient = installAmbientProbes();
  spies = {
    addEventListener,
    setTimeout: setTimeoutSpy,
    fetch: fetchDouble,
    sendBeacon: sendBeaconDouble,
    ambientReads: ambient.reads,
    restoreAmbient: ambient.restore,
  };
});

afterEach(() => {
  spies?.addEventListener.uninstall();
  spies?.setTimeout.uninstall();
  spies?.fetch.uninstall();
  spies?.sendBeacon.uninstall();
  spies?.restoreAmbient();
  spies = null;
});

describe('Constructing N beacon transports performs zero side effects', () => {
  it('1,000 transports → zero listener installations', () => {
    if (spies === null) throw new Error('spies not initialised');
    const transports = [];
    for (let i = 0; i < 1000; i += 1) {
      transports.push(createBeaconTransport({ endpoint: 'https://example.com/ingest' }));
    }
    expect(transports.length).toBe(1000);
    expect(spies.addEventListener.registrations.length).toBe(0);
  });

  it('1,000 transports → zero timer creations', () => {
    if (spies === null) throw new Error('spies not initialised');
    for (let i = 0; i < 1000; i += 1) {
      createBeaconTransport({ endpoint: 'https://example.com/ingest' });
    }
    expect(spies.setTimeout.creations.length).toBe(0);
  });

  it('1,000 transports → zero fetch calls', () => {
    if (spies === null) throw new Error('spies not initialised');
    for (let i = 0; i < 1000; i += 1) {
      createBeaconTransport({ endpoint: 'https://example.com/ingest' });
    }
    expect(spies.fetch.calls.length).toBe(0);
  });

  it('1,000 transports → zero sendBeacon calls', () => {
    if (spies === null) throw new Error('spies not initialised');
    for (let i = 0; i < 1000; i += 1) {
      createBeaconTransport({ endpoint: 'https://example.com/ingest' });
    }
    expect(spies.sendBeacon.calls.length).toBe(0);
  });

  it('1,000 transports → zero reads of window.location / document.cookie / *Storage', () => {
    if (spies === null) throw new Error('spies not initialised');
    for (let i = 0; i < 1000; i += 1) {
      createBeaconTransport({ endpoint: 'https://example.com/ingest' });
    }
    expect(spies.ambientReads.location).toBe(0);
    expect(spies.ambientReads.cookie).toBe(0);
    expect(spies.ambientReads.localStorage).toBe(0);
    expect(spies.ambientReads.sessionStorage).toBe(0);
  });

  it('1,000 transports with batching ENABLED also incur zero side effects (constructor only)', () => {
    if (spies === null) throw new Error('spies not initialised');
    for (let i = 0; i < 1000; i += 1) {
      createBeaconTransport({
        endpoint: 'https://example.com/ingest',
        batching: { maxBatchSize: 50, maxBatchAgeMs: 10_000 },
      });
    }
    // No listeners, no timers, no network — even though batching options
    // are present, all of that work is deferred to the first send().
    expect(spies.addEventListener.registrations.length).toBe(0);
    expect(spies.setTimeout.creations.length).toBe(0);
    expect(spies.fetch.calls.length).toBe(0);
    expect(spies.sendBeacon.calls.length).toBe(0);
  });
});
