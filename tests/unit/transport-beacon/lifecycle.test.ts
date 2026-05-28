/**
 * T012 — Lifecycle unit tests.
 *
 * Locks T007's `installPagehideHandler` primitive AND describes the
 * higher-level lazy-install behaviour the transport factory (T016)
 * layers on top.
 *
 * Primitive tests run now. Composition tests (lazy install on first
 * `send()`, single install across N sends, removal on `shutdown()`,
 * never installing `visibilitychange` or `beforeunload`) are
 * encoded as `it.todo` until T016 unlocks them.
 *
 * Covers contract IDs: D-10 (lazy + gated), D-12 (shutdown removes
 * listener; idempotent).
 */

import { afterEach, describe, expect, it } from 'vitest';

import { installPagehideHandler } from '../../../src/transport-beacon/lifecycle.js';
import { installAddEventListenerSpy } from '../../helpers/beacon-network.js';

describe('installPagehideHandler — primitive', () => {
  let spy: ReturnType<typeof installAddEventListenerSpy> | null = null;

  afterEach(() => {
    if (spy !== null) {
      spy.uninstall();
      spy = null;
    }
  });

  it('attaches exactly one pagehide listener via addEventListener', () => {
    spy = installAddEventListenerSpy();
    installPagehideHandler(() => undefined);
    const pagehideAdds = spy.registrations.filter((r) => r.type === 'pagehide');
    expect(pagehideAdds.length).toBe(1);
  });

  it('does NOT install a visibilitychange listener', () => {
    spy = installAddEventListenerSpy();
    installPagehideHandler(() => undefined);
    expect(spy.registrations.find((r) => r.type === 'visibilitychange')).toBeUndefined();
  });

  it('does NOT install a beforeunload listener', () => {
    spy = installAddEventListenerSpy();
    installPagehideHandler(() => undefined);
    expect(spy.registrations.find((r) => r.type === 'beforeunload')).toBeUndefined();
  });

  it('returned uninstall removes the pagehide listener', () => {
    spy = installAddEventListenerSpy();
    const uninstall = installPagehideHandler(() => undefined);
    uninstall();
    const pagehideRemovals = spy.removals.filter((r) => r.type === 'pagehide');
    expect(pagehideRemovals.length).toBe(1);
    // The removed listener must reference-equal the installed one so the
    // DOM removeEventListener matches correctly.
    expect(pagehideRemovals[0]?.listener).toBe(spy.registrations[0]?.listener);
  });

  it('handler fires when a pagehide event dispatches', () => {
    let fired = 0;
    const uninstall = installPagehideHandler(() => {
      fired += 1;
    });
    try {
      const event = new Event('pagehide');
      globalThis.dispatchEvent(event);
      expect(fired).toBe(1);
      globalThis.dispatchEvent(new Event('pagehide'));
      expect(fired).toBe(2);
    } finally {
      uninstall();
    }
  });

  it('handler stops firing after uninstall', () => {
    let fired = 0;
    const uninstall = installPagehideHandler(() => {
      fired += 1;
    });
    uninstall();
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(fired).toBe(0);
  });

  it('uninstall is idempotent at the DOM level (removeEventListener twice is harmless)', () => {
    const uninstall = installPagehideHandler(() => undefined);
    expect(() => {
      uninstall();
      uninstall();
    }).not.toThrow();
  });

  it('two install calls produce two independent listeners (module gates nothing)', () => {
    spy = installAddEventListenerSpy();
    let firedA = 0;
    let firedB = 0;
    const uninstallA = installPagehideHandler(() => {
      firedA += 1;
    });
    const uninstallB = installPagehideHandler(() => {
      firedB += 1;
    });
    try {
      const pagehideAdds = spy.registrations.filter((r) => r.type === 'pagehide');
      expect(pagehideAdds.length).toBe(2);
      // Two distinct listener references.
      expect(pagehideAdds[0]?.listener).not.toBe(pagehideAdds[1]?.listener);
      globalThis.dispatchEvent(new Event('pagehide'));
      expect(firedA).toBe(1);
      expect(firedB).toBe(1);
    } finally {
      uninstallA();
      uninstallB();
    }
  });
});

describe('installPagehideHandler — gated by addEventListener availability', () => {
  it('returns a no-op uninstaller when globalThis.addEventListener is unavailable', () => {
    const original = globalThis.addEventListener;
    Object.defineProperty(globalThis, 'addEventListener', {
      value: undefined,
      configurable: true,
    });
    try {
      let fired = 0;
      const uninstall = installPagehideHandler(() => {
        fired += 1;
      });
      expect(typeof uninstall).toBe('function');
      expect(() => uninstall()).not.toThrow();
      expect(fired).toBe(0);
    } finally {
      Object.defineProperty(globalThis, 'addEventListener', {
        value: original,
        configurable: true,
      });
    }
  });
});

describe('Transport-level lazy lifecycle (unlocks at T016)', () => {
  it.todo('first send() that proceeds past the size check installs the pagehide listener');
  it.todo('subsequent send() calls install zero additional listeners (gated)');
  it.todo('shutdown() removes the listener and clears the installed flag (D-12)');
  it.todo('shutdown() called twice is a no-op (D-12 idempotency)');
  it.todo('send() called after shutdown is a no-op (no encoding, no primitive call)');
  it.todo('the transport NEVER installs visibilitychange or beforeunload listeners');
});
