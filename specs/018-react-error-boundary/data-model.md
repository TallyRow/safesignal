# Phase 1 Data Model: `./framework-react`

The subpath introduces React constructs and one emitted-event shape. No persisted data; "state" here
means React component state. Types reference the existing public `Logger` / `Attributes` from
`../api/types.js` (type-only import).

## Entities

### LoggerContext / LoggerProvider

- **What**: A React context carrying the consumer's `Logger` for a subtree, and the `LoggerProvider`
  component that supplies it.
- **Shape**:
  - `LoggerContext: React.Context<Logger | undefined>` (default `undefined`).
  - `LoggerProvider(props: { logger: Logger; children?: React.ReactNode }): React.ReactElement`.
- **Rules**: Pure context plumbing — no globals, no side effects. Nesting providers overrides the
  logger for the inner subtree (standard React context semantics).

### LogErrorBoundary (class component)

- **What**: Catches descendant render/lifecycle/constructor errors, logs them, and renders a fallback.
- **Props** (`LogErrorBoundaryProps`):
  - `children?: React.ReactNode` — the protected subtree (optional, React-idiomatic).
  - `logger?: Logger` — explicit override; falls back to `LoggerContext`.
  - `fallback?: React.ReactNode | ((error: unknown, reset: () => void) => React.ReactNode)` — rendered
    when caught. Default: `null` (render nothing).
  - `onError?: (error: unknown, info: { componentStack: string }) => void` — optional consumer hook,
    invoked fail-safe **after** logging.
  - `resetKeys?: ReadonlyArray<unknown>` — when any value changes (shallow compare), the boundary
    clears its caught state and re-mounts `children`.
- **State** (`{ caught: boolean; error: unknown }`): `caught` toggles fallback vs children; `error` is
  passed to a render-prop fallback and to `reset`.
- **Lifecycle / rules**:
  - `static getDerivedStateFromError(error)` → `{ caught: true, error }`.
  - `componentDidCatch(error, info)` → resolve `logger = props.logger ?? this.context`; fail-safe
    `logger?.error('React render error', { 'safesignal.source': 'react-error-boundary',
    'safesignal.react.componentStack': info.componentStack }, error)`; then fail-safe `onError`.
  - `componentDidUpdate` → if `resetKeys` changed while `caught`, reset state (`reset()`).
  - A logging/`onError` throw is swallowed (never blocks the fallback). The boundary does **not** catch
    errors thrown by the fallback itself (React semantics → propagates upward); no re-catch path.

### useLogError (hook)

- **What**: Returns a stable callback to log errors boundaries cannot catch (handlers, async, effects).
- **Signature**: `useLogError(loggerOverride?: Logger): (error: unknown, attributes?: Attributes) =>
  void`.
- **Rules**: Resolves `loggerOverride ?? useContext(LoggerContext)`; returns a `useCallback`-memoized
  function (stable identity across re-renders, keyed on the resolved logger). On call, fail-safe
  `logger?.error('Reported error', { 'safesignal.source': 'react-use-log-error', ...attributes },
  error)`. **Safe no-op** when no logger resolves. Never throws.

### Caught React Error Event (emitted, not stored)

- **What**: The `error`-level log event produced by the boundary or hook.
- **Shape** (as delivered to transports, post-pipeline): standard event with
  - `level: 'error'`,
  - `message`: `'React render error'` (boundary) | `'Reported error'` (hook) — or a consumer message,
  - `attributes`: `{ 'safesignal.source': 'react-error-boundary' | 'react-use-log-error',
    'safesignal.react.componentStack'?: string, ...consumerAttributes }` (sanitized/redacted/bounded),
  - serialized `error` info from the third `Logger.error` arg (name/message/stack — scrubbed).
- **Rules**: Routed through the existing pipeline (fail-closed); no auto-captured props/state; source
  marker makes it separable from `./capture` events and ordinary logs.

## Relationships

```text
LoggerProvider ──provides──▶ LoggerContext ──read by──▶ LogErrorBoundary (props.logger ?? context)
                                            └──read by──▶ useLogError (arg ?? context)
LogErrorBoundary.componentDidCatch ──calls──▶ Logger.error ──existing pipeline──▶ Transport(s)
useLogError().logError            ──calls──▶ Logger.error ──existing pipeline──▶ Transport(s)
```

## Validation / invariants

- Logger is **always consumer-provided** (context or explicit override); the subpath never creates or
  reads a runtime. Absent logger ⇒ safe no-op.
- No globals: no `window`/`document`/listener access; no monkey-patching.
- `useLogError`'s returned callback identity is stable across renders for a fixed resolved logger.
- All emission goes through `Logger.error` — no parallel/bypass path; redaction is fail-closed.
- React is referenced only as an externalized peer; the core entry contains zero React.
