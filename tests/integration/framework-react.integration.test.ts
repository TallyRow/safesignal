/**
 * Integration / failure-safety test: `./framework-react`
 * (specs/018-react-error-boundary — FR-R1/R2/R5/R7, SSR; SC-001/SC-004/SC-007).
 *
 * End-to-end through the real pipeline + a capturing transport, rendered into
 * happy-dom. Proves: a render crash is delivered as a redacted error event AND
 * a fallback renders (siblings unaffected); resetKeys recover the subtree; a
 * throwing logger/onError is swallowed and the fallback still renders with no
 * catch/render loop; and the components render under SSR.
 */

import { createElement } from 'react';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogErrorBoundary } from '../../src/framework-react/index.js';
import type { Logger } from '../../src/index.js';
import { configureLogging, createLogger } from '../../src/index.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';
import { mount } from '../helpers/react.js';

let consoleErr: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleErr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  consoleErr.mockRestore();
});

function Boom(): ReactElement {
  throw new Error('render boom');
}

describe('framework-react — end-to-end through the pipeline (SC-001)', () => {
  it('delivers a render crash as an error-level event AND renders the fallback; siblings unaffected', () => {
    const capturing = makeCapturingTransport();
    configureLogging({ environment: 'production', transports: [capturing] });
    const logger = createLogger({ module: { name: 'checkout' } });

    const { container } = mount(
      createElement(
        'div',
        null,
        createElement(
          LogErrorBoundary,
          { logger, fallback: createElement('p', null, 'fallback') },
          createElement(Boom),
        ),
        createElement('span', null, 'sibling-ok'),
      ),
    );

    // Event delivered through the real pipeline to the transport.
    const events = capturing.calls.filter(
      (e) => e.attributes['safesignal.source'] === 'react-error-boundary',
    );
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event?.level).toBe('error');
    expect(event?.message).toBe('React render error');
    expect(event?.error?.message).toBe('render boom');
    expect(typeof event?.attributes['safesignal.react.componentStack']).toBe(
      'string',
    );

    // Fallback rendered; the sibling outside the boundary still renders.
    expect(container.textContent).toContain('fallback');
    expect(container.textContent).toContain('sibling-ok');
  });
});

describe('framework-react — recovery via resetKeys (FR-R7 / SC-007)', () => {
  it('re-mounts children after a reset-key change', () => {
    const capturing = makeCapturingTransport();
    configureLogging({ environment: 'production', transports: [capturing] });
    const logger = createLogger();

    const crashed = mount(
      createElement(
        LogErrorBoundary,
        { logger, resetKeys: [1], fallback: 'fallback' },
        createElement(Boom),
      ),
    );
    expect(crashed.container.textContent).toBe('fallback');

    // Change the reset key and swap in a non-throwing child → subtree re-mounts.
    crashed.rerender(
      createElement(
        LogErrorBoundary,
        { logger, resetKeys: [2], fallback: 'fallback' },
        createElement('span', null, 'recovered'),
      ),
    );
    expect(crashed.container.textContent).toBe('recovered');
  });
});

describe('framework-react — fail-safety (FR-R5 / SC-004)', () => {
  function throwingLogger(error: ReturnType<typeof vi.fn>): Logger {
    return {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error,
      child: vi.fn(),
      withContext: vi.fn(),
    } as unknown as Logger;
  }

  it('swallows a throwing logger.error; the fallback still renders; no catch/render loop', () => {
    const error = vi.fn(() => {
      throw new Error('logger blew up');
    });
    const logger = throwingLogger(error);

    let mounted: ReturnType<typeof mount> | undefined;
    expect(() => {
      mounted = mount(
        createElement(
          LogErrorBoundary,
          { logger, fallback: 'still-here' },
          createElement(Boom),
        ),
      );
    }).not.toThrow();

    expect(mounted?.container.textContent).toBe('still-here');
    // Called exactly once — the swallowed throw does not re-trigger capture.
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('swallows a throwing onError; the fallback still renders', () => {
    const capturing = makeCapturingTransport();
    configureLogging({ environment: 'production', transports: [capturing] });
    const logger = createLogger();
    const onError = vi.fn(() => {
      throw new Error('onError blew up');
    });

    let mounted: ReturnType<typeof mount> | undefined;
    expect(() => {
      mounted = mount(
        createElement(
          LogErrorBoundary,
          { logger, onError, fallback: 'rendered' },
          createElement(Boom),
        ),
      );
    }).not.toThrow();
    expect(mounted?.container.textContent).toBe('rendered');
  });
});

describe('framework-react — server-side rendering (SSR smoke)', () => {
  it('renders a boundary subtree to a string without throwing', () => {
    const logger = createLogger();
    let html = '';
    expect(() => {
      html = renderToString(
        createElement(
          LogErrorBoundary,
          { logger, fallback: 'fb' },
          createElement('span', null, 'ssr-ok'),
        ),
      );
    }).not.toThrow();
    expect(html).toContain('ssr-ok');
  });
});
