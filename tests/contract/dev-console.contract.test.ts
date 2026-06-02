/**
 * Contract test: developer-friendly dev-mode console rendering
 * (specs/015-dev-console-rendering — DC-1..DC-4/DC-7/DC-8, FR-001/002/003/006/
 * 007/009). The `DevConsoleTransport` is exercised with directly-constructed
 * post-pipeline `LogEvent`s and a `console` spy, so behavior is deterministic
 * and independent of real devtools.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevConsoleTransport } from '../../src/dev-console/index.js';
import { ConsoleTransport } from '../../src/index.js';
import type { LogEvent, LogLevel } from '../../src/api/types.js';

function makeEvent(over: Partial<LogEvent> = {}): LogEvent {
  return {
    timestamp: '2026-06-01T00:00:00.000Z',
    level: 'info',
    message: 'checkout opened',
    attributes: {},
    context: {
      environment: 'development',
      application: { name: 'checkout-web', version: '4.2.0' },
    },
    ...over,
  };
}

/** Install spies on every console method the transport may touch. */
function spyConsole() {
  return {
    groupCollapsed: vi
      .spyOn(console, 'groupCollapsed')
      .mockImplementation(() => {}),
    groupEnd: vi.spyOn(console, 'groupEnd').mockImplementation(() => {}),
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// DC-1 / DC-2 — pretty grouped rendering in development (US1)
// ---------------------------------------------------------------------------

describe('DC-1 — development: collapsed, level-styled group header', () => {
  it('opens one groupCollapsed with an icon/level/message/context header and closes it', () => {
    const spy = spyConsole();
    DevConsoleTransport().send(makeEvent({ message: 'checkout opened' }));

    expect(spy.groupCollapsed).toHaveBeenCalledTimes(1);
    expect(spy.groupEnd).toHaveBeenCalledTimes(1);

    const [header, ...styles] = spy.groupCollapsed.mock.calls[0]!;
    expect(header).toContain('%c'); // styled
    expect(header).toContain('INFO');
    expect(header).toContain('checkout opened');
    expect(header).toContain('checkout-web · — · development'); // app · module · env
    // First %c style carries the level color, bold.
    expect(String(styles[0])).toMatch(/color:.+;font-weight:bold/);
  });

  it.each(['debug', 'info', 'warn', 'error'] as LogLevel[])(
    'renders a styled header for level %s',
    (level) => {
      const spy = spyConsole();
      DevConsoleTransport().send(makeEvent({ level }));
      const [header] = spy.groupCollapsed.mock.calls[0]!;
      expect(header).toContain(level.toUpperCase());
    },
  );

  it('colors:false renders a plain (no-%c) header', () => {
    const spy = spyConsole();
    DevConsoleTransport({ colors: false }).send(makeEvent());
    const [header, ...styles] = spy.groupCollapsed.mock.calls[0]!;
    expect(header).not.toContain('%c');
    expect(styles).toHaveLength(0);
  });
});

describe('DC-2 — group body: attributes / error / trace, each omitted when empty', () => {
  it('logs the attributes object when non-empty', () => {
    const spy = spyConsole();
    const attributes = { cartItems: 3 };
    DevConsoleTransport().send(makeEvent({ attributes }));
    expect(spy.log).toHaveBeenCalledWith(attributes);
  });

  it('omits the attributes line when attributes are empty', () => {
    const spy = spyConsole();
    DevConsoleTransport().send(makeEvent({ attributes: {} }));
    // No console.log call (no attributes, error, or trace).
    expect(spy.log).not.toHaveBeenCalled();
  });

  it('logs the error name/message and the stack when present', () => {
    const spy = spyConsole();
    DevConsoleTransport().send(
      makeEvent({
        level: 'error',
        error: { name: 'TypeError', message: 'upstream timeout', stack: 'at x' },
      }),
    );
    const logged = spy.log.mock.calls.map((c) => String(c[0]));
    expect(logged.some((l) => l.includes('TypeError: upstream timeout'))).toBe(
      true,
    );
    expect(logged.some((l) => l.includes('at x'))).toBe(true);
  });

  it('omits the trace line when no trace context is present', () => {
    const spy = spyConsole();
    DevConsoleTransport().send(makeEvent());
    const logged = spy.log.mock.calls.map((c) => String(c[0]));
    expect(logged.some((l) => l.includes('trace'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DC-8 — trace link is carry-only (US1 / FR-009)
// ---------------------------------------------------------------------------

describe('DC-8 — trace link carry-only', () => {
  const TRACE = {
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    spanId: '00f067aa0ba902b7',
  };

  it('invokes traceUrl with only { traceId, spanId } and renders the returned URL', () => {
    const spy = spyConsole();
    const traceUrl = vi.fn(
      ({ traceId }: { traceId: string; spanId: string }) =>
        `https://trace.example/${traceId}`,
    );
    DevConsoleTransport({ traceUrl }).send(
      makeEvent({ context: { environment: 'development', trace: TRACE } }),
    );
    expect(traceUrl).toHaveBeenCalledWith({
      traceId: TRACE.traceId,
      spanId: TRACE.spanId,
    });
    const logged = spy.log.mock.calls.map((c) => String(c[0]));
    expect(
      logged.some((l) => l.includes(`https://trace.example/${TRACE.traceId}`)),
    ).toBe(true);
  });

  it('renders the raw ids when no traceUrl is provided', () => {
    const spy = spyConsole();
    DevConsoleTransport().send(
      makeEvent({ context: { environment: 'development', trace: TRACE } }),
    );
    const logged = spy.log.mock.calls.map((c) => String(c[0]));
    expect(
      logged.some(
        (l) => l.includes(TRACE.traceId) && l.includes(TRACE.spanId),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DC-3 — non-development = identical to ConsoleTransport (US2 / FR-002/007)
// ---------------------------------------------------------------------------

describe('DC-3 — non-development falls back to the structured form', () => {
  it.each(['production', 'staging', 'qa-unknown'])(
    'environment %s: calls console[level](message, event) and never groups',
    (environment) => {
      const spy = spyConsole();
      const event = makeEvent({ level: 'warn', context: { environment } });
      DevConsoleTransport().send(event);

      expect(spy.groupCollapsed).not.toHaveBeenCalled();
      expect(spy.warn).toHaveBeenCalledTimes(1);
      expect(spy.warn).toHaveBeenCalledWith(event.message, event);
    },
  );

  it('DC-10 parity: in non-dev, DevConsoleTransport mirrors ConsoleTransport call-for-call', () => {
    const event = makeEvent({ level: 'info', context: { environment: 'production' } });

    const devSpy = spyConsole();
    DevConsoleTransport().send(event);
    const devCalls = devSpy.info.mock.calls.slice();
    vi.restoreAllMocks();

    const baseSpy = spyConsole();
    ConsoleTransport().send(event);
    const baseCalls = baseSpy.info.mock.calls.slice();

    expect(devSpy.groupCollapsed).not.toHaveBeenCalled();
    expect(devCalls).toEqual(baseCalls);
    expect(devCalls).toEqual([[event.message, event]]);
  });
});

// ---------------------------------------------------------------------------
// DC-4 / DC-7 — graceful degradation + fail-safe (US3 / FR-006)
// ---------------------------------------------------------------------------

describe('DC-4 / DC-7 — graceful degradation and fail-safe', () => {
  it('DC-4: without console.groupCollapsed, falls back to the structured form and never throws', () => {
    const original = console.groupCollapsed;
    // Simulate a minimal console lacking grouping.
    (console as unknown as Record<string, unknown>).groupCollapsed =
      undefined as unknown as typeof console.groupCollapsed;
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const event = makeEvent();
      expect(() => DevConsoleTransport().send(event)).not.toThrow();
      expect(infoSpy).toHaveBeenCalledWith(event.message, event);
    } finally {
      console.groupCollapsed = original;
    }
  });

  it('DC-7: a throwing console method is swallowed — send never throws', () => {
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {
      throw new Error('devtools exploded');
    });
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    expect(() => DevConsoleTransport().send(makeEvent())).not.toThrow();
  });

  it('DC-7: a throwing traceUrl is swallowed and the ids are rendered instead', () => {
    const spy = spyConsole();
    const traceUrl = (_t: { traceId: string; spanId: string }): string => {
      throw new Error('bad formatter');
    };
    const trace = {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
    };
    expect(() =>
      DevConsoleTransport({ traceUrl }).send(
        makeEvent({ context: { environment: 'development', trace } }),
      ),
    ).not.toThrow();
    const logged = spy.log.mock.calls.map((c) => String(c[0]));
    expect(logged.some((l) => l.includes(trace.traceId))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// name option
// ---------------------------------------------------------------------------

describe('Transport.name', () => {
  it('defaults to "dev-console" and is overridable', () => {
    expect(DevConsoleTransport().name).toBe('dev-console');
    expect(DevConsoleTransport({ name: 'pretty' }).name).toBe('pretty');
  });
});
