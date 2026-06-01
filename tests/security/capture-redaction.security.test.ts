/**
 * Security test: captured errors are fail-closed redacted
 * (specs/013-global-error-capture — CAP-3, FR-004).
 *
 * Capture emits via `logger.error`, so a captured error passes the **same**
 * fail-closed redaction the pipeline applies to any logged error:
 *   - a whole-value secret (token-shaped) is masked, and
 *   - a redactor failure DROPS the event (fail-closed).
 *
 * (Substring secrets embedded in a free-text stack are not substring-scrubbed —
 * a pipeline-wide property, identical to `logger.error` today; secrets belong in
 * structured attributes, not thrown into messages. This test proves capture does
 * not *bypass* redaction, which is the guarantee that distinguishes it.)
 */

import { describe, expect, it } from 'vitest';
import { installGlobalErrorCapture } from '../../src/capture/index.js';
import { configureLogging, getRootLogger } from '../../src/index.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';
import { makeSecretFixture } from '../../src/testing/index.js';

function dispatchError(error: unknown): void {
  const ev = new Event('error');
  Object.assign(ev, { error });
  globalThis.dispatchEvent(ev);
}

describe('global error capture — redaction (CAP-3)', () => {
  it('a whole-value token in a captured error is masked by the pipeline', () => {
    const capturing = makeCapturingTransport();
    configureLogging({
      application: { name: 'host-app' },
      environment: 'production',
      transports: [capturing],
    });
    const dispose = installGlobalErrorCapture(getRootLogger());

    const secret = makeSecretFixture();
    dispatchError(new Error(secret.jwt)); // message IS a JWT → shape rule masks it
    dispose();

    expect(capturing.calls).toHaveLength(1);
    // The redactor ran on the captured event's error.message (proves capture
    // routes through redaction, not around it).
    expect(capturing.calls[0]?.error?.message).toBe('[REDACTED]');
  });

  it('fail-closed: a redactor failure drops the captured event entirely', () => {
    const capturing = makeCapturingTransport();
    configureLogging({
      environment: 'production',
      transports: [capturing],
      redactor: () => {
        throw new Error('redactor blew up');
      },
      onInternalError: () => {
        /* swallow */
      },
    });
    const dispose = installGlobalErrorCapture(getRootLogger());

    dispatchError(new Error('secret-bearing error'));
    dispose();

    // Redaction could not complete → the event is dropped, not partially emitted.
    expect(capturing.calls).toHaveLength(0);
  });
});
