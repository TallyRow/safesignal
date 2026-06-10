/**
 * Integration / failure-safety test: global error capture
 * (specs/013-global-error-capture — CAP-4/5/6/7/9/11, FR-005/006/007/011/012).
 *
 * The capturer must never throw into the page, must chain (not clobber)
 * existing handlers, must be loop-safe and idempotently disposable, and must
 * degrade safely with no global target or an unconfigured runtime.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installGlobalErrorCapture } from '../../src/capture/index.js';
import type { Logger } from '../../src/index.js';
import { configureLogging, getRootLogger } from '../../src/index.js';
import {
  makeCapturingTransport,
  makeThrowingTransport,
} from '../helpers/failing-transport.js';

function errorEvent(error: unknown): Event {
  const ev = new Event('error');
  Object.assign(ev, { error });
  return ev;
}

describe('global error capture — failure safety', () => {
  let target: EventTarget;
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    target = new EventTarget();
  });
  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it('CAP-4: a throwing transport is swallowed; no throw to the page; runtime onInternalError fires', () => {
    const onInternalError = vi.fn();
    configureLogging({
      environment: 'production',
      transports: [makeThrowingTransport()],
      onInternalError,
    });
    dispose = installGlobalErrorCapture(getRootLogger(), { target });

    expect(() =>
      target.dispatchEvent(errorEvent(new Error('boom'))),
    ).not.toThrow();
    expect(onInternalError).toHaveBeenCalled();
  });

  it("CAP-4: the capturer's own failure routes to options.onInternalError, swallowed", () => {
    const onInternalError = vi.fn();
    const throwingLogger = {
      error() {
        throw new Error('logger blew up');
      },
    } as unknown as Logger;
    dispose = installGlobalErrorCapture(throwingLogger, {
      target,
      onInternalError,
    });

    expect(() =>
      target.dispatchEvent(errorEvent(new Error('x'))),
    ).not.toThrow();
    expect(onInternalError).toHaveBeenCalledTimes(1);
  });

  it('CAP-5: an error raised during emit does not recursively re-capture', () => {
    let calls = 0;
    const reentrantLogger = {
      error() {
        calls += 1;
        // Simulate an error arising during emit — without the in-flight guard
        // this would recurse unboundedly.
        target.dispatchEvent(errorEvent(new Error('inner')));
      },
    } as unknown as Logger;
    dispose = installGlobalErrorCapture(reentrantLogger, { target });

    target.dispatchEvent(errorEvent(new Error('outer')));
    expect(calls).toBe(1);
  });

  it('CAP-6: chains a pre-existing handler and never preventDefaults', () => {
    const capturing = makeCapturingTransport();
    configureLogging({ environment: 'production', transports: [capturing] });
    const preExisting = vi.fn();
    target.addEventListener('error', preExisting);
    dispose = installGlobalErrorCapture(getRootLogger(), { target });

    const ev = errorEvent(new Error('boom'));
    const notPrevented = target.dispatchEvent(ev);

    expect(preExisting).toHaveBeenCalledTimes(1); // existing handler still ran
    expect(capturing.calls).toHaveLength(1); // capture also ran (additive)
    expect(notPrevented).toBe(true); // capturer did not preventDefault()
  });

  it('CAP-7: the disposer removes listeners and is idempotent', () => {
    const capturing = makeCapturingTransport();
    configureLogging({ environment: 'production', transports: [capturing] });
    const d = installGlobalErrorCapture(getRootLogger(), { target });

    d();
    target.dispatchEvent(errorEvent(new Error('after dispose')));
    expect(capturing.calls).toHaveLength(0);
    expect(() => d()).not.toThrow(); // second dispose is a no-op
  });

  it('CAP-9: install on a target without addEventListener is a safe no-op', () => {
    const d = installGlobalErrorCapture(getRootLogger(), {
      target: {} as EventTarget,
    });
    expect(typeof d).toBe('function');
    expect(() => d()).not.toThrow();
  });

  it('CAP-11: capture over an unconfigured runtime never throws (default Noop)', () => {
    configureLogging({ environment: 'production' }); // no transports → Noop
    dispose = installGlobalErrorCapture(getRootLogger(), { target });
    expect(() =>
      target.dispatchEvent(errorEvent(new Error('x'))),
    ).not.toThrow();
  });
});
