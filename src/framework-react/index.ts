/**
 * React error handling — the `./framework-react` subpath.
 *
 * The **no-globals, React-native counterpart** to `./capture`: a per-component
 * `<LogErrorBoundary>` plus a `useLogError()` hook that route React errors
 * through a consumer-provided `Logger`'s existing secure pipeline (sanitize →
 * URL-scrub → redact → guard → transport) by calling `logger.error(...)`. Where
 * `./capture` is a single host-level *global* install, this is explicit,
 * per-subtree, and side-effect-free — it patches nothing and attaches no global
 * listeners.
 *
 * Properties (see `specs/018-react-error-boundary/contracts/framework-react.md`):
 *   - Fail-closed: emits via `logger.error`, so messages / stacks / component
 *     stacks are redacted + sanitized (drop-on-failure) before any transport.
 *   - Fail-safe: a logging (or `onError`) throw is swallowed; the fallback still
 *     renders and nothing propagates to the page (Principle III). React's own
 *     semantics keep it loop-free (a boundary does not catch errors thrown while
 *     rendering its own fallback).
 *   - No-globals: no `window.onerror`, no `addEventListener`, no monkey-patching,
 *     no timers, no ambient reads (Principle VIII).
 *   - Framework-neutral-preserving: `react` is an externalized **peer** import,
 *     so the core entry and every other subpath stay React-free (Principle IV).
 *
 * The only intra-package `src/` import is **type-only** from `../api/types.js`;
 * the single runtime external is `react` (the consumer-provided peer). No
 * runtime state is shared with the core — the helpers operate solely through the
 * passed/contextual `Logger`.
 */

import {
  Component,
  createContext,
  createElement,
  useCallback,
  useContext,
} from 'react';
import type { Context, ErrorInfo, ReactElement, ReactNode } from 'react';
import type { Attributes, Logger } from '../api/types.js';

/** `safesignal.source` marker for boundary-caught render errors. */
const SOURCE_BOUNDARY = 'react-error-boundary';
/** `safesignal.source` marker for errors reported via {@link useLogError}. */
const SOURCE_HOOK = 'react-use-log-error';

/**
 * React context carrying the consumer's `Logger` for a subtree. Default
 * `undefined` — when no provider/override resolves a logger the helpers are a
 * safe no-op (they never mint a fallback logger, which would couple this bundle
 * to the core runtime). React-scoped, never a global registry.
 */
export const LoggerContext: Context<Logger | undefined> = createContext<
  Logger | undefined
>(undefined);

/** Props for {@link LoggerProvider}. */
export interface LoggerProviderProps {
  /** The consumer's configured `Logger`, shared with the subtree. */
  logger: Logger;
  children?: ReactNode;
}

/**
 * Supplies a `Logger` to {@link LogErrorBoundary} / {@link useLogError} within a
 * subtree. Pure context plumbing — no globals, no side effects.
 */
export function LoggerProvider(props: LoggerProviderProps): ReactElement {
  return createElement(
    LoggerContext.Provider,
    { value: props.logger },
    props.children,
  );
}

/** A node, or a render-prop given the caught error + a reset callback. */
type FallbackRender =
  | ReactNode
  | ((error: unknown, reset: () => void) => ReactNode);

/** Props for {@link LogErrorBoundary}. */
export interface LogErrorBoundaryProps {
  children?: ReactNode;
  /** Explicit logger override; falls back to {@link LoggerContext}. */
  logger?: Logger;
  /** Rendered when an error is caught. Default: `null` (render nothing). */
  fallback?: FallbackRender;
  /** Optional consumer hook, invoked fail-safe AFTER logging. */
  onError?: (error: unknown, info: { componentStack: string }) => void;
  /** Changing any key (shallow compare) clears caught state + re-mounts. */
  resetKeys?: ReadonlyArray<unknown>;
}

interface LogErrorBoundaryState {
  caught: boolean;
  error: unknown;
}

/** Shallow, order-sensitive comparison of two reset-key arrays. */
function resetKeysChanged(
  prev: ReadonlyArray<unknown> | undefined,
  next: ReadonlyArray<unknown> | undefined,
): boolean {
  if (prev === next) return false;
  if (prev === undefined || next === undefined) return true;
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i += 1) {
    if (!Object.is(prev[i], next[i])) return true;
  }
  return false;
}

/**
 * Catches descendant render / lifecycle / constructor errors, logs them through
 * the resolved `Logger` (with the React component stack), and renders a fallback
 * in place of the crashed subtree. Errors React cannot catch this way (event
 * handlers, async) belong to {@link useLogError}.
 */
export class LogErrorBoundary extends Component<
  LogErrorBoundaryProps,
  LogErrorBoundaryState
> {
  static override contextType = LoggerContext;
  declare context: Logger | undefined;

  constructor(props: LogErrorBoundaryProps) {
    super(props);
    this.state = { caught: false, error: undefined };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error: unknown): LogErrorBoundaryState {
    return { caught: true, error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    const componentStack =
      typeof info.componentStack === 'string' ? info.componentStack : '';
    const logger = this.props.logger ?? this.context;
    try {
      const attributes: Attributes = { 'safesignal.source': SOURCE_BOUNDARY };
      if (componentStack) {
        attributes['safesignal.react.componentStack'] = componentStack;
      }
      logger?.error('React render error', attributes, error);
    } catch {
      // Fail-safe: a logging failure must never escalate the original crash.
    }
    try {
      this.props.onError?.(error, { componentStack });
    } catch {
      // Fail-safe: a consumer onError that throws must not break the fallback.
    }
  }

  override componentDidUpdate(prevProps: LogErrorBoundaryProps): void {
    if (!this.state.caught) return;
    if (resetKeysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.reset();
    }
  }

  reset(): void {
    this.setState({ caught: false, error: undefined });
  }

  override render(): ReactNode {
    if (!this.state.caught) return this.props.children;
    const { fallback } = this.props;
    if (typeof fallback === 'function') {
      return fallback(this.state.error, this.reset);
    }
    return fallback ?? null;
  }
}

/**
 * Returns a **stable** callback that logs an error through the resolved logger
 * (`loggerOverride` ?? {@link LoggerContext}) as an `error`-level event — for the
 * errors a boundary cannot catch (event handlers, async/`Promise` callbacks,
 * effects). Fail-safe; a **safe no-op** when no logger resolves. The callback
 * identity is stable across re-renders for a fixed resolved logger (safe in
 * dependency arrays).
 */
export function useLogError(
  loggerOverride?: Logger,
): (error: unknown, attributes?: Attributes) => void {
  const contextLogger = useContext(LoggerContext);
  const logger = loggerOverride ?? contextLogger;
  return useCallback(
    (error: unknown, attributes?: Attributes): void => {
      try {
        const attrs: Attributes = {
          'safesignal.source': SOURCE_HOOK,
          ...(attributes ?? {}),
        };
        logger?.error('Reported error', attrs, error);
      } catch {
        // Fail-safe: reporting an error must never throw into the caller.
      }
    },
    [logger],
  );
}
