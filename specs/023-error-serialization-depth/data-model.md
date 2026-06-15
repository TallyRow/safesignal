# Data Model — Structured Error Serialization Depth (Phase 1)

## SerializedErrorNode

The structured representation of one error (spec Key Entities), used for
cause-chain entries and aggregate members. Recursive only through `members`.

```ts
export interface SerializedErrorNode {
  /** Error name (`'NonError'` for coerced non-error cause values). */
  name: string;
  /** Error message (`String(value)` for coerced non-error values). */
  message: string;
  /**
   * Flat, ordered cause chain of THIS node, outermost cause first.
   * Present only on aggregate members (a chain entry's own linear chain is
   * already flattened into the array that contains it — entries inside a
   * `causes` array never carry `causes`). Never empty.
   */
  causes?: SerializedErrorNode[];
  /**
   * AggregateError member nodes, original order, count-bounded. Members
   * recurse (each may carry its own `causes`/`members`/`fields`). Never empty.
   */
  members?: SerializedErrorNode[];
  /**
   * Value-filtered own enumerable properties beyond name/message/stack/cause
   * (plus DOMException's prototype `code`, special-cased). JSON-safe values
   * only; functions/symbols/prototype props never captured. Never empty.
   */
  fields?: Record<string, unknown>;
  /** Set when this node's cause chain was clipped (depth or node budget). */
  causesTruncated?: true;
  /** Original member count, set only when members were omitted. */
  membersTotal?: number;
  /** Set when this node's field set was clipped (`maxFields`). */
  fieldsTruncated?: true;
}
```

**Constraints**

- No node ever carries `stack` (FR-013) — only the top-level `ErrorInfo.stack`
  exists, unchanged.
- All `causes`/`members`/`fields` keys are ABSENT (not empty) when there is
  nothing to record (US1 scenario 2).
- Cycle handling: a cause already visited terminates the chain at that point
  (with `causesTruncated` NOT set — a cycle is an end, not a clip; the spec
  requires termination, and reporting it as truncation would misstate depth).
  Revisit at implement time only if review prefers an explicit marker.

## ErrorInfo (extended — additive)

```ts
export interface ErrorInfo {
  name: string;
  message: string;
  stack?: string;
  // --- new, present only when deep error serialization is enabled ---
  /** Flat, ordered cause chain of the logged error, outermost first. */
  causes?: SerializedErrorNode[];
  /** AggregateError members of the logged error. */
  members?: SerializedErrorNode[];
  /** Extra captured fields of the logged error. */
  fields?: Record<string, unknown>;
  causesTruncated?: true;
  membersTotal?: number;
  fieldsTruncated?: true;
  /** Set once on the top-level payload when the node budget clipped anything. */
  budgetExhausted?: true;
}
```

With `serializeErrors` disabled (default): exactly `{ name, message, stack? }`
— locked by ES-10.

## SerializeErrorsOptions / config

```ts
export interface SerializeErrorsOptions {
  /** Max cause-chain entries per node. Default 8; clamped [1, 16]. */
  maxCauseDepth?: number;
  /** Max aggregate members per node. Default 10; clamped [1, 100]. */
  maxMembers?: number;
  /** Max extra fields per node. Default 16; clamped [0, 64]. */
  maxFields?: number;
  /** Binding outer limit: max total nodes per event. Default 50; clamped [1, 256]. */
  maxNodes?: number;
}

// LoggerConfig (additive)
serializeErrors?: boolean | SerializeErrorsOptions;
```

- `true` → all defaults; object → per-key override, clamp-and-notify (one
  `onInternalError` notice per clamped key, matching sanitizer-limit
  behavior).
- Normalized internal form: `ResolvedSerializeErrorsLimits | undefined`
  (undefined = disabled). Stored on the normalized config object beside
  `sanitizerLimits`.
- Value depth and string length: reuse `sanitizerLimits.maxDepth` /
  `maxStringLength` (no new knobs — clarify Q3).

## Budget semantics (FR-004)

- One counter per event, starting at `maxNodes`, decremented per node emitted
  (chain entries, members, recursively). The top-level error payload itself
  does not count (it always exists).
- Inner limits (`maxCauseDepth`, `maxMembers`, `maxFields`) are subordinate:
  they clip locally even when budget remains; the budget clips globally even
  when inner limits would allow more. Budget exhaustion sets
  `budgetExhausted` on the top-level payload and stops all further node
  emission (depth-first, document order: a node's chain before its members).

## State transitions

None — pure construction-time transformation; no persistent state, no
lifecycle.

## Relationships

- `ErrorInfo` 1 → 0..maxCauseDepth `SerializedErrorNode` (causes)
- `ErrorInfo`/member node 1 → 0..maxMembers `SerializedErrorNode` (members)
- Total nodes per event ≤ maxNodes (binding).
- `PackageError` code `error_serialize_failed` raised (via `onInternalError`)
  on contained extraction failure; event still delivered with fallback
  `reduceError` payload.
