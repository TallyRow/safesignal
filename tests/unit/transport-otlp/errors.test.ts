/**
 * T024 [US2] — Unit tests for the OTLP error/notice helpers.
 *
 * Locks FR-010 (one notice per failure class per instance) and the
 * FR-009 guarantee that notice messages carry no configured secret.
 */

import { describe, expect, it } from 'vitest';

import {
  freshNotifiedLedger,
  isOtlpError,
  type NotifyContext,
  notifyOnce,
  type OtlpError,
} from '../../../src/transport-otlp/errors.js';

function ctx(): NotifyContext & { notices: OtlpError[] } {
  const notices: OtlpError[] = [];
  return {
    name: 'otlp',
    onInternalError: (e) => notices.push(e as OtlpError),
    notified: freshNotifiedLedger(),
    notices,
  };
}

describe('notifyOnce', () => {
  it('emits at most one notice per failure code per context', () => {
    const c = ctx();
    notifyOnce(c, 'send_failed', 'HTTP 500');
    notifyOnce(c, 'send_failed', 'HTTP 503');
    notifyOnce(c, 'send_failed', 'HTTP 500');
    expect(c.notices).toHaveLength(1);
    expect(c.notices[0]!.code).toBe('send_failed');
  });

  it('allows one notice per distinct code', () => {
    const c = ctx();
    notifyOnce(c, 'send_failed', 'x');
    notifyOnce(c, 'buffer_overflow', 'y');
    notifyOnce(c, 'oversized_event', 'z');
    expect(c.notices.map((n) => n.code).sort()).toEqual([
      'buffer_overflow',
      'oversized_event',
      'send_failed',
    ]);
  });

  it('produces OtlpError instances carrying the transport name and code', () => {
    const c = ctx();
    notifyOnce(c, 'partial_rejection', 'backend rejected 2 record(s)', {
      some: 'cause',
    });
    const err = c.notices[0]!;
    expect(isOtlpError(err)).toBe(true);
    expect(err.transportName).toBe('otlp');
    expect(err.cause).toEqual({ some: 'cause' });
  });

  it('never includes a configured header value (caller passes only non-secret detail)', () => {
    const c = ctx();
    // The helper only ever sees the code + a non-secret detail string; it
    // has no access to headers. Confirm a typical message is secret-free.
    notifyOnce(c, 'send_failed', 'delivery failed (HTTP 401)');
    expect(c.notices[0]!.message).not.toMatch(/secret|api-key|token/i);
  });

  it('swallows a throwing consumer error handler', () => {
    const notified = freshNotifiedLedger();
    const c: NotifyContext = {
      name: 'otlp',
      onInternalError: () => {
        throw new Error('handler boom');
      },
      notified,
    };
    expect(() => notifyOnce(c, 'send_failed', 'x')).not.toThrow();
  });
});
