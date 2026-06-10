/**
 * Security test: React-boundary errors are fail-closed redacted
 * (specs/018-react-error-boundary — FR-R4 / SC-003).
 *
 * The boundary emits via `logger.error`, so a caught error passes the **same**
 * fail-closed redaction the pipeline applies to any logged error:
 *   - a whole-value secret (token-shaped) in the error message is masked, and
 *   - a redactor failure DROPS the event (fail-closed), never partially emitted.
 *
 * This proves the helpers route through the secure pipeline, not around it (the
 * guarantee that distinguishes them). Substring secrets in a free-text
 * stack/component-stack are not substring-scrubbed — a pipeline-wide property,
 * identical to `logger.error`; secrets belong in structured attributes.
 */

import { createElement } from 'react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogErrorBoundary } from '../../src/framework-react/index.js';
import { configureLogging, createLogger } from '../../src/index.js';
import { makeSecretFixture } from '../../src/testing/index.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';
import { mount } from '../helpers/react.js';

let consoleErr: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleErr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  consoleErr.mockRestore();
});

function boundaryThrowing(error: unknown): ReactElement {
  function Boom(): ReactElement {
    throw error;
  }
  return createElement(
    LogErrorBoundary,
    {
      logger: createLogger({ module: { name: 'redaction-test' } }),
      fallback: 'fb',
    },
    createElement(Boom),
  );
}

describe('framework-react — redaction (FR-R4)', () => {
  it('a whole-value token in a caught error message is masked by the pipeline', () => {
    const capturing = makeCapturingTransport();
    configureLogging({
      application: { name: 'host-app' },
      environment: 'production',
      transports: [capturing],
    });

    const secret = makeSecretFixture();
    mount(boundaryThrowing(new Error(secret.jwt)));

    const events = capturing.calls.filter(
      (e) => e.attributes['safesignal.source'] === 'react-error-boundary',
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.error?.message).toBe('[REDACTED]');
  });

  it('fail-closed: a redactor failure drops the caught event entirely', () => {
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

    mount(boundaryThrowing(new Error('secret-bearing error')));

    // Redaction could not complete → the event is dropped, not partially emitted.
    const events = capturing.calls.filter(
      (e) => e.attributes['safesignal.source'] === 'react-error-boundary',
    );
    expect(events).toHaveLength(0);
  });
});
