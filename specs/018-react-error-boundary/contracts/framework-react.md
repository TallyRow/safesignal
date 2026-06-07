# Contract: `./framework-react` — `LogErrorBoundary`, `useLogError`, `LoggerProvider`

**Spec**: ../spec.md · **Plan**: ../plan.md · **Constitution**: v1.5.0 (IV, VIII, III, V, VII, XI)

Public surface of the new opt-in `./framework-react` subpath. Behavior is normative; the exact
TypeScript types are settled here and implemented in `src/framework-react/index.ts`.

## Exports

```ts
import {
  LogErrorBoundary,
  useLogError,
  LoggerProvider,
  LoggerContext,
} from '@tallyrow/safesignal/framework-react';
import type {
  LogErrorBoundaryProps,
  LoggerProviderProps,
} from '@tallyrow/safesignal/framework-react';
```

- `react` is a **peer dependency** (`>=16.8.0`), provided by the consumer and externalized from the
  bundle. The core `.` entry and every other subpath remain React-free.

## Signatures (normative)

```ts
// React context carrying the consumer's Logger for a subtree. Default: undefined.
export const LoggerContext: React.Context<Logger | undefined>;

export interface LoggerProviderProps {
  logger: Logger;
  children?: React.ReactNode; // optional (React-idiomatic, like PropsWithChildren)
}
export function LoggerProvider(props: LoggerProviderProps): React.ReactElement;

export interface LogErrorBoundaryProps {
  children?: React.ReactNode; // optional (React-idiomatic; JSX still supplies it)
  /** Explicit logger; falls back to LoggerContext. */
  logger?: Logger;
  /** Rendered when an error is caught. Default: null (render nothing). */
  fallback?: React.ReactNode | ((error: unknown, reset: () => void) => React.ReactNode);
  /** Optional consumer hook, invoked fail-safe AFTER logging. */
  onError?: (error: unknown, info: { componentStack: string }) => void;
  /** Changing any key (shallow compare) clears caught state and re-mounts children. */
  resetKeys?: ReadonlyArray<unknown>;
}
export class LogErrorBoundary extends React.Component<LogErrorBoundaryProps> { /* … */ }

/** Stable callback for errors a boundary cannot catch (handlers, async, effects). */
export function useLogError(
  loggerOverride?: Logger,
): (error: unknown, attributes?: Attributes) => void;
```

## Behavioral guarantees (FR-R#)

- **FR-R1 (catch + log)**: `LogErrorBoundary` catches descendant errors thrown during **render,
  lifecycle, or constructor** (`getDerivedStateFromError` + `componentDidCatch`) and emits an
  `error`-level event via the resolved `Logger.error(message, attributes, error)`, including
  `attributes['safesignal.react.componentStack']` from `componentDidCatch`'s `info`. (spec FR-002)
- **FR-R2 (fallback)**: After catching, it renders `fallback` (node, or `(error, reset) => node`) in
  place of the crashed subtree; with no `fallback` it renders `null`. It never re-throws the original
  error. Components outside the boundary are unaffected. (spec FR-003)
- **FR-R3 (useLogError)**: `useLogError(loggerOverride?)` returns a `useCallback`-**stable** callback
  that emits an `error`-level event via the resolved logger. Identity is stable across re-renders for
  a fixed resolved logger (safe in dependency arrays). (spec FR-004)
- **FR-R4 (fail-closed)**: All emission goes through `Logger.error` — the **same** sanitize → URL-scrub
  → redact (drop-on-failure) → guard pipeline as any log. No bypass path. A secret in the
  message/stack/componentStack is masked (or the event dropped) before any transport. (spec FR-005)
- **FR-R5 (fail-safe, no loop)**: A throw inside the logging path (or `onError`) is swallowed (routed
  to `onError`/diagnostics, never re-thrown) and **never prevents the fallback from rendering** or
  propagates to the page. The boundary adds no path that re-catches an error thrown by its own
  fallback (React propagates that upward). (spec FR-006)
- **FR-R6 (no globals)**: The helpers attach **no** global listeners, patch **no** globals
  (`window.onerror`, `addEventListener`, console, etc.), start no timers, and read no ambient state.
  Errors flow only through the explicitly resolved logger. (spec FR-007)
- **FR-R7 (reset / recovery)**: Changing any `resetKeys` value while caught, or calling the `reset`
  passed to a render-prop fallback, clears caught state and re-mounts `children`. (spec FR-008)
- **FR-R8 (react peer, core neutral)**: `react` is a peer dependency, externalized; the core entry
  imports zero React and exposes no React API. (spec FR-009)
- **FR-R9 (attributed + source-marked)**: Events carry the resolved logger's identity and
  `attributes['safesignal.source']` = `'react-error-boundary'` | `'react-use-log-error'`, separable
  from `./capture` events and ordinary logs. Consumer `attributes` merge in; props/state are **not**
  auto-captured. (spec FR-010)
- **FR-R10 (no logger ⇒ safe no-op)**: When neither an explicit override nor a `LoggerContext` value
  resolves, the helper performs **no emission** and never throws; behavior is documented. (spec FR-011)
- **FR-R11 (honest surface)**: `./framework-react` is added to the documented public-subpath set and
  the Feature 012 parity gate; the subpath bundle is vendor-neutral and externalizes `react`. (spec
  FR-012)

## Emitted-event shape (post-pipeline)

```jsonc
{
  "level": "error",
  "message": "React render error",          // or "Reported error" / consumer message
  "attributes": {
    "safesignal.source": "react-error-boundary",   // or "react-use-log-error"
    "safesignal.react.componentStack": "<scrubbed component stack>",  // boundary only
    // ...consumer-supplied attributes (sanitized/redacted/bounded)
  },
  "error": { "name": "…", "message": "<scrubbed>", "stack": "<scrubbed>" }
}
```

## Enforcement (Principle X — every gate has a test)

| Guarantee | Enforcing test |
|-----------|----------------|
| FR-R1/R2/R3/R7/R9/R10 (API + behavior) | `tests/contract/framework-react.contract.test.ts` |
| FR-R1/R2/R7 end-to-end + sibling isolation + SSR | `tests/integration/framework-react.integration.test.ts` |
| FR-R4 fail-closed redaction (msg/stack/componentStack) | `tests/security/framework-react-redaction.security.test.ts` |
| FR-R8/R11 react externalized + vendor-neutral + default-entry isolation | `tests/security/framework-react-bundle-shape.security.test.ts` |
| FR-R6/R8 no-globals + only `src/framework-react/**` imports `react`; core imports zero React | `tests/contract/react-import-boundary.test.ts` |
| FR-R11 parity + per-entry triple | `tests/contract/distributed-surface.contract.test.ts`, `tests/contract/dependency-pins.test.ts` |
| FR-R5 fail-safe (logging throw → fallback still renders, no loop) | `tests/integration/framework-react.integration.test.ts` (failure cases) |
