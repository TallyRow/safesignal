/**
 * Contract test: `./framework-react` — LogErrorBoundary + useLogError
 * (specs/018-react-error-boundary — FR-R1/R2/R3/R7/R9/R10; contracts/framework-react.md).
 *
 * Uses a mock `Logger` (a spy on `error`) to assert the exact emission contract
 * (message, source marker, component stack, forwarded error value) without
 * running the full pipeline — the pipeline's fail-closed redaction is proven
 * separately in the security test. React is rendered into happy-dom via the
 * `mount` helper (createElement, no JSX).
 */

import { createElement } from 'react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LogErrorBoundary,
  LoggerProvider,
  useLogError,
} from '../../src/framework-react/index.js';
import type { Attributes, Logger } from '../../src/index.js';
import { mount } from '../helpers/react.js';

// React logs caught errors to console.error in dev; silence to keep output clean.
let consoleErr: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleErr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  consoleErr.mockRestore();
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
function Boom(props: { value?: unknown }): ReactElement {
  throw 'value' in props ? props.value : new Error('boom');
}

describe('LogErrorBoundary — emission contract (FR-R1/R2/R9)', () => {
  it('catches a descendant render error and emits one error-level event with source + component stack', () => {
    const { logger, error } = mockLogger();

    mount(
      createElement(
        LogErrorBoundary,
        { logger, fallback: 'fallback-ui' },
        createElement(Boom),
      ),
    );

    expect(error).toHaveBeenCalledTimes(1);
    const call = error.mock.calls[0] as [string, Attributes, unknown];
    const [message, attributes, errorValue] = call;
    expect(message).toBe('React render error');
    expect(attributes['safesignal.source']).toBe('react-error-boundary');
    expect(typeof attributes['safesignal.react.componentStack']).toBe('string');
    expect(attributes['safesignal.react.componentStack']).not.toBe('');
    expect(errorValue).toBeInstanceOf(Error);
    expect((errorValue as Error).message).toBe('boom');
  });

  it('resolves the logger from LoggerProvider context when no logger prop is given', () => {
    const { logger, error } = mockLogger();

    mount(
      createElement(
        LoggerProvider,
        { logger },
        createElement(LogErrorBoundary, { fallback: 'x' }, createElement(Boom)),
      ),
    );

    expect(error).toHaveBeenCalledTimes(1);
  });

  it('invokes onError (fail-safe) after logging, with the component stack', () => {
    const { logger } = mockLogger();
    const onError = vi.fn();

    mount(
      createElement(
        LogErrorBoundary,
        { logger, onError, fallback: 'x' },
        createElement(Boom),
      ),
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const [err, info] = onError.mock.calls[0] as [
      unknown,
      { componentStack: string },
    ];
    expect(err).toBeInstanceOf(Error);
    expect(typeof info.componentStack).toBe('string');
  });
});

describe('LogErrorBoundary — fallback rendering (FR-R2)', () => {
  it('renders a ReactNode fallback in place of the crashed subtree', () => {
    const { logger } = mockLogger();
    const { container } = mount(
      createElement(
        LogErrorBoundary,
        { logger, fallback: 'fell-back' },
        createElement(Boom),
      ),
    );
    expect(container.textContent).toBe('fell-back');
  });

  it('renders a render-prop fallback with the error and a reset callback', () => {
    const { logger } = mockLogger();
    const fallback = (error: unknown, reset: () => void): ReactElement =>
      createElement(
        'button',
        { type: 'button', onClick: reset },
        `caught:${(error as Error).message}`,
      );
    const { container } = mount(
      createElement(
        LogErrorBoundary,
        { logger, fallback },
        createElement(Boom),
      ),
    );
    const button = container.querySelector('button');
    expect(button?.textContent).toBe('caught:boom');
  });

  it('renders nothing (null) by default when no fallback is supplied', () => {
    const { logger, error } = mockLogger();
    const { container } = mount(
      createElement(LogErrorBoundary, { logger }, createElement(Boom)),
    );
    expect(container.textContent).toBe('');
    // The error is still logged even with the default null fallback.
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('renders children unchanged when nothing throws', () => {
    const { logger, error } = mockLogger();
    const { container } = mount(
      createElement(
        LogErrorBoundary,
        { logger, fallback: 'nope' },
        createElement('span', null, 'ok'),
      ),
    );
    expect(container.textContent).toBe('ok');
    expect(error).not.toHaveBeenCalled();
  });
});

describe('LogErrorBoundary — degraded inputs (FR-R10)', () => {
  it('is a safe no-op (no throw) when no logger resolves (no provider, no prop)', () => {
    expect(() =>
      mount(
        createElement(
          LogErrorBoundary,
          { fallback: 'safe' },
          createElement(Boom),
        ),
      ),
    ).not.toThrow();
  });

  it('forwards a non-Error thrown value without throwing (spec Edge Cases)', () => {
    const { logger, error } = mockLogger();
    expect(() =>
      mount(
        createElement(
          LogErrorBoundary,
          { logger, fallback: 'x' },
          createElement(Boom, { value: 'plain-string-error' }),
        ),
      ),
    ).not.toThrow();
    expect(error).toHaveBeenCalledTimes(1);
    const [, , errorValue] = error.mock.calls[0] as [
      string,
      Attributes,
      unknown,
    ];
    expect(errorValue).toBe('plain-string-error');
  });
});

describe('useLogError — hook contract (FR-R3/R9/R10)', () => {
  /** Harness that records the callback returned on each render. */
  function makeHarness(): {
    Harness: (props: { logger?: Logger; tick: number }) => ReactElement;
    callbacks: Array<(error: unknown, attributes?: Attributes) => void>;
  } {
    const callbacks: Array<(error: unknown, attributes?: Attributes) => void> =
      [];
    function Harness(props: { logger?: Logger; tick: number }): ReactElement {
      const logError = useLogError(props.logger);
      callbacks.push(logError);
      return createElement('span', null, String(props.tick));
    }
    return { Harness, callbacks };
  }

  it('returns a stable callback identity across re-renders for a fixed logger', () => {
    const { logger } = mockLogger();
    const { Harness, callbacks } = makeHarness();

    const mounted = mount(createElement(Harness, { logger, tick: 0 }));
    mounted.rerender(createElement(Harness, { logger, tick: 1 }));

    expect(callbacks.length).toBeGreaterThanOrEqual(2);
    expect(callbacks[0]).toBe(callbacks[callbacks.length - 1]);
  });

  it('emits an error-level event via the logger with the hook source marker + merged attributes', () => {
    const { logger, error } = mockLogger();
    const { Harness, callbacks } = makeHarness();

    mount(createElement(Harness, { logger, tick: 0 }));
    // Used like an event handler / async callback — outside render.
    callbacks[0]?.(new Error('handler boom'), { 'safesignal.action': 'save' });

    expect(error).toHaveBeenCalledTimes(1);
    const [message, attributes, errorValue] = error.mock.calls[0] as [
      string,
      Attributes,
      unknown,
    ];
    expect(message).toBe('Reported error');
    expect(attributes['safesignal.source']).toBe('react-use-log-error');
    expect(attributes['safesignal.action']).toBe('save');
    expect((errorValue as Error).message).toBe('handler boom');
  });

  it('resolves the logger from LoggerProvider context when no override is given', () => {
    const { logger, error } = mockLogger();
    const { Harness, callbacks } = makeHarness();

    mount(
      createElement(
        LoggerProvider,
        { logger },
        createElement(Harness, { tick: 0 }),
      ),
    );
    callbacks[0]?.(new Error('ctx'));

    expect(error).toHaveBeenCalledTimes(1);
  });

  it('prefers the explicit override logger over context', () => {
    const ctx = mockLogger();
    const override = mockLogger();
    const { Harness, callbacks } = makeHarness();

    mount(
      createElement(
        LoggerProvider,
        { logger: ctx.logger },
        createElement(Harness, { logger: override.logger, tick: 0 }),
      ),
    );
    callbacks[0]?.(new Error('x'));

    expect(override.error).toHaveBeenCalledTimes(1);
    expect(ctx.error).not.toHaveBeenCalled();
  });

  it('is a safe no-op (no throw) when no logger resolves', () => {
    const { Harness, callbacks } = makeHarness();
    mount(createElement(Harness, { tick: 0 }));
    expect(() => callbacks[0]?.(new Error('no logger'))).not.toThrow();
  });
});
