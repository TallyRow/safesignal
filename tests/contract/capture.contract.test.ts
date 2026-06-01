/**
 * Contract test: global error capture API
 * (specs/013-global-error-capture — CAP-1/CAP-2/CAP-8/CAP-10, FR-002/003/009/010).
 *
 * Capture is exercised over a caller-supplied EventTarget with synthetic
 * `error` / `unhandledrejection` events, so behavior is deterministic and not
 * tied to happy-dom's event shims.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installGlobalErrorCapture } from '../../src/capture/index.js';
import { configureLogging, getRootLogger } from '../../src/index.js';
import {
  type CapturingTransport,
  makeCapturingTransport,
} from '../helpers/failing-transport.js';

function dispatchError(
  target: EventTarget,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  const ev = new Event('error');
  Object.assign(ev, { error, ...extra });
  target.dispatchEvent(ev);
}

function dispatchRejection(target: EventTarget, reason: unknown): void {
  const ev = new Event('unhandledrejection');
  Object.assign(ev, { reason });
  target.dispatchEvent(ev);
}

describe('global error capture — contract (CAP-1/2/8/10)', () => {
  let capturing: CapturingTransport;
  let target: EventTarget;
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    capturing = makeCapturingTransport();
    configureLogging({
      application: { name: 'host-app', version: '1.0.0' },
      environment: 'production',
      transports: [capturing],
    });
    target = new EventTarget();
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it('CAP-1: an uncaught exception emits one error-level event with markers + identity', () => {
    dispose = installGlobalErrorCapture(getRootLogger(), { target });
    dispatchError(target, new Error('boom'));

    expect(capturing.calls).toHaveLength(1);
    const ev = capturing.calls[0]!;
    expect(ev.level).toBe('error');
    expect(ev.message).toBe('Uncaught exception');
    expect(ev.error?.name).toBe('Error');
    expect(ev.error?.message).toBe('boom');
    expect(ev.attributes['safesignal.source']).toBe('global-error-capture');
    expect(ev.attributes['safesignal.errorType']).toBe('uncaught-exception');
    expect(ev.context.application?.name).toBe('host-app');
  });

  it('CAP-2: an unhandled rejection emits an error-level event', () => {
    dispose = installGlobalErrorCapture(getRootLogger(), { target });
    dispatchRejection(target, new Error('rejected'));

    expect(capturing.calls).toHaveLength(1);
    const ev = capturing.calls[0]!;
    expect(ev.message).toBe('Unhandled promise rejection');
    expect(ev.error?.message).toBe('rejected');
    expect(ev.attributes['safesignal.errorType']).toBe('unhandled-rejection');
  });

  it('CAP-1 (synthesized): an error event with no error object uses message + location attrs', () => {
    dispose = installGlobalErrorCapture(getRootLogger(), { target });
    dispatchError(target, undefined, {
      message: 'Script error.',
      filename: 'https://cdn.example/app.js',
      lineno: 42,
      colno: 7,
    });

    expect(capturing.calls).toHaveLength(1);
    const ev = capturing.calls[0]!;
    expect(ev.error?.message).toBe('Script error.');
    expect(ev.attributes.filename).toBe('https://cdn.example/app.js');
    expect(ev.attributes.lineno).toBe(42);
  });

  it('CAP-10: attaches exactly `error` + `unhandledrejection` and nothing else', () => {
    const spy = vi.spyOn(target, 'addEventListener');
    dispose = installGlobalErrorCapture(getRootLogger(), { target });
    const types = spy.mock.calls.map((c) => c[0]).sort();
    expect(types).toEqual(['error', 'unhandledrejection']);
  });
});
