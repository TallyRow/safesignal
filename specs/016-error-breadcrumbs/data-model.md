# Phase 1 Data Model: Opt-In Error Breadcrumbs

This feature adds two public types and several internal entities. It reuses `LogEvent` / `LogContext` /
`ErrorInfo` / `Attributes` / `NormalizedConfig` and adds **no** new top-level `LogEvent` field — the
trail and cause chain ride on `attributes` under reserved `safesignal.*` keys.

## Public types (new)

### BreadcrumbsOptions (new public type)

Options for the runtime `breadcrumbs` configuration.

| Field | Type | Notes |
|-------|------|-------|
| `maxEvents` | `number` (optional) | Ring-buffer capacity. Default **20**; clamped to **[1, 100]**; out-of-range emits one `onInternalError` notice (mirrors `sanitizerLimits`). |

### LoggerConfig.breadcrumbs (new public field)

```ts
breadcrumbs?: boolean | BreadcrumbsOptions;   // default: off (undefined / false)
```
`true` → enable with defaults; an object → enable with overrides; `false`/absent → **off** (no buffer
allocated, nothing recorded).

## Reserved attribute shapes (documented; not new types)

Both are plain `AttributeValue` arrays placed on the **error** event's `attributes` when enabled.

### `attributes['safesignal.breadcrumbs']` — the trail

Ordered **oldest → newest**, length ≤ `maxEvents`, excluding the error itself.

| Field | Type | Source |
|-------|------|--------|
| `ts` | `string` | the recorded event's `timestamp` |
| `level` | `string` | the recorded event's `level` |
| `message` | `string` | the recorded event's `message` |
| `app` | `string` (optional) | the recorded event's `context.application?.name` — origin attribution (FR-011); omitted when absent |
| `module` | `string` (optional) | the recorded event's `context.module?.name` — keeps host vs. federated-module breadcrumbs distinguishable (FR-011); omitted when absent |
| `attributes` | `object` (optional) | the recorded event's already-redacted attributes, **excluding** `safesignal.breadcrumbs` (anti-nesting); omitted when empty |

### `attributes['safesignal.errorCauses']` — the cause chain

Ordered **outermost → root**, length ≤ `MAX_CAUSE_DEPTH` (8), present only when the error has a `cause`.

| Field | Type | Source |
|-------|------|--------|
| `name` | `string` | the cause's `name` (`'NonError'` for non-`Error` causes) |
| `message` | `string` | the cause's `message` (`String(value)` for non-`Error` causes) |

> Both arrays are written as ordinary attributes and are bounded by `sanitizerLimits`; the cause chain is
> written **before** the pipeline, so the sanitizer + redactor + control-char-guard process it uniformly.
> The trail is attached **after** redaction from already-safe snapshots.

## Internal entities

### BreadcrumbBuffer (internal — `src/breadcrumbs/breadcrumb-buffer.ts`)

A fixed-capacity circular buffer of breadcrumb snapshots, stored on the configured runtime.

| Member | Type | Notes |
|--------|------|-------|
| capacity `N` | `number` | resolved `maxEvents` (1–100) |
| `record(event)` | `(LogEvent) => void` | build a compact snapshot (excluding the trail key) and O(1) overwrite into the ring |
| `attachTrailTo(errorEvent)` | `(LogEvent) => void` | write the ordered oldest→newest snapshot list to `attributes['safesignal.breadcrumbs']` (omit when empty) |

**Validation rules**
- O(1) `record`; constant memory (at most N snapshots, each bounded by `sanitizerLimits`).
- Stores **copies**, never references to the live (dev-frozen) event.
- `record` excludes the `safesignal.breadcrumbs` key from the stored attributes (anti-nesting).

### Breadcrumb Snapshot (internal value)

`{ ts: string; level: LogLevel; message: string; app?: string; module?: string; attributes?: Attributes }`
— the compact recorded form (see the trail shape above). `app`/`module` carry origin attribution so
breadcrumbs from host vs. federated-module loggers stay distinguishable (FR-011); both omitted when the
source identity is absent.

### Cause Chain (internal value) — `extractCauseChain(value, maxDepth)`

An ordered, **cycle-safe**, **depth-bounded** (`MAX_CAUSE_DEPTH = 8`) list of `{ name, message }` derived
from `value.cause` and its nested causes. Non-`Error` causes reduce via `String()`. Returns `[]` when no
cause; the top error stays in `event.error`.

### NormalizedConfig.breadcrumbs (internal)

`readonly breadcrumbs: BreadcrumbBuffer | undefined` — the constructed buffer (enabled) or `undefined`
(disabled). Created **once** in `normalizeConfig`; shared across every `Logger` on the runtime; a fresh
buffer per `configureLogging()` swap.

## Relationships & flow

```text
configureLogging({ breadcrumbs: true | { maxEvents } })
        │  normalizeConfig → resolveBreadcrumbs() → NormalizedConfig.breadcrumbs = BreadcrumbBuffer(N) | undefined
        ▼
logger.error(msg, attrs, errValue):
   emit():  if (breadcrumbs && error && errValue) attributes['safesignal.errorCauses'] = extractCauseChain(errValue)
        │
        ▼ dispatch(event, cfg):
   sanitize → URLscrub → redact → controlCharGuard     (processes errorCauses uniformly)
        │
   if (cfg.breadcrumbs)  try:
        if error:  cfg.breadcrumbs.attachTrailTo(event)   // adds safesignal.breadcrumbs (pre-freeze)
   freeze(dev) → fan-out to transports                    // every transport gets the enriched error event
   if (cfg.breadcrumbs)  try:
        cfg.breadcrumbs.record(event)                      // O(1) snapshot AFTER fan-out (excludes trail key)
   catch → onInternalError                                 // fail-safe; error already delivered
```

*Disabled* (`breadcrumbs` undefined): the two `if (cfg.breadcrumbs)` checks are falsy — no buffer, no
recording, no enrichment, behavior identical to today.
