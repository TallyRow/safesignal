/**
 * Integration / failure-safety test: `./framework-vue`
 * (specs/020-vue-error-handler — FR-V1/V4/V6/V7; SC-001/SC-003).
 *
 * End-to-end through the real pipeline + a capturing transport, mounted into
 * happy-dom. Proves: an app-level render crash is delivered as a redacted error
 * event; a `useErrorCapture` boundary logs once and (by default) stops
 * propagation so the app-level handler does NOT double-log; `{ propagate: true }`
 * lets both fire; and a throwing `logger.error` is swallowed (the app keeps
 * running, no loop).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Component, defineComponent, h } from 'vue';
import {
  createErrorHandler,
  safesignalErrorHandler,
  useErrorCapture,
} from '../../src/framework-vue/index.js';
import type { Logger } from '../../src/index.js';
import { configureLogging, createLogger } from '../../src/index.js';
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

function boomComponent(message = 'render boom'): Component {
  return defineComponent({
    name: 'Boom',
    render() {
      throw new Error(message);
    },
  });
}

describe('framework-vue — app handler end-to-end through the pipeline (SC-001)', () => {
  it('delivers a render crash as a redacted error-level event via the plugin', () => {
    const capturing = makeCapturingTransport();
    configureLogging({ environment: 'production', transports: [capturing] });
    const logger = createLogger({ module: { name: 'checkout' } });

    mountVue(boomComponent('render boom'), (app) => {
      app.use(safesignalErrorHandler, { logger });
    });

    const events = capturing.calls.filter(
      (e) => e.attributes['safesignal.source'] === 'vue-error-handler',
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.level).toBe('error');
    expect(events[0]?.message).toBe('Vue error');
    expect(events[0]?.error?.message).toBe('render boom');
    expect(typeof events[0]?.attributes['safesignal.vue.info']).toBe('string');
  });
});

describe('framework-vue — useErrorCapture propagation (FR-V4)', () => {
  /** Root = a boundary (via useErrorCapture) wrapping a throwing child. */
  function boundaryRoot(propagate: boolean, logger: Logger): Component {
    const Boom = boomComponent('boundary boom');
    return defineComponent({
      setup() {
        useErrorCapture({ logger, propagate });
        return () => h(Boom);
      },
    });
  }

  it('default: the boundary logs once and the app handler does NOT double-log', () => {
    const capturing = makeCapturingTransport();
    configureLogging({ environment: 'production', transports: [capturing] });
    const logger = createLogger({ module: { name: 'widget' } });

    mountVue(boundaryRoot(false, logger), (app) => {
      app.config.errorHandler = createErrorHandler(logger);
    });

    const captured = capturing.calls.filter(
      (e) => e.attributes['safesignal.source'] === 'vue-error-captured',
    );
    const appLevel = capturing.calls.filter(
      (e) => e.attributes['safesignal.source'] === 'vue-error-handler',
    );
    expect(captured).toHaveLength(1);
    expect(appLevel).toHaveLength(0);
  });

  it('{ propagate: true }: the boundary logs AND the app handler also logs', () => {
    const capturing = makeCapturingTransport();
    configureLogging({ environment: 'production', transports: [capturing] });
    const logger = createLogger({ module: { name: 'widget' } });

    mountVue(boundaryRoot(true, logger), (app) => {
      app.config.errorHandler = createErrorHandler(logger);
    });

    const captured = capturing.calls.filter(
      (e) => e.attributes['safesignal.source'] === 'vue-error-captured',
    );
    const appLevel = capturing.calls.filter(
      (e) => e.attributes['safesignal.source'] === 'vue-error-handler',
    );
    expect(captured).toHaveLength(1);
    expect(appLevel).toHaveLength(1);
  });
});

describe('framework-vue — fail-safety (FR-V7 / SC-003)', () => {
  it('swallows a throwing logger.error; the app mounts without throwing; no loop', () => {
    const error = vi.fn(() => {
      throw new Error('logger blew up');
    });
    const logger = { error } as unknown as Logger;

    expect(() =>
      mountVue(boomComponent(), (app) => {
        app.config.errorHandler = createErrorHandler(logger);
      }),
    ).not.toThrow();
    // Called exactly once — the swallowed throw does not re-trigger capture.
    expect(error).toHaveBeenCalledTimes(1);
  });
});
