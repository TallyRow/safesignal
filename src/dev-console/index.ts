/**
 * Developer-friendly dev-mode console rendering — the `./dev-console` subpath.
 *
 * `DevConsoleTransport` is a **sibling** of the built-in `ConsoleTransport` (it
 * does NOT modify it): a pretty-rendering alternative for **development**. The
 * consumer selects it only in development so their production bundler
 * tree-shakes it out entirely:
 *
 *     transports: [ import.meta.env.DEV ? DevConsoleTransport() : ConsoleTransport() ]
 *
 * In `environment: 'development'` (read from the event, a runtime decision —
 * never SafeSignal's build-time `__DEV__`) with rich console support, `send`
 * renders a collapsed group per entry: a level icon/color header (message +
 * `app · module · env`), the attributes, the error (name/message + stack), and
 * a trace link when a trace context is present. In any non-development
 * environment — or where rich console features are absent — it behaves exactly
 * like `ConsoleTransport` (`console[level](event.message, event)`).
 *
 * Safety (mirrors the package's guarantees — see
 * `specs/015-dev-console-rendering/contracts/dev-console.md`):
 *   - Structured-only: renders ONLY the post-pipeline (sanitized + redacted +
 *     bounded) event; the attributes object is logged by reference, never
 *     re-serialized or re-walked (Principle IV/V; DC-5).
 *   - No globals / no ambient: attaches no listeners and reads no ambient host
 *     state — it operates solely on the event passed to `send()` (Principle
 *     VIII; DC-6).
 *   - Fail-safe: the whole `send` body is wrapped; a throwing console method or
 *     a throwing `traceUrl` is swallowed and never reaches the page (Principle
 *     III; DC-4/DC-7).
 *   - Carry-only trace: links are built only from the event's existing trace
 *     ids; none are minted (DC-8).
 *
 * The only `src/` import is **type-only** from `../api/types.js`, so this bundle
 * shares no runtime state with the core and stays vendor-neutral.
 */

import type { LogEvent, Transport } from '../api/types.js';

/** Options for {@link DevConsoleTransport}. */
export interface DevConsoleTransportOptions {
  /** `Transport.name` for diagnostics. Default `'dev-console'`. */
  name?: string;
  /**
   * Format a clickable trace URL from the event's existing trace ids (devtools
   * auto-linkifies URLs). Invoked with **only** `{ traceId, spanId }` —
   * carry-only, no ids minted. When omitted, the ids are rendered as text. A
   * throw from it is swallowed (fail-safe) and the ids are rendered instead.
   */
  traceUrl?: (trace: { traceId: string; spanId: string }) => string;
  /**
   * Force `%c` styling on/off. Default: auto — on, since the pretty path is
   * only taken when grouping is supported (`%c` is a harmless no-op in Node).
   */
  colors?: boolean;
}

type ConsoleMethod = (message?: unknown, ...optional: unknown[]) => void;

/** Per-level icon + devtools color. Presentation only. */
const LEVEL_STYLE: Record<LogEvent['level'], { icon: string; color: string }> =
  {
    debug: { icon: '🐛', color: '#6b7280' },
    info: { icon: 'ℹ️', color: '#2563eb' },
    warn: { icon: '⚠️', color: '#d97706' },
    error: { icon: '⛔', color: '#dc2626' },
  };

const DIM_STYLE = 'color:#9ca3af';

/** Resolve `console[level]`, mirroring the built-in `ConsoleTransport`. */
function resolveConsoleMethod(level: LogEvent['level']): ConsoleMethod {
  const slot = (console as unknown as Record<string, unknown>)[level];
  if (typeof slot === 'function') {
    return (slot as ConsoleMethod).bind(console);
  }
  return console.log.bind(console);
}

/** True only when the grouping primitives the pretty path needs are functions. */
function richConsoleAvailable(): boolean {
  const c = console as unknown as Record<string, unknown>;
  return (
    typeof c.groupCollapsed === 'function' && typeof c.groupEnd === 'function'
  );
}

/** The current value (the structured-only form) — identical to `ConsoleTransport`. */
function structuredFallback(event: LogEvent): void {
  resolveConsoleMethod(event.level)(event.message, event);
}

/** `app · module · env` summary; absent parts render as an em dash. */
function contextSummary(event: LogEvent): string {
  const app = event.context.application?.name ?? '—';
  const mod = event.context.module?.name ?? '—';
  const env = event.context.environment ?? '—';
  return `${app} · ${mod} · ${env}`;
}

/**
 * Render the trace link from the event's existing trace context (carry-only).
 * Returns the formatted URL via `traceUrl`, or the raw ids when no formatter is
 * given (or when it throws — fail-safe).
 */
function traceLink(
  event: LogEvent,
  traceUrl: DevConsoleTransportOptions['traceUrl'],
): string | undefined {
  const trace = event.context.trace;
  if (!trace) return undefined;
  const ids = { traceId: trace.traceId, spanId: trace.spanId };
  if (traceUrl) {
    try {
      return traceUrl(ids);
    } catch {
      // A throwing formatter must not break rendering — fall back to the ids.
    }
  }
  return `${ids.traceId}/${ids.spanId}`;
}

/** Pretty-render one dev event as a collapsed group. */
function renderGroup(
  event: LogEvent,
  options: DevConsoleTransportOptions,
): void {
  const useColors = options.colors ?? true;
  const { icon, color } = LEVEL_STYLE[event.level];
  const level = event.level.toUpperCase();
  const summary = contextSummary(event);

  if (useColors) {
    console.groupCollapsed(
      `%c${icon} ${level}%c ${event.message}%c  ${summary}`,
      `color:${color};font-weight:bold`,
      '',
      DIM_STYLE,
    );
  } else {
    console.groupCollapsed(`${icon} ${level} ${event.message}  ${summary}`);
  }

  try {
    // Attributes: log the object BY REFERENCE — devtools stays interactive and
    // the renderer never re-serializes or re-walks the bounded event (DC-5).
    if (Object.keys(event.attributes).length > 0) {
      console.log(event.attributes);
    }
    if (event.error) {
      console.log(`${event.error.name}: ${event.error.message}`);
      if (event.error.stack) console.log(event.error.stack);
    }
    const link = traceLink(event, options.traceUrl);
    if (link !== undefined) {
      console.log(`↳ trace  ${link}`);
    }
  } finally {
    console.groupEnd();
  }
}

/**
 * A pretty, dev-only console transport. Renders the post-pipeline event
 * beautifully in development; in non-development environments (or without rich
 * console support) it behaves exactly like the built-in `ConsoleTransport`.
 * Never throws.
 */
export const DevConsoleTransport: (
  options?: DevConsoleTransportOptions,
) => Transport = (options: DevConsoleTransportOptions = {}): Transport => ({
  name: options.name ?? 'dev-console',
  send(event: LogEvent): void {
    try {
      if (
        event.context.environment !== 'development' ||
        !richConsoleAvailable()
      ) {
        structuredFallback(event);
        return;
      }
      renderGroup(event, options);
    } catch {
      // Fail-safe (Principle III): rendering MUST NEVER throw into the page.
    }
  },
});
