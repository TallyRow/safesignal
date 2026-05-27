/**
 * Built-in `ConsoleTransport`. Passes events to `console[level]` with the
 * event message as the first argument and the **structured `LogEvent`
 * object as the second argument** — never interpolated into a single
 * string. Falls back to `console.log` only when `console[level]` is not a
 * function (the modern browser console always defines all four levels).
 *
 * This is the only built-in delivery path that produces visible output.
 * Console output preserves the structured-only invariant (FR-016, plan
 * §Log-injection & output safety).
 */

import type { LogEvent, Transport, TransportFactory } from '../api/types.js';

type ConsoleMethod = (message?: unknown, ...optional: unknown[]) => void;

function resolveConsoleMethod(level: LogEvent['level']): ConsoleMethod {
  const slot = (console as unknown as Record<string, unknown>)[level];
  if (typeof slot === 'function') {
    return (slot as ConsoleMethod).bind(console);
  }
  return console.log.bind(console);
}

export const ConsoleTransport: TransportFactory = (): Transport => ({
  name: 'console',
  send(event: LogEvent): void {
    const log = resolveConsoleMethod(event.level);
    log(event.message, event);
  },
});
