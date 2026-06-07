# Phase 0 Research: Readable, Source-Mapped Error Stacks

All Technical Context decisions are resolved below. The resolution model (Option A — synchronous) was
settled with the user during specification; R1 records it. The delivery mechanism (subpath + a small core
seam) is settled here per the spec's recommendation and the bundle reality.

## R1. Resolution model: synchronous resolver, fully synchronous delivery (Option A)

**Decision**: Stack normalization (parse + trim + scrub) is synchronous, and the optional source-map
**resolver is synchronous** — a sync lookup over the consumer's already-loaded in-memory maps, invoked
inline before delivery. SafeSignal performs **no** async I/O and never fetches `.map` files; the consumer
owns any async map-loading before they configure.

**Rationale**: Preserves every current invariant — delivery stays fully synchronous, each error is
delivered **exactly once**, no deferral / duplication / out-of-order enrichment (Principle VII intact).
Simplest and safest for a logging library. The issue's "async work isolated and fail-safe" is honored by
keeping async map-loading entirely on the consumer side.

**Alternatives considered**: (B) async resolver with bounded *deferred* error delivery — makes error
delivery async, risks loss on page-unload; (C) async resolver with a *second* enriched delivery —
duplicates the error for downstream systems. Both rejected by the user.

## R2. Delivery: a small core seam + a dedicated `./stacks` subpath

**Decision**: Add a tiny **core seam** — `LoggerConfig.normalizeStack?: StackNormalizer` (sync) — and ship
the heavy parser/trimmer/resolver in a new opt-in **`./stacks` subpath** that exports
`createStackNormalizer(options?): StackNormalizer`. The consumer wires:
`configureLogging({ normalizeStack: createStackNormalizer({ resolver }) })`.

**Rationale**: Normalization MUST run **inside the core pipeline** so the *real* error event delivered to
every transport carries the frames (and so the frames are scrubbed/bounded by the existing stages). A pure
subpath cannot reach the pipeline, so a core seam is required regardless. But the parser (multi-format
stack parsing + trimming + resolver application) is **too large to fit the default entry's hard ±1 KiB
`bundle-invariance` gate** (the core bundle is already ~9.8 KB gz after Feature 016). So the heavy logic
lives in the `./stacks` subpath (its own bundle, tree-shaken from consumers who don't use it), and the
default `.` entry grows only by the tiny seam (one optional config call + a stash). This matches the
`./capture` / `./dev-console` "opt-in on a subpath" precedent.

**Alternatives considered**: (A) everything in core (like Feature 016 breadcrumbs) — rejected: the parser
would blow the ±1 KiB gate. (C) a generic `enrichError` seam — rejected: a stack-specific hook is clearer
and keeps the documented `StackFrame` shape as a first-class contract.

## R3. Pipeline integration: normalize pre-dispatch into a reserved attribute key

**Decision**: In `logger.ts` `emit()`, gated by `cfg.normalizeStack && level === 'error' &&
event.error?.stack`, call the normalizer **fail-safe** and store the resulting frames at
`attributes['safesignal.stack']` **before** `dispatch()`. The existing pipeline (sanitize → URL-scrub →
redact → control-char-guard) then processes the frames like any attribute.

**Rationale**: Mirrors the Feature 016 cause-chain trick exactly. Writing frames into `attributes` before
the pipeline means: (a) **per-frame URL scrubbing for free** — `urlScrub` recurses into nested attribute
arrays/objects and scrubs any frame `file` that is an http(s) URL (verified in `url-scrubber.ts`
`walkAttributes`/`walkArray`); (b) the frames are sanitizer-bounded (depth/length/count); (c) no change to
the `redactor`/`url-scrubber`/`sanitizer` stages. The original `error.stack` string is untouched (frames
are additive). Reserved key `safesignal.stack`, consistent with `safesignal.breadcrumbs` /
`safesignal.source`.

## R4. Frame model + the core seam type

**Decision**: Core public types:
```ts
export interface StackFrame {
  function?: string;
  file?: string;       // scrubbed by the pipeline if URL-shaped
  line?: number;
  column?: number;
  /** Original source position when source-map-resolved. */
  original?: { file?: string; line?: number; column?: number; name?: string };
}
export type StackNormalizer = (stack: string) => StackFrame[] | null;
// LoggerConfig gains:  normalizeStack?: StackNormalizer
```
`StackFrame[]` is `AttributeValue`-compatible (string/number fields + a nested object), so it stores in
`attributes` directly. A normalizer returning `null`/`[]` adds no key (no noise).

**Rationale**: A small, documented, machine-parseable frame shape is the stable contract consumers read
off events (FR-004). `StackNormalizer` is the minimal seam type; the subpath produces the frames.

## R5. The `./stacks` subpath: parser + trimmer + resolver

**Decision**: `createStackNormalizer(options?: StackNormalizerOptions): StackNormalizer`. Options:
```ts
interface StackNormalizerOptions {
  /** Sync source-map resolver; maps a minified position to the original. */
  resolver?: (frame: { file: string; line: number; column: number }) =>
    { file?: string; line?: number; column?: number; name?: string } | null;
  /** Max frames kept after trimming. Default 30; clamped to [1, 100]. */
  maxFrames?: number;
  /** Keep node_modules frames (default false → trimmed). */
  includeNodeModules?: boolean;
  /** Keep SafeSignal-internal frames (default false → trimmed). */
  includeInternal?: boolean;
}
```
It parses, trims, applies the resolver (when given), caps to `maxFrames`, and returns `StackFrame[]`
(or `null` when nothing parses). **Type-only** import of `StackFrame`/`StackNormalizer` from
`../api/types.js`.

**Rationale**: All the heavy, opt-in logic lives in the subpath (out of the default bundle). Sync resolver
per R1. Defaults are sensible and tunable.

## R6. Stack parsing: the two dominant formats, fail-safe

**Decision**: Parse the two common shapes line-by-line:
- **V8** (Chrome/Edge/Node): `    at fn (file:line:col)`, `    at file:line:col`, `at async fn (...)`,
  `at Object.<anonymous> (...)`, `at new Ctor (...)`.
- **SpiderMonkey/JSC** (Firefox/Safari): `fn@file:line:col`, `@file:line:col`.
A line that matches neither is dropped (it is noise like the leading `Error: message` header). Parsing is
pure string/regex work; any unexpected input falls through to "skip that line" — never throws (FR-007).
If **no** line parses, the normalizer returns `null` and the raw `error.stack` stands (FR-003 fallback).

**Rationale**: These two cover essentially all browsers + Node. Hand-written parsing keeps the package
dependency-free (FR-011). Fail-safe per Principle III.

## R7. Trimming policy (documented, tunable defaults)

**Decision**: By default, drop frames whose `file` indicates noise: `node_modules`, `node:`/`internal/`
(Node internals), `native`/`<anonymous>` boilerplate, and SafeSignal-internal frames (heuristic: file
path containing `safesignal` / the package's own dist marker). Keep application frames. `includeNodeModules`
/ `includeInternal` opt back in. If trimming would remove **every** frame, keep the original (un-trimmed)
parsed frames rather than emitting an empty list (FR-003 edge case).

**Rationale**: Removes the dominant noise while preserving the relevant trace; tunable for consumers who
want full fidelity. **Note**: SafeSignal-own-frame detection is **best-effort and rarely applicable** — a
consumer error originates in *their* app code and is merely *passed* to `logger.error`, so SafeSignal's
own frames are usually absent from the stack, and are unidentifiable once minified. The dominant, reliable
wins are `node_modules` / engine-internal / native trimming; the SafeSignal-frame rule is a harmless extra
and is **not** heavily tested.

## R8. Source-map resolution: per-frame, partial, fail-safe

**Decision**: When `options.resolver` is supplied, call it per frame with `{ file, line, column }`; if it
returns a position, set `frame.original`. A frame the resolver cannot map (returns `null`) or that throws
is left at its original position (the per-frame call is wrapped) — **partial** resolution is fine (FR-006).
The resolver is invoked only for frames that have a numeric line/column.

**Rationale**: Robustness — one unmappable/throwing frame never loses the others (SC-003). Sync per R1.

## R9. Secret-safety, bounds, integrity, scale

**Decision**: Frames live in `attributes['safesignal.stack']`, so the existing **url-scrub + redact**
stages scrub frame `file` URLs and redact secret-shaped leaf values; the **sanitizer** bounds depth /
string length / array length. The subpath additionally caps `maxFrames`. The seam runs only for **error**
events at the runtime level (no per-`Logger` cost); it is additive (never mutates other events) and
synchronous (exactly-once delivery). Duplicate copies are **isolated** (each runtime configures its own
normalizer).

**Rationale**: FR-005/010 (secret-safe + bounded) come largely for free from the pipeline placement;
VII/VIII satisfied by error-only, runtime-level, additive, synchronous handling.

## R10. Bundle discipline

**Decision**: The core seam (a `StackFrame`/`StackNormalizer` type — erased — + `LoggerConfig.normalizeStack`
+ ~8 lines of `emit()` wiring + a config passthrough) is **tiny** and stays within the dynamic ±1 KiB
`bundle-invariance` gate (vs the post-Feature-016 `main`). The stored default-entry ceilings in
`transport-beacon-bundle-shape (e)` are **re-baselined** for the small seam delta with a documented
justification (gate moved, not removed — Principle X). The new `./stacks` subpath has its **own**
bundle-shape security test (vendor-neutral, size budget) and is added to the Feature 012 parity set; it is
**not** governed by the default-entry invariance (it's a separate bundle, tree-shaken from non-users).

**Rationale**: Keeps the default entry lean (the heavy parser is in the subpath), honest distributed
surface (parity), no new dependency.

## Resolved decisions summary

| Topic | Resolution |
|-------|------------|
| Resolution model | Synchronous resolver, fully synchronous delivery (Option A) — R1 |
| Delivery | Small core seam (`normalizeStack`) + `./stacks` subpath for the parser — R2 |
| Integration | Normalize in `emit()` pre-dispatch → `attributes['safesignal.stack']`; pipeline scrubs/bounds — R3 |
| Frame model | `StackFrame` + `StackNormalizer` core types; frames are AttributeValue-shaped — R4 |
| Subpath API | `createStackNormalizer(options?)` + `StackNormalizerOptions` (resolver, maxFrames, trims) — R5 |
| Parsing | V8 + SpiderMonkey/JSC formats, fail-safe, null → raw fallback — R6 |
| Trimming | Drop node_modules / internals / SafeSignal / boilerplate; tunable; never all-empty — R7 |
| Resolution | Per-frame, partial, fail-safe; only frames with line/col — R8 |
| Secure/bounds/integrity | Free via pipeline placement; error-only, runtime-level, additive, sync — R9 |
| Bundle | Tiny core seam within ±1 KiB + re-baselined ceilings; `./stacks` own bundle + parity — R10 |
