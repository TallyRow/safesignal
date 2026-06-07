/**
 * Dispatcher — runs an already-built `LogEvent` through the locked
 * security pipeline order and fans the result out directly to the
 * `SafeTransport`-wrapped transports stored on the active runtime.
 *
 *   LevelFilter   (in logger.ts, upstream of dispatch())
 *     ↓
 *   EventBuilder  (in logger.ts, upstream of dispatch())
 *     ↓
 *   Sanitize → URLScrub → Redact → ControlCharGuard → Freeze(dev) →
 *     SafeTransport[]
 *
 * Each stage is a separate module: `sanitizer.ts`, `url-scrubber.ts`,
 * `redactor.ts`, `control-char-guard.ts`, `freeze.ts`. The wiring
 * below routes events through every stage in the contracted order
 * before any transport sees them (locked as a contract test by T048).
 *
 * Security invariant: **no transport can run before the redactor**.
 * The stage order below is the only emit path. There is no backend
 * indirection in the v1 default path — the dispatcher fans events
 * out directly to the wrapped transports on `runtime.transports`,
 * each already isolated by `SafeTransport` per FS-1/FS-2/FS-11/FS-12.
 *
 * Stage semantics:
 *   - Each stage receives the in-flight event + the normalized config.
 *   - A stage MAY return a transformed event, the same event, or
 *     `null` to **drop the event** (used by the redactor for
 *     fail-closed handling per `contracts/redaction.md`).
 *
 * Error semantics:
 *   - Any uncaught throw from a stage is caught here and routed
 *     through `config.onInternalError`. The event is dropped in that
 *     case (fail-closed: we don't emit partially-processed data).
 *   - Transport fan-out runs inside per-transport try/catch so a
 *     single throwing transport cannot break sibling delivery. Each
 *     transport is `SafeTransport`-wrapped at `configureLogging()`
 *     time, so the try/catch here is a defensive belt for any
 *     residual escape (FS-11 / FS-12).
 *
 * Vendor-neutrality: this module imports no observability-vendor
 * SDK. The seam between core pipeline and consumer transports is a
 * plain function call. Future vendor adapters are implemented as
 * peer transports, not by re-introducing an internal backend indirection.
 */

import type { LogEvent } from '../api/types.js';
import { breadcrumbFail } from '../breadcrumbs/breadcrumb-buffer.js';
import type { NormalizedConfig } from '../config/config.js';
import {
  safeNotify,
  wrapAsPackageError,
} from '../internal/errors/internal-errors.js';
import { controlCharGuard } from './control-char-guard.js';
import { freezeInDev } from './freeze.js';
import { redact } from './redactor.js';
import { sanitize } from './sanitizer.js';
import { urlScrub } from './url-scrubber.js';

/**
 * Pipeline-stage function signature. Returning `null` drops the event.
 *
 * Stages are pure with respect to the `config` argument (read-only).
 * Mutation of the in-flight `event` is allowed within a stage but
 * discouraged — returning a new object keeps stages composable.
 */
export type PipelineStage = (
  event: LogEvent,
  config: NormalizedConfig,
) => LogEvent | null;

/**
 * Run an event through every pipeline stage in order and fan out to
 * the configured transports. Pre-pipeline level filtering happens in
 * `logger.ts` so a filtered-out emission never reaches this function.
 */
export function dispatch(event: LogEvent, config: NormalizedConfig): void {
  let current: LogEvent | null;
  try {
    current = sanitize(event, config);
    if (current === null) return;

    current = urlScrub(current, config);
    if (current === null) return;

    current = redact(current, config);
    if (current === null) return;

    current = controlCharGuard(current, config);
    if (current === null) return;

    // Error-breadcrumbs enrichment (Feature 016) — opt-in, off by default.
    // Attach the recent trail to an error event BEFORE freeze so the enriched
    // event is dev-frozen like everything else. Guarded (fail-safe): a throw is
    // swallowed and the (un-enriched but valid) error event still proceeds —
    // NOT routed through the outer catch, which would drop the event.
    if (config.breadcrumbs !== undefined && current.level === 'error') {
      try {
        config.breadcrumbs.attachTrailTo(current);
      } catch (err) {
        breadcrumbFail(config.onInternalError, err);
      }
    }

    current = freezeInDev(current, config);
    if (current === null) return;
  } catch (err) {
    // Fail-closed: a thrown pipeline stage drops the event entirely
    // and routes the error via `onInternalError`.
    safeNotify(
      config.onInternalError,
      wrapAsPackageError(
        'redactor_failed',
        'A pipeline stage threw; the event was dropped (fail-closed).',
        err,
      ),
    );
    return;
  }

  // Direct transport fan-out. Each transport in `config.transports` is
  // already `SafeTransport`-wrapped at `configureLogging()` time
  // (`buildConfiguredRuntime` in `runtime/configured-runtime.ts`), so
  // synchronous throws and rejected Promises are isolated inside the
  // wrapper. The per-transport try/catch + Promise rejection swallow
  // below are a defensive belt for any residual escape (e.g., a test
  // that passes a raw transport directly through this function).
  for (const transport of config.transports) {
    try {
      const result = transport.send(current);
      if (result instanceof Promise) {
        result.then(undefined, () => undefined);
      }
    } catch {
      // SafeTransport already catches; this is a defensive belt for
      // unwrapped transports.
    }
  }

  // Record this (post-pipeline, already-delivered) event as a breadcrumb for
  // future errors — AFTER fan-out, so an error never records its own trail.
  // Guarded so a throw never reaches the caller and never un-delivers the event.
  if (config.breadcrumbs !== undefined) {
    try {
      config.breadcrumbs.record(current);
    } catch (err) {
      breadcrumbFail(config.onInternalError, err);
    }
  }
}
