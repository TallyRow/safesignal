/**
 * Dispatcher — runs an already-built `LogEvent` through the locked
 * security pipeline order and hands off to the configured backend.
 *
 *   LevelFilter   (in logger.ts, upstream of dispatch())
 *     ↓
 *   EventBuilder  (in logger.ts, upstream of dispatch())
 *     ↓
 *   Sanitize → URLScrub → Redact → ControlCharGuard → Freeze(dev) →
 *     backend.handle → SafeTransport[]
 *
 * Each stage is a separate module: `sanitizer.ts`, `url-scrubber.ts`,
 * `redactor.ts`, `control-char-guard.ts`, `freeze.ts`. T018 created
 * the modules as pass-through stubs using the "named, swappable
 * seams" pattern; Phase 5 (T031–T035) filled in their bodies WITHOUT
 * touching this file. T036 is the explicit confirmation that the
 * wiring below routes events through every stage in the contracted
 * order before any backend or transport sees them (locked as a
 * contract test by T048).
 *
 * Security invariant: **no backend or transport can run before the
 * redactor**. The stage order below is the only emit path; the
 * fallback `deliverDirectlyToTransports()` only runs AFTER all five
 * pipeline stages have completed and is reached only when
 * `backend.handle()` itself throws.
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
 *   - `backend.handle()` runs inside the same try/catch so the final
 *     no-throw invariant holds.
 *
 * Future-direction note: T066 (US5) will refactor `dispatch()` to
 * drop the `backend.handle()` indirection in favor of direct
 * `SafeTransport[]` fan-out per plan.md's vendor-neutral core
 * architecture. The stage order above is unchanged by that refactor.
 */

import type { LogEvent } from '../api/types.js';
import type { NormalizedConfig } from '../config/config.js';
import type { TelemetryBackend } from '../internal/telemetry/backend.js';
import { safeNotify, wrapAsPackageError } from '../internal/errors/internal-errors.js';
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
 * Run an event through every pipeline stage in order and hand off to
 * the backend. Pre-pipeline level filtering happens in `logger.ts` so
 * a filtered-out emission never reaches this function.
 */
export function dispatch(
  event: LogEvent,
  config: NormalizedConfig,
  backend: TelemetryBackend,
): void {
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

  try {
    backend.handle(current);
  } catch (err) {
    // FS-7 direct fallback: when the backend itself throws, deliver the
    // post-pipeline event directly to the configured transports. The
    // transports were SafeTransport-wrapped at configureLogging() time
    // (in logger.ts installState), so each delivery is independently
    // isolated and a throwing transport cannot break sibling delivery.
    safeNotify(
      config.onInternalError,
      wrapAsPackageError(
        'backend_handle_failed',
        'backend.handle threw; delivering the event directly to transports via the dispatcher fallback path.',
        err,
      ),
    );
    deliverDirectlyToTransports(current, config);
  }
}

/**
 * FS-7 direct-fallback delivery path. Iterates configured transports and
 * invokes `send()` on each. Each transport is already SafeTransport-wrapped
 * by `installState()`, so synchronous throws and rejected Promises are
 * isolated inside the wrapper. Any residual escape (defensive belt) is
 * caught here so a single transport never affects siblings.
 */
function deliverDirectlyToTransports(
  event: LogEvent,
  config: NormalizedConfig,
): void {
  for (const transport of config.transports) {
    try {
      const result = transport.send(event);
      if (result instanceof Promise) {
        result.then(undefined, () => undefined);
      }
    } catch {
      // SafeTransport already catches; this is a defensive belt for
      // unwrapped transports (e.g., when a test passes a raw transport
      // into the dispatcher directly).
    }
  }
}
