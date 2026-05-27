/**
 * Cross-platform unhandled-rejection / uncaught-exception guard.
 *
 * Used by failure-safety tests (T027, T046, T058) to assert that the package's
 * SafeTransport wrapper and dispatcher never let a transport's rejected
 * Promise or thrown error escape to the host runtime.
 *
 * Works under both the browser-shaped `happy-dom` env (where rejections fire
 * on `window`) and bare Node (where they fire on `process`). The guard
 * autodetects which surface is available.
 */

interface UnhandledEvent {
  reason: unknown;
  /** 'rejection' for unhandledrejection, 'error' for uncaught error events. */
  kind: 'rejection' | 'error';
}

export interface UnhandledGuard {
  /** Every unhandled rejection or error captured since install / last reset. */
  readonly events: ReadonlyArray<UnhandledEvent>;
  /** Throws an AssertionError if any unhandled event has been captured. */
  assertNone(): void;
  /** Clear the captured event log without uninstalling the listeners. */
  reset(): void;
  /** Remove the listeners. Safe to call more than once. */
  dispose(): void;
}

type WindowLike = {
  addEventListener: (
    type: string,
    listener: (ev: { reason?: unknown; error?: unknown; preventDefault?: () => void }) => void,
  ) => void;
  removeEventListener: (
    type: string,
    listener: (ev: { reason?: unknown; error?: unknown; preventDefault?: () => void }) => void,
  ) => void;
};

type ProcessLike = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  off: (event: string, listener: (...args: unknown[]) => void) => void;
};

function getWindow(): WindowLike | undefined {
  const g = globalThis as { window?: WindowLike };
  return typeof g.window !== 'undefined' && typeof g.window.addEventListener === 'function'
    ? g.window
    : undefined;
}

function getProcess(): ProcessLike | undefined {
  const g = globalThis as { process?: ProcessLike };
  return typeof g.process !== 'undefined' && typeof g.process.on === 'function'
    ? g.process
    : undefined;
}

/**
 * Install listeners on whatever runtime surface is available (window in
 * happy-dom, process in Node). Returns a controller for assertions and
 * cleanup. Always call `.dispose()` in `afterEach` to avoid cross-test
 * leakage.
 */
export function installUnhandledRejectionGuard(): UnhandledGuard {
  const events: UnhandledEvent[] = [];
  const win = getWindow();
  const proc = getProcess();
  let disposed = false;

  // Browser-shaped listeners
  const onWindowRejection = (ev: { reason?: unknown; preventDefault?: () => void }) => {
    events.push({ reason: ev.reason, kind: 'rejection' });
    ev.preventDefault?.();
  };
  const onWindowError = (ev: { error?: unknown; preventDefault?: () => void }) => {
    events.push({ reason: ev.error, kind: 'error' });
    ev.preventDefault?.();
  };

  // Node-shaped listeners
  const onProcessRejection = (reason: unknown) => {
    events.push({ reason, kind: 'rejection' });
  };
  const onProcessException = (err: unknown) => {
    events.push({ reason: err, kind: 'error' });
  };

  if (win) {
    win.addEventListener('unhandledrejection', onWindowRejection);
    win.addEventListener('error', onWindowError);
  }
  if (proc) {
    proc.on('unhandledRejection', onProcessRejection);
    proc.on('uncaughtException', onProcessException);
  }

  return {
    get events() {
      return events;
    },
    assertNone() {
      if (events.length === 0) return;
      const summary = events
        .map((e) => `  - [${e.kind}] ${describe(e.reason)}`)
        .join('\n');
      throw new Error(
        `Expected no unhandled rejections or errors, but ${String(events.length)} occurred:\n${summary}`,
      );
    },
    reset() {
      events.length = 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (win) {
        win.removeEventListener('unhandledrejection', onWindowRejection);
        win.removeEventListener('error', onWindowError);
      }
      if (proc) {
        proc.off('unhandledRejection', onProcessRejection);
        proc.off('uncaughtException', onProcessException);
      }
    },
  };
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
