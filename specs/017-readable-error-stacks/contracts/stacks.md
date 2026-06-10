# Contract: Readable, Source-Mapped Error Stacks (`normalizeStack` + `./stacks`)

**Surface**: a core seam `configureLogging({ normalizeStack })` (off by default) + the opt-in `./stacks`
subpath `createStackNormalizer(options?)` + the documented `attributes['safesignal.stack']` shape on
enriched error events.
**Enforces**: Principle V (secure/off-by-default), IV (structured/bounded), VII (integrity/synchronous),
III (fail-safe), VIII (runtime-level), X/XI (honest surface + bundle). Source of truth for the
implementation and contract tests.

## API

```ts
// core (src/api/types.ts) — the seam:
export interface StackFrame {
  function?: string;
  file?: string;       // pipeline-scrubbed when URL-shaped
  line?: number;
  column?: number;
  original?: { file?: string; line?: number; column?: number; name?: string };
}
export type StackNormalizer = (stack: string) => StackFrame[] | null;
// LoggerConfig.normalizeStack?: StackNormalizer;   // default: off

// ./stacks subpath — the implementation:
export interface StackNormalizerOptions {
  resolver?: (frame: { file: string; line: number; column: number }) =>
    { file?: string; line?: number; column?: number; name?: string } | null; // SYNCHRONOUS
  maxFrames?: number;          // default 30; clamped [1, 100]
  includeNodeModules?: boolean; // default false
  includeInternal?: boolean;    // default false
}
export function createStackNormalizer(options?: StackNormalizerOptions): StackNormalizer;
```

Enabled wiring: `configureLogging({ normalizeStack: createStackNormalizer({ resolver }) })`. An enriched
**error** event carries `attributes['safesignal.stack']: StackFrame[]` (ordered top → deepest).

## Behavioral guarantees (each is a test)

| # | Guarantee | Maps to |
|---|-----------|---------|
| **ST-1** | **Off by default**: with no `normalizeStack`, no stack is parsed, `attributes['safesignal.stack']` is absent, and behavior/cost are identical to today. | FR-001 / SC-001 |
| **ST-2** | With `normalizeStack` configured, a logged error carries `safesignal.stack` = ordered structured frames `{ function?, file?, line?, column? }` parsed from `error.stack`. | FR-002 / SC-002 |
| **ST-3** | The parser handles **V8** (`at fn (file:line:col)`) **and** Firefox/Safari (`fn@file:line:col`) formats; an unparseable/empty stack → normalizer returns `null` → no frames, raw `error.stack` preserved. | FR-002/FR-003 / SC-002 |
| **ST-4** | **Trimming**: `node_modules`, engine/runtime-internal, SafeSignal-own, and anonymous boilerplate frames are removed by default; if trimming would empty the list, the un-trimmed frames are kept (never empty when frames existed). | FR-003 / SC-002 |
| **ST-5** | **Source-map resolution**: with a `resolver`, resolvable frames carry `original`; an unmappable frame is left at its original position (partial allowed); the rest still resolve. | FR-006 / SC-003 |
| **ST-6** | **Secure**: a secret in a frame's `file` URL (e.g. `?token=…`) appears **0** times unredacted in the delivered frames (the pipeline `urlScrub` scrubs each frame `file`). | FR-005 / SC-004 |
| **ST-7** | **Fail-safe**: a throwing/rejecting parser or resolver is swallowed → `onInternalError`; the error is **still delivered** (with raw stack / un-resolved frames); nothing throws into the page; resolution never blocks. | FR-007/FR-008 / SC-005 |
| **ST-8** | **Synchronous, exactly-once**: the resolver is synchronous and resolution is inline — each error delivers once, synchronously; no deferral/duplication/out-of-order. | FR-008 / Principle VII |
| **ST-9** | **Bounded**: a pathological deep stack yields at most `maxFrames` frames; per-frame strings are sanitizer-bounded. | FR-010 / SC-007 |
| **ST-10** | **Runtime-level / no per-Logger cost**: configured once; creating N loggers adds **0** per-logger normalization, listeners, or ambient reads; duplicate copies isolated. | FR-009 / SC-006 |
| **ST-11** | **No new dependency / vendor-neutral**: the package bundles no source-map library; `dist/stacks.*` names no vendor package/identifier; the resolver + maps are consumer-provided. | FR-011 / Principle XI |
| **ST-12** | **Default entry untouched in behavior**: the core seam adds no parser to the default bundle (the heavy logic is in `./stacks`); default `.` entry stays within the ±1 KiB invariance gate. | FR-012 / SC-001 |

## Distributed surface & bundle (Principle X / XI)

`./stacks` is the **7th** public subpath. It is added to `tests/contract/distributed-surface.contract.test.ts`
(`PUBLIC_SUBPATHS` + `HONEST_PKG`), `tests/contract/dependency-pins.test.ts` (exports-keys + per-entry
triple), and the `transport-beacon` TB-12 keys assertion. `dist/stacks.*` MUST be vendor-neutral with a
size budget (`tests/security/stacks-bundle-shape.security.test.ts`), and `dist/index.*` MUST NOT contain
`createStackNormalizer` / parser fingerprints (default-entry isolation). The default `.` entry's small seam
delta stays within the dynamic ±1 KiB `bundle-invariance` gate; the stored `DEFAULT_ENTRY_*_GZ_MAX`
ceilings are re-baselined with a documented justification (gate moved, not removed).

## Reference (non-normative)

```jsonc
// a delivered error event's attributes when normalizeStack is configured:
{
  "orderId": "ord_9f3",
  "safesignal.stack": [
    { "function": "checkout", "file": "https://app.example/main.abc123.js", "line": 1, "column": 48201,
      "original": { "file": "src/checkout.ts", "line": 42, "column": 7, "name": "checkout" } },
    { "function": "onClick", "file": "https://app.example/main.abc123.js", "line": 1, "column": 39044 }
  ]
}
// (node_modules / engine-internal / SafeSignal frames were trimmed; a frame file URL with ?token=… is scrubbed)
```
