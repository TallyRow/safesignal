/**
 * Module-scoped active-runtime slot.
 *
 * The single source of truth for "which `ConfiguredRuntime` is
 * currently active in this loaded copy of the package." Every
 * `Logger` handle reads through `getActiveRuntime()` at emit time,
 * so retained `Logger` references automatically pick up a new
 * runtime after `configureLogging()` performs an atomic swap via
 * `installRuntime()` (locks FR-031 / SC-012).
 *
 * Storage is **module-scoped only** — a top-level `let`. Per
 * constitution v1.2.0 Principle VII and FR-033, the slot:
 *   - does NOT use `globalThis` / `window` / `self` / `document`
 *   - does NOT register under `Symbol.for(...)`
 *   - does NOT install any cross-realm or cross-bundle sharing
 *     mechanism
 *
 * That is the load-bearing property that makes duplicate-package-
 * copy behavior **isolated** (FR-033): when a federated bundler
 * causes two physical copies of this package to load on a single
 * page, each copy has its own private `active` variable. Configuring
 * one copy does not affect the other; loggers from one copy cannot
 * cross-route events into the other copy's transports. Consumers
 * who want cross-copy sharing configure their bundler's module-
 * federation `shared` map at build time — there is no runtime
 * back door here.
 *
 * `getActiveRuntime()` returns `undefined` until the first call
 * to `installRuntime()` (or until `configureLogging()` triggers
 * lazy install via the safe-defaults runtime). Callers should
 * handle the undefined case by installing a default; the package's
 * own emit path does this via the lazy-install in
 * `src/api/logger.ts::ensureState()`.
 */

import type { ConfiguredRuntime } from './configured-runtime.js';

/**
 * The single active-runtime cell. Module-scoped; never exported as a
 * mutable binding. External access goes through `getActiveRuntime()`
 * (read) and `installRuntime()` (atomic write + return-previous).
 */
let active: ConfiguredRuntime | undefined;

/**
 * Read the currently-active `ConfiguredRuntime`, or `undefined` if
 * no runtime has been installed yet. Constant-time slot read; no
 * allocation; never throws.
 *
 * Read fresh at every emit so retained logger references see the
 * latest configuration after a swap. Callers MUST NOT cache the
 * result across emits.
 */
export function getActiveRuntime(): ConfiguredRuntime | undefined {
  return active;
}

/**
 * Atomic swap: install `runtime` as the active runtime and return
 * the previously-active one (or `undefined` for the first install).
 *
 * The swap itself is a single assignment, so the slot transitions
 * from "old" to "new" in one step — no observer can ever see a
 * partially-installed state. Teardown of the previous runtime
 * (flush + shutdown of its transports) is the CALLER's
 * responsibility; this function does not perform any teardown
 * because the caller may want to inspect the previous runtime
 * before tearing it down.
 *
 * `configureLogging()` calls this then schedules
 * `shutdownRuntime(previous)` fire-and-forget so the new runtime
 * is live for the very next emit while the old one's transports
 * are still flushing in the background.
 */
export function installRuntime(
  runtime: ConfiguredRuntime,
): ConfiguredRuntime | undefined {
  const previous = active;
  active = runtime;
  return previous;
}

/**
 * Reset the active-runtime slot to `undefined`. Test-only helper:
 * the package's own test suite uses this to isolate test cases
 * from each other so a leftover runtime from one test cannot
 * affect the next. Not exposed from the runtime public surface;
 * callers reach for it explicitly only when they have a specific
 * need to drop state (e.g., between `vi.isolateModules` runs in
 * the duplicate-copy isolation test landing in T064).
 */
export function clearActiveRuntimeForTests(): void {
  active = undefined;
}
