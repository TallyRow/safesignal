/**
 * Security test: Vue-adapter errors are fail-closed redacted
 * (specs/020-vue-error-handler — FR-V6 / SC-002).
 *
 * The adapter emits via `logger.error`, so a caught error passes the **same**
 * fail-closed redaction the pipeline applies to any logged error:
 *   - a whole-value secret (token-shaped) in the error message is masked, and
 *   - a redactor failure DROPS the event (fail-closed), never partially emitted.
 *
 * This proves the helpers route through the secure pipeline, not around it (the
 * guarantee that distinguishes them).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Component, defineComponent } from 'vue';
import { createErrorHandler } from '../../src/framework-vue/index.js';
import { configureLogging, createLogger } from '../../src/index.js';
import { makeSecretFixture } from '../../src/testing/index.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';
import { mountVue } from '../helpers/vue.js';

let consoleErr: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleErr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  consoleErr.mockRestore();
  consoleWarn.mockRestore();
});

function boomComponent(error: unknown): Component {
  return defineComponent({
    name: 'Boom',
    render() {
      throw error;
    },
  });
}

describe('framework-vue — redaction (FR-V6)', () => {
  it('a whole-value token in a caught error message is masked by the pipeline', () => {
    const capturing = makeCapturingTransport();
    configureLogging({
      application: { name: 'host-app' },
      environment: 'production',
      transports: [capturing],
    });
    const logger = createLogger({ module: { name: 'redaction-test' } });

    const secret = makeSecretFixture();
    mountVue(boomComponent(new Error(secret.jwt)), (app) => {
      app.config.errorHandler = createErrorHandler(logger);
    });

    const events = capturing.calls.filter(
      (e) => e.attributes['safesignal.source'] === 'vue-error-handler',
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
    const logger = createLogger({ module: { name: 'redaction-test' } });

    mountVue(boomComponent(new Error('secret-bearing error')), (app) => {
      app.config.errorHandler = createErrorHandler(logger);
    });

    const events = capturing.calls.filter(
      (e) => e.attributes['safesignal.source'] === 'vue-error-handler',
    );
    expect(events).toHaveLength(0);
  });
});
