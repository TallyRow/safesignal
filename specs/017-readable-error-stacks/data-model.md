# Phase 1 Data Model: Readable, Source-Mapped Error Stacks

Two new public core types (the seam) + one subpath options type. Frames ride on the existing event under a
reserved `attributes` key — **no** new top-level `LogEvent`/`ErrorInfo` field.

## Public core types (the seam — `src/api/types.ts`)

### StackFrame (new public type)

One parsed call site. All fields optional (a frame may lack a function name or precise position). Each
field is `AttributeValue`-compatible so the frame list stores directly in `attributes`.

| Field | Type | Notes |
|-------|------|-------|
| `function` | `string` (optional) | Call-site function/method name; omitted when anonymous/unknown. |
| `file` | `string` (optional) | File path or URL. **Scrubbed** by the pipeline when URL-shaped (FR-005). |
| `line` | `number` (optional) | 1-based line. |
| `column` | `number` (optional) | 1-based column. |
| `original` | `{ file?: string; line?: number; column?: number; name?: string }` (optional) | Original source position when source-map-resolved (FR-006). |

### StackNormalizer (new public type) + LoggerConfig.normalizeStack

```ts
export type StackNormalizer = (stack: string) => StackFrame[] | null;
// LoggerConfig gains:
//   normalizeStack?: StackNormalizer;   // default: undefined (off)
```
A `StackNormalizer` takes a raw `error.stack` string and returns the ordered, trimmed, (optionally
resolved) frames — or `null` when nothing parses (the raw stack stands). Supplied once at
`configureLogging()`. Off by default.

## Reserved attribute shape (documented; not a new type)

### `attributes['safesignal.stack']` — the normalized frames

A `StackFrame[]` placed on the **error** event's `attributes` when `normalizeStack` is configured and the
error has a stack. Ordered top frame → deepest. Bounded by `maxFrames` (subpath) and the sanitizer
(pipeline). The original `error.stack` string is preserved.

## Subpath types (`src/stacks/index.ts`)

### StackNormalizerOptions (new — subpath only)

| Field | Type | Notes |
|-------|------|-------|
| `resolver` | `(frame: { file: string; line: number; column: number }) => { file?: string; line?: number; column?: number; name?: string } \| null` (optional) | **Synchronous** source-map resolver. Per-frame, partial, fail-safe. When omitted, no resolution. |
| `maxFrames` | `number` (optional) | Max frames kept. Default **30**; clamped to **[1, 100]**. |
| `includeNodeModules` | `boolean` (optional) | Keep `node_modules` frames (default `false` → trimmed). |
| `includeInternal` | `boolean` (optional) | Keep SafeSignal-internal / engine-internal frames (default `false` → trimmed). |

### createStackNormalizer(options?) → StackNormalizer

`createStackNormalizer(options?: StackNormalizerOptions): StackNormalizer`. The returned normalizer:
```text
normalize(stack):
  frames = parse(stack)                 # V8 + Firefox/Safari line formats; unparseable lines skipped
  if frames is empty: return null       # raw error.stack stands (FR-003)
  kept = trim(frames, options)          # drop node_modules / internals / SafeSignal / boilerplate
  if kept is empty: kept = frames        # never all-empty when frames existed (FR-003 edge)
  kept = kept.slice(0, maxFrames)        # bound (FR-010)
  if options.resolver:
    for f in kept with numeric line/col:
      try: orig = resolver({file:f.file, line:f.line, column:f.column}); if orig: f.original = orig
      catch: /* per-frame swallow — leave un-resolved (FR-007/SC-003) */
  return kept
```
Never throws (the whole body is defensive; the consumer-facing call site in `emit()` also wraps it).

## Internal core wiring

### NormalizedConfig.normalizeStack (internal)

`readonly normalizeStack: StackNormalizer | undefined` — passthrough of `config.normalizeStack`.

### emit() seam (logger.ts, pre-dispatch)

```text
event = buildLogEvent(...)
if cfg.normalizeStack && level === 'error' && event.error?.stack:
  try:
    frames = cfg.normalizeStack(event.error.stack)
    if frames and frames.length: event.attributes['safesignal.stack'] = frames
  catch err: safeNotify(onInternalError, PackageError('stack_normalize_failed', ...))
dispatch(event, cfg)   # pipeline scrubs frame URLs, redacts, bounds
```

## Relationships & flow

```text
configureLogging({ normalizeStack: createStackNormalizer({ resolver, maxFrames }) })   // ./stacks subpath
        │  normalizeConfig → NormalizedConfig.normalizeStack = StackNormalizer | undefined
        ▼
logger.error(msg, attrs, err):
   emit():  if (normalizeStack && error has stack)
              attributes['safesignal.stack'] = normalizeStack(error.stack)   // parse→trim→resolve→bound
        │
        ▼ dispatch(event, cfg):
   sanitize → URLscrub → redact → controlCharGuard → freeze → fan-out
   (URLscrub scrubs each frame.file URL; redact masks secret-shaped leaves; sanitize bounds depth/size)
        │
        ▼ every transport receives the error event carrying scrubbed, bounded `safesignal.stack` frames
```

*Disabled* (`normalizeStack` undefined): the single falsy check short-circuits — no parsing, no frames,
behavior identical to today.
