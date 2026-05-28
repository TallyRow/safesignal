/**
 * Federated module consumer example for **SafeSignal**
 * (`@tallyrow/safesignal`).
 *
 * Demonstrates the federated/module-federation usage pattern documented
 * in `spec.md` (US4 + the federated configuration-ownership clauses in
 * `plan.md`). A federated module:
 *
 *   1. Does NOT call `configureLogging()` in normal operation. The HOST
 *      application owns the configured runtime by convention. The
 *      module reads it via `createLogger()` and emits structured events
 *      through the host's transports / redactor / sanitizer.
 *   2. Attaches its own `module.{name, version}` identity via
 *      `createLogger({ module })`. Every event the module emits then
 *      carries `event.context.module` so the host's transports can
 *      attribute the event to this module.
 *   3. Derives per-feature / per-request context via `child()` /
 *      `withContext()` — never mutates a shared logger reference.
 *   4. The host's transport is the first-party
 *      `createBeaconTransport` from
 *      `@tallyrow/safesignal/transport-beacon` — the
 *      module never imports or installs a transport. If the module
 *      ever needs to ship its own transport for standalone iteration
 *      (e.g., Storybook), it imports the same first-party factory
 *      (body-only HTTPS by construction) — never a hand-rolled one,
 *      never a URL-based one.
 *
 * Run:
 *   cd examples/federated-module
 *   npm install
 *   npm run typecheck      # type-only validation
 *
 * --------------------------------------------------------------------
 * SECURITY GUIDANCE FOR FEDERATED MODULE AUTHORS
 *
 * A federated module is loaded into a host application's runtime and
 * shares its window, document, cookies, and origin. Any value the
 * module logs is potentially visible to every transport configured by
 * the host. Treat the host's environment as untrusted with respect to
 * what you log:
 *
 *   - DO NOT log values the module obtained from the HOST (auth tokens
 *     from the page's auth header, host-side cookies, host-app
 *     framework state, host user identifiers, host CSRF tokens, etc.).
 *     If a host needs that data in its own logs it can log it itself.
 *   - DO NOT log ambient browser state via the module. Anything the
 *     module reads from `location`, `document.cookie`, `localStorage`,
 *     `sessionStorage`, `navigator.*`, etc. belongs in the host's
 *     observability strategy if it belongs anywhere — the module
 *     should not snapshot ambient state and emit it through the
 *     shared logging pipeline.
 *   - DO NOT log whole framework objects, raw DOM nodes, or full host
 *     application state. The sanitizer will type-tag them ("[Event:
 *     click]", "[Element:div]", etc.), so even if you try this it
 *     produces zero useful data AND risks dumping fields you didn't
 *     mean to log.
 *   - DO confine module logs to the module's own state — features
 *     loaded, items rendered, errors caught inside the module's call
 *     stack, performance markers the module owns.
 *
 * The host's redactor and sanitizer are a shared safety net, NOT an
 * excuse to log sensitive host data. The redactor's default key
 * denylist catches obvious leaks like `password` / `token` / etc., but
 * it cannot catch a host-side user identifier the host has chosen not
 * to deny by name. See `docs/safe-logging.md` for the full DO / DON'T
 * sweep.
 * --------------------------------------------------------------------
 */

import { createLogger } from '@tallyrow/safesignal';

// A normal federated module does NOT import `createBeaconTransport`
// and does NOT call `configureLogging`. The HOST owns the configured
// runtime (FR-030..FR-032 from feature 001) — the module emits via
// `createLogger()` and its events flow through the host's transports.
//
// The standalone-iteration block at the bottom of this file shows
// the no-host fallback pattern, where the developer wires up a
// `createBeaconTransport` from
// `@tallyrow/safesignal/transport-beacon` for visible
// local output. That is the ONLY place a module imports a transport.

// 1. Create the module logger. This is the ONLY public-API call a
//    federated module needs in normal operation. The module identity
//    here is what every emitted event will carry in
//    `event.context.module`, distinguishing this module's events from
//    the host's and from other modules sharing the same configured
//    runtime.
const moduleLog = createLogger({
  module: { name: 'product-recommendations', version: '0.4.2' },
});

// 2. Emit STRUCTURED events. Identical surface to the host-app example
//    — the module API is the same shape (FR-022, FR-027). Only the
//    `module` identity in the context distinguishes the origin.

moduleLog.info('recommendations rendered', {
  count: 6,
  layout: 'carousel',
});

moduleLog.warn('recommendation fetch slow', {
  durationMs: 1820,
  cacheStatus: 'miss',
});

// 3. For per-request / per-component context, derive a child logger.
//    The child carries the module identity AND its own additional
//    attributes; the parent is NOT mutated, so other call sites that
//    hold `moduleLog` continue to see only the module-level context.
const renderLog = moduleLog.child({
  attributes: {
    renderId: 'r-92f1',
    slot: 'home-page-bottom',
  },
});

renderLog.info('render started');
renderLog.info('render complete', { itemsShown: 6 });

// 4. The module catches and logs its OWN errors. Note: the third arg to
//    `error` is an `unknown` value — the only place the public surface
//    accepts `unknown`. The pipeline reduces it to `{ name, message,
//    stack? }` and never holds onto the raw Error.
try {
  // Imagine: fetch product recommendations from a module-owned API.
  throw new Error('recommendations API returned 503');
} catch (err) {
  moduleLog.error(
    'recommendations fetch failed',
    { endpoint: '/api/recs/v1', retryable: true },
    err,
  );
}

// 5. Module identity can be overridden in a derived logger for
//    per-sub-feature distinction (e.g., a tab within this module wants
//    its own sub-identity). The merge precedence is
//    root → per-logger → child → correlation, so the child override
//    wins over the per-logger module identity.
const subFeatureLog = moduleLog.child({
  module: { name: 'product-recommendations.related-items', version: '0.4.2' },
});
subFeatureLog.info('related items loaded', { count: 4 });

// --------------------------------------------------------------------
// ANTI-PATTERNS — federated-module-specific. Do NOT do these in real
// module code. They are kept here as references for code reviewers.
// --------------------------------------------------------------------
//
//   // BAD — the module should NOT install transports. The host owns
//   // configuration. If you find yourself wanting to call
//   // configureLogging() inside a module, ask the host to expose the
//   // configuration surface to module-loading code instead — the
//   // package spec documents that a module-initiated configureLogging
//   // call replaces the host's active runtime atomically, which is
//   // almost never what you want in production.
//   //
//   // import { configureLogging } from '@tallyrow/safesignal';
//   // import { createBeaconTransport } from '@tallyrow/safesignal/transport-beacon';
//   // configureLogging({
//   //   application: { name: 'product-recs-standalone' },
//   //   transports: [
//   //     createBeaconTransport({ endpoint: 'https://logs.example.com/ingest' }),
//   //   ],
//   // });
//
//   // BAD — the module should NOT log host-derived auth/session data.
//   // Even if the redactor masks `Authorization` and `Cookie` by name,
//   // the host's identifiers (user_id, account_id, etc.) likely are
//   // NOT in the default denylist.
//   //   const authHeader = (window as any).__HOST_AUTH_HEADER;
//   //   moduleLog.info('user action', { user_auth: authHeader });
//
//   // BAD — the module should NOT snapshot ambient browser state.
//   // The host already knows the route, the user agent, the page
//   // load timing. A module logging these duplicates state the host
//   // already attributes.
//   //   moduleLog.info('module visible', {
//   //     route: location.pathname,
//   //     ua: navigator.userAgent,
//   //     cookies: document.cookie,  // ALSO a leak
//   //   });
//
//   // BAD — the module should NOT log whole host application state.
//   //   moduleLog.error('reducer threw', { hostStore });
//
// --------------------------------------------------------------------
// Standalone (no-host) iteration pattern — for completeness only.
//
// When developing this module in isolation (e.g., a Storybook story or
// a component playground) the HOST has not configured logging. The
// pre-configure runtime drops `debug`/`info` and uses `NoopTransport`,
// so module logs are silent. If you need visible local output for
// iteration:
//
//   import {
//     ConsoleTransport,
//     configureLogging,
//   } from '@tallyrow/safesignal';
//   import { createBeaconTransport } from '@tallyrow/safesignal/transport-beacon';
//
//   if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
//     configureLogging({
//       application: { name: 'product-recs-standalone' },
//       environment: 'development',
//       level: 'debug',
//       transports: [
//         ConsoleTransport(),
//         createBeaconTransport({
//           endpoint: 'http://localhost:4318/ingest',
//           allowInsecureLoopback: true,
//         }),
//       ],
//     });
//   }
//
// In production, the module is loaded INSIDE a host — DO NOT ship this
// gated block to production. The host's configureLogging() call MUST
// be the authoritative runtime.
