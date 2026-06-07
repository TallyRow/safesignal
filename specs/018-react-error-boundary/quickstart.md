# Quickstart: `./framework-react` — catch & log React errors

> Opt-in React adapter. Requires `react >=16.8` (a peer dependency you already have in a React app).
> The core `@tallyrow/safesignal` package stays React-free; nothing here patches globals.

## 1. Wire your logger once (~3 lines)

```tsx
import { configureLogging, createLogger } from '@tallyrow/safesignal';
import { LoggerProvider, LogErrorBoundary } from '@tallyrow/safesignal/framework-react';

configureLogging({ /* your transports, redaction, identity … */ });
const log = createLogger({ module: 'checkout' });

function App() {
  return (
    <LoggerProvider logger={log}>
      <LogErrorBoundary fallback={<p>Something went wrong.</p>}>
        <Checkout />
      </LogErrorBoundary>
    </LoggerProvider>
  );
}
```

When any component under the boundary throws during render, the error — plus the React **component
stack** — is logged through `log.error` (redacted/sanitized by the same pipeline as every log) and the
fallback renders instead of a blank screen. Components outside the boundary keep working.

## 2. Log errors a boundary can't catch — `useLogError()`

Error boundaries do **not** catch event-handler or async errors. Use the hook for those:

```tsx
import { useLogError } from '@tallyrow/safesignal/framework-react';

function SaveButton() {
  const logError = useLogError(); // stable; resolves the logger from LoggerProvider

  const onClick = async () => {
    try {
      await save();
    } catch (err) {
      logError(err, { 'safesignal.action': 'save' }); // → error-level event through the pipeline
    }
  };

  return <button onClick={onClick}>Save</button>;
}
```

## 3. Recoverable fallback (render-prop + reset)

```tsx
<LogErrorBoundary
  resetKeys={[routeId]}                 // re-mounts children when the route changes
  fallback={(error, reset) => (
    <div>
      <p>Failed to load.</p>
      <button onClick={reset}>Try again</button>
    </div>
  )}
>
  <Page />
</LogErrorBoundary>
```

## Notes

- **No provider?** Pass a logger explicitly: `<LogErrorBoundary logger={log}>` or
  `useLogError(log)`. With no logger resolvable at all, the helpers are a **safe no-op** (never throw).
- **Secrets**: error messages/stacks/component stacks route through the same fail-closed redaction as
  any log. Keep secrets in structured attributes, not thrown message strings (whole-value redaction,
  not substring scrubbing).
- **No globals**: this never installs `window.onerror` or global listeners — that's the separate,
  host-level `@tallyrow/safesignal/capture`. The two are complementary and can be used together.

## Verify (acceptance)

```bash
npm run build
npm test            # contract + integration + security (incl. bundle-shape & react-import boundary)
npm run surface:check   # ./framework-react present in the documented distributed surface
```

Expected: boundary-caught render errors and `useLogError` calls arrive at the configured transport as
`error`-level events with `safesignal.source` markers; the core entry bundles zero React;
`dist/framework-react.*` references `react` as an external import (not inlined).
