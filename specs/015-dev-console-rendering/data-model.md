# Phase 1 Data Model: Developer-Friendly Dev-Mode Console Rendering

This feature adds one public options type and a presentation of the existing `LogEvent`. It reuses
`LogEvent` / `LogContext` / `ErrorInfo` / `TraceContext` / `Transport` unchanged.

## Entities

### DevConsoleTransportOptions (new public type)

Options for the `DevConsoleTransport(options?)` factory.

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` (optional) | `Transport.name` for diagnostics. Default `'dev-console'`. |
| `traceUrl` | `(trace: { traceId: string; spanId: string }) => string` (optional) | Format a clickable trace URL from the event's existing trace ids (devtools auto-linkifies). When omitted, the ids are rendered as identifiable text. Carry-only — no ids minted. |
| `colors` | `boolean` (optional) | Force-enable/disable `%c` styling. Default: auto (styling when grouping is supported). |

**Validation rules**
- All optional. `traceUrl` MUST be invoked only with the event's existing `context.trace` ids and its
  result is rendered as a string (any throw from it is swallowed fail-safe).

### Rendered Console Entry (dev presentation — not a stored type)

The devtools presentation of one post-pipeline `LogEvent` when `environment === 'development'` and
rich console features exist:

| Part | Source field | Rendering |
|------|--------------|-----------|
| Header | `level` + `message` + `context.{application,module,environment}` | `console.groupCollapsed('%c<icon> <LEVEL>%c <message>', style, …, dim, 'app · module · env')` |
| Attributes | `attributes` (sanitized, bounded) | `console.log` the attributes object (interactive, not re-serialized) — omitted when empty |
| Error | `error.{name,message,stack}` | `console.log` the name/message + the stack string — omitted when absent |
| Trace | `context.trace.{traceId,spanId,traceFlags?}` | a clickable URL (via `traceUrl`) or the identifiable ids — omitted when absent. The `traceUrl` formatter is invoked with **only** `{traceId, spanId}` (the ids a backend link needs); `traceFlags` is not passed to the formatter (rendered alongside the ids when shown). |

**Validation rules**
- Reads **only** the event's own fields; never re-serializes arbitrary application objects or reads
  ambient state (Principle IV/V/VIII).
- Each section is omitted when its source is empty/absent (no placeholder noise).

### LogEvent / LogContext / ErrorInfo / TraceContext (existing, unchanged)

The post-pipeline event the renderer consumes — sanitized, redacted, URL-scrubbed, control-char-
guarded, bounded — with `level`, `message`, `attributes`, `context` (incl. `application`/`module`/
`environment`/`trace`), and optional `error`. The renderer reads it; it never modifies it or what other
transports receive (Principle VII).

### DevConsoleTransport (the factory) → Transport

`DevConsoleTransport(options?): Transport` — a `TransportFactory`. The returned `Transport.send(event)`:

```text
send(event):
  try:
    if event.context.environment !== 'development'  OR  !richConsoleAvailable():
        console[level](event.message, event)          # structured fallback (== ConsoleTransport)
        return
    groupCollapsed(header)                             # level icon/color + message + context summary
      if attributes not empty: log(attributes)
      if error present:        log(error.name/message + stack)
      if trace present:        log(traceUrl(trace) ?? "<traceId>/<spanId>")
    groupEnd()
  catch: /* swallow — never throw into the page */
```

## Relationships

```text
host (dev): configureLogging({
  environment: 'development',
  transports: [ import.meta.env.DEV ? DevConsoleTransport({ traceUrl? }) : ConsoleTransport() ],
})
                          │
   logger.info/.error(...) → (existing pipeline: sanitize → scrub → redact → guard) → Transport.send
                          │
   DevConsoleTransport.send(event):
        environment === 'development' && richConsole?  ── yes ──▶ grouped pretty render (read-only)
                          └────────────────────────────── no ───▶ console[level](message, event)  (structured)
```

*Production*: the consumer's bundler tree-shakes the `DevConsoleTransport` branch out; `ConsoleTransport`
(unchanged) is used — the default `.` entry bundle is byte-unchanged.
