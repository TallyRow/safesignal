/**
 * Contract test: `./framework-vue` — createErrorHandler, safesignalErrorHandler,
 * loggerKey, useLogError, useErrorCapture
 * (specs/020-vue-error-handler — FR-V1..V5/V9; contracts/framework-vue.md).
 *
 * Uses a mock `Logger` (a spy on `error`) to assert the exact emission contract
 * (message, source marker, Vue context attributes, forwarded error value)
 * without running the full pipeline — the pipeline's fail-closed redaction is
 * proven separately in the security test. Vue is mounted into happy-dom via the
 * `mountVue` helper (raw `createApp`, render functions, no `@vue/test-utils`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Component, defineComponent, h, nextTick, ref } from 'vue';
import {
  createErrorHandler,
  loggerKey,
  safesignalErrorHandler,
  useErrorCapture,
  useLogError,
} from '../../src/framework-vue/index.js';
import type { Attributes, Logger } from '../../src/index.js';
import { mountVue } from '../helpers/vue.js';

// Vue logs caught errors to console in dev; silence to keep output clean.
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

interface MockLogger {
  readonly logger: Logger;
  readonly error: ReturnType<typeof vi.fn>;
}

function mockLogger(): MockLogger {
  const error = vi.fn();
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error,
    child: vi.fn(),
    withContext: vi.fn(),
  } as unknown as Logger;
  return { logger, error };
}

/** A component that throws on render (an Error by default, else `value`). */
function boomComponent(value?: unknown): Component {
  return defineComponent({
    name: 'Boom',
    render() {
      throw value ?? new Error('boom');
    },
  });
}

// ---------------------------------------------------------------------------
// US1 — app-level adapter + plugin + loggerKey (FR-V1/V2/V9)
// ---------------------------------------------------------------------------

describe('createErrorHandler — app-level emission contract (FR-V1/V9)', () => {
  it('emits one error-level event with source marker, Vue info/name, and forwarded error', () => {
    const { logger, error } = mockLogger();
    mountVue(boomComponent(new Error('render boom')), (app) => {
      app.config.errorHandler = createErrorHandler(logger);
    });

    expect(error).toHaveBeenCalledTimes(1);
    const [message, attributes, errorValue] = error.mock.calls[0] as [
      string,
      Attributes,
      unknown,
    ];
    expect(message).toBe('Vue error');
    expect(attributes['safesignal.source']).toBe('vue-error-handler');
    expect(typeof attributes['safesignal.vue.info']).toBe('string');
    expect(attributes['safesignal.vue.info']).not.toBe('');
    expect(attributes['safesignal.vue.componentName']).toBe('Boom');
    expect(errorValue).toBeInstanceOf(Error);
    expect((errorValue as Error).message).toBe('render boom');
  });

  it('forwards a non-Error thrown value without throwing', () => {
    const { logger, error } = mockLogger();
    expect(() =>
      mountVue(boomComponent('plain-string-error'), (app) => {
        app.config.errorHandler = createErrorHandler(logger);
      }),
    ).not.toThrow();
    expect(error).toHaveBeenCalledTimes(1);
    const [, , errorValue] = error.mock.calls[0] as [
      string,
      Attributes,
      unknown,
    ];
    expect(errorValue).toBe('plain-string-error');
  });

  it('swallows a throwing logger.error (fail-safe)', () => {
    const error = vi.fn(() => {
      throw new Error('logger blew up');
    });
    const logger = { error } as unknown as Logger;
    expect(() =>
      mountVue(boomComponent(), (app) => {
        app.config.errorHandler = createErrorHandler(logger);
      }),
    ).not.toThrow();
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe('safesignalErrorHandler — plugin install (FR-V2)', () => {
  it('sets app.config.errorHandler and provides loggerKey, with no other side effects', () => {
    const { logger, error } = mockLogger();
    const { app } = mountVue(boomComponent(), (a) => {
      a.use(safesignalErrorHandler, { logger });
    });

    // The app handler was wired and fired for the render crash.
    expect(typeof app.config.errorHandler).toBe('function');
    expect(error).toHaveBeenCalledTimes(1);
    expect(
      (error.mock.calls[0] as [string, Attributes, unknown])[1][
        'safesignal.source'
      ],
    ).toBe('vue-error-handler');
  });

  it('provides the logger so descendant composables resolve it via inject', () => {
    const { logger, error } = mockLogger();
    let logError: ((e: unknown, a?: Attributes) => void) | undefined;
    const Child = defineComponent({
      setup() {
        logError = useLogError();
        return () => h('span', 'ok');
      },
    });
    mountVue(Child, (a) => a.use(safesignalErrorHandler, { logger }));
    logError?.(new Error('via inject'));
    expect(error).toHaveBeenCalledTimes(1);
    expect(
      (error.mock.calls[0] as [string, Attributes, unknown])[1][
        'safesignal.source'
      ],
    ).toBe('vue-use-log-error');
  });
});

// ---------------------------------------------------------------------------
// US2 — useLogError (FR-V3/V5/V9)
// ---------------------------------------------------------------------------

describe('useLogError — manual-report contract (FR-V3/V9)', () => {
  it('emits an error-level event with the hook source marker + merged attributes', () => {
    const { logger, error } = mockLogger();
    let logError: ((e: unknown, a?: Attributes) => void) | undefined;
    const Comp = defineComponent({
      setup() {
        logError = useLogError(logger);
        return () => h('span', 'ok');
      },
    });
    mountVue(Comp);
    logError?.(new Error('handler boom'), { 'safesignal.action': 'save' });

    expect(error).toHaveBeenCalledTimes(1);
    const [message, attributes, errorValue] = error.mock.calls[0] as [
      string,
      Attributes,
      unknown,
    ];
    expect(message).toBe('Reported error');
    expect(attributes['safesignal.source']).toBe('vue-use-log-error');
    expect(attributes['safesignal.action']).toBe('save');
    expect((errorValue as Error).message).toBe('handler boom');
  });

  it('prefers the explicit override logger over the injected one', () => {
    const ctx = mockLogger();
    const override = mockLogger();
    let logError: ((e: unknown, a?: Attributes) => void) | undefined;
    const Comp = defineComponent({
      setup() {
        logError = useLogError(override.logger);
        return () => h('span', 'ok');
      },
    });
    mountVue(Comp, (a) => a.provide(loggerKey, ctx.logger));
    logError?.(new Error('x'));
    expect(override.error).toHaveBeenCalledTimes(1);
    expect(ctx.error).not.toHaveBeenCalled();
  });

  it('returns a stable callback identity across re-renders for a fixed logger', async () => {
    const { logger } = mockLogger();
    const seen: Array<(e: unknown, a?: Attributes) => void> = [];
    const tick = ref(0);
    const Comp = defineComponent({
      setup() {
        const logError = useLogError(logger);
        return () => {
          seen.push(logError);
          return h('span', String(tick.value));
        };
      },
    });
    mountVue(Comp);
    tick.value = 1;
    await nextTick();
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[0]).toBe(seen[seen.length - 1]);
  });

  it('is a safe no-op (no throw, no emission) when no logger resolves', () => {
    let logError: ((e: unknown, a?: Attributes) => void) | undefined;
    const Comp = defineComponent({
      setup() {
        logError = useLogError();
        return () => h('span', 'ok');
      },
    });
    mountVue(Comp);
    expect(() => logError?.(new Error('no logger'))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// US3 — useErrorCapture subtree boundary (FR-V4/V5/V9)
// ---------------------------------------------------------------------------

describe('useErrorCapture — subtree boundary contract (FR-V4/V9)', () => {
  /** A wrapper whose setup installs useErrorCapture around a throwing child. */
  function wrapper(
    options: Parameters<typeof useErrorCapture>[0],
    appHandler?: ReturnType<typeof vi.fn>,
  ): MockLogger & { mount: () => void } {
    const ml = mockLogger();
    const Boom = boomComponent(new Error('child boom'));
    const Wrapper = defineComponent({
      setup() {
        useErrorCapture({ logger: ml.logger, ...options });
        return () => h(Boom);
      },
    });
    return {
      ...ml,
      mount: () =>
        mountVue(Wrapper, (a) => {
          if (appHandler) a.config.errorHandler = appHandler;
        }),
    };
  }

  it('logs a captured descendant error once with the capture source marker', () => {
    const w = wrapper({});
    w.mount();
    expect(w.error).toHaveBeenCalledTimes(1);
    const [message, attributes, errorValue] = w.error.mock.calls[0] as [
      string,
      Attributes,
      unknown,
    ];
    expect(message).toBe('Vue captured error');
    expect(attributes['safesignal.source']).toBe('vue-error-captured');
    expect((errorValue as Error).message).toBe('child boom');
  });

  it('stops propagation by default (the app-level handler does not also log)', () => {
    const appHandler = vi.fn();
    const w = wrapper({}, appHandler);
    w.mount();
    expect(w.error).toHaveBeenCalledTimes(1);
    expect(appHandler).not.toHaveBeenCalled();
  });

  it('keeps propagating when { propagate: true }', () => {
    const appHandler = vi.fn();
    const w = wrapper({ propagate: true }, appHandler);
    w.mount();
    expect(w.error).toHaveBeenCalledTimes(1);
    expect(appHandler).toHaveBeenCalledTimes(1);
  });

  it('invokes onError fail-safe AFTER logging, even when onError throws', () => {
    const onError = vi.fn(() => {
      throw new Error('onError blew up');
    });
    const w = wrapper({ onError });
    expect(() => w.mount()).not.toThrow();
    expect(w.error).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    const [errArg, infoArg] = onError.mock.calls[0] as unknown as [
      unknown,
      string,
    ];
    expect((errArg as Error).message).toBe('child boom');
    expect(typeof infoArg).toBe('string');
  });

  it('is a safe no-op when no logger resolves', () => {
    const Boom = boomComponent();
    const Wrapper = defineComponent({
      setup() {
        useErrorCapture(); // no logger, none provided
        return () => h(Boom);
      },
    });
    expect(() => mountVue(Wrapper)).not.toThrow();
  });
});
