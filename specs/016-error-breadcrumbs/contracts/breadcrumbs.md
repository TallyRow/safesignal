# Contract: Opt-In Error Breadcrumbs (core runtime configuration)

**Surface**: `configureLogging({ breadcrumbs })` (core runtime config, off by default) + the documented
reserved attribute shapes on enriched **error** events.
**Enforces**: Principle V (secure/off-by-default), IV (structured/bounded), VII (integrity), VIII
(lightweight/constant-memory/shared), III (fail-safe), X (mechanical enforcement). Source of truth for the
implementation and contract tests.

## API

```ts
import type { LoggerConfig } from '@tallyrow/safesignal'; // shape only

export interface BreadcrumbsOptions {
  /** Ring-buffer capacity. Default 20; clamped to [1, 100] (one notice on clamp). */
  maxEvents?: number;
}

// added to LoggerConfig:
//   breadcrumbs?: boolean | BreadcrumbsOptions;   // default: off
```

When enabled, an **error**-level event carries (on its `attributes`):
- `safesignal.breadcrumbs`: ordered oldest→newest array of `{ ts, level, message, app?, module?, attributes? }`
  (≤ `maxEvents`, excluding the error itself). `app`/`module` carry origin attribution (FR-011).
- `safesignal.errorCauses`: ordered outermost→root array of `{ name, message }` (≤ 8), present only when
  the error has a `cause`.

## Behavioral guarantees (each is a test)

| # | Guarantee | Maps to |
|---|-----------|---------|
| **BC-1** | **Off by default**: with no `breadcrumbs` config, no buffer is allocated, **0** events are recorded, and behavior/output/cost are identical to today. | FR-001 / SC-001 |
| **BC-2** | When enabled, an error event carries `safesignal.breadcrumbs` = the last `min(maxEvents, available)` **preceding** events (ordered oldest→newest), excluding the error itself. | FR-004 / SC-002 |
| **BC-3** | A **non-error** event is delivered **unchanged** (no trail attached) and is recorded into the buffer for future errors. | FR-007 / SC-002 |
| **BC-4** | When the error value has a nested `cause` chain, the error event carries `safesignal.errorCauses` (ordered outermost→root, each `{name,message}`); the field is **omitted** when there is no cause. | FR-005 / SC-002 |
| **BC-5** | A **cyclic / very deep** cause chain is flattened to ≤ `MAX_CAUSE_DEPTH` (8) entries with **0** infinite loops and **0** throws. | FR-005 / SC-005 |
| **BC-6** | **Constant memory / O(1)**: logging `M ≫ maxEvents` events keeps the buffer at ≤ `maxEvents` entries (oldest evicted) and per-log recording cost does not scale with M. | FR-002/FR-003 / SC-003 |
| **BC-7** | **Secure**: breadcrumbs + causes carry the redactor's **whole-value** guarantee — a secret supplied as an entire attribute value / entire cause message is masked, appearing **0** times unredacted in the trail or causes. (Substring-in-free-text is not scrubbed, identical to `message` today; breadcrumbs add no new path.) | FR-006 / SC-004 |
| **BC-8** | **Anti-nesting**: a recorded snapshot excludes the `safesignal.breadcrumbs` key, so trails never nest and memory stays bounded. | FR-012 / SC-003 |
| **BC-9** | **Integrity**: enrichment adds fields to the **error** event only; it does not drop/reorder/dedupe/mutate any other event, does not change what non-error events carry, and does not mutate an already-delivered event (snapshots are copies). | Principle VII / FR-007 |
| **BC-10** | **Fail-safe**: a throwing recorder/enricher (or a throwing cause walk) is swallowed → `onInternalError`; the error event is **still delivered**; nothing throws into the page. | FR-010 / SC-006 |
| **BC-11** | **Lightweight / shared**: the buffer is one runtime-level resource created once at `configureLogging()`; creating many `Logger`s adds **0** per-logger buffers/timers/listeners; a re-`configureLogging()` creates a fresh buffer (isolated per runtime/copy). | FR-008/FR-011 / SC-007 |
| **BC-12** | **Config clamp**: `maxEvents` out of `[1,100]` clamps to the bound and emits **one** `onInternalError` notice; `true` enables defaults; `false`/absent stays off. | FR-009 / FR-001 |
| **BC-13** | **Bounded payload**: the trail length ≤ `maxEvents` and each entry's attributes are bounded by `sanitizerLimits`; the enrichment cannot inflate an error event without limit. | FR-012 |

## Distributed surface & bundle (Principle X / XI)

No new subpath — the `exports` map and packaged file set are **unchanged** (parity set untouched). The
default `.` entry grows by the small, off-by-default breadcrumb code; this is governed by:
- **`bundle-invariance`** (`scripts/ci/bundle-invariance-check.sh`): `dist/index.mjs` gzip delta vs
  merge-base MUST stay within **±1024 B** — the implementation is kept lean to fit (NOT re-baselinable).
- **`transport-beacon-bundle-shape.security.test.ts (e)`**: the stored `DEFAULT_ENTRY_MJS/CJS_GZ_MAX`
  ceilings are **re-baselined** with a documented justification comment to the new observed sizes.

## Reference (non-normative)

```jsonc
// Error logged:  new Error('checkout failed', { cause: new Error('payment processor 5xx') })
// event.error = { name: 'Error', message: 'checkout failed' }   ← the top error stays here
// a delivered error event's attributes when breadcrumbs are enabled:
{
  "orderId": "ord_9f3",
  "safesignal.breadcrumbs": [
    { "ts": "…", "level": "info", "message": "checkout opened", "app": "checkout-web", "attributes": { "cartItems": 3 } },
    { "ts": "…", "level": "warn", "message": "coupon expired", "app": "checkout-web" }
  ],
  // nested causes ONLY (the top error is in event.error, not duplicated here):
  "safesignal.errorCauses": [
    { "name": "Error", "message": "payment processor 5xx" }
  ]
}
```
