/**
 * Single-app consumer example for `@your-org/frontend-logging-sdk`.
 *
 * Demonstrates the safe-by-default patterns required by the package
 * constitution and `docs/safe-logging.md`:
 *   - Structured `attributes`, never template-interpolated values in
 *     the message string.
 *   - Production-safe level defaults (`warn`/`error` baseline; `debug`/
 *     `info` opt-in via `level`).
 *   - Per-emit `correlation()` for cheap, synchronous dynamic context
 *     (trace id, route).
 *   - **First-party beacon transport** from
 *     `@your-org/frontend-logging-sdk/transport-beacon`, replacing
 *     the previous hand-rolled `examples/shared/beacon-transport.ts`.
 *     Body-only HTTPS delivery via `navigator.sendBeacon`, falling
 *     back to `fetch({ keepalive: true })`.
 *   - Built-in `ConsoleTransport` alongside for visible local output.
 *   - `onInternalError` wired into BOTH `configureLogging` AND
 *     `createBeaconTransport` — the beacon transport's async drop
 *     paths (fetch keepalive rejection, oversized event, both
 *     primitives unavailable) execute outside the synchronous
 *     `send()` boundary that `SafeTransport` wraps, so the inner
 *     hook is the only channel for those notices. See
 *     `specs/002-beacon-transport/quickstart.md`'s "Drop notices"
 *     section.
 *
 * Run:
 *   cd examples/host-app
 *   npm install
 *   npm run typecheck      # type-only validation
 */

import {
  ConsoleTransport,
  configureLogging,
  createLogger,
} from '@your-org/frontend-logging-sdk';
import { createBeaconTransport } from '@your-org/frontend-logging-sdk/transport-beacon';

// 1. A single diagnostics hook wired into both layers. The beacon
//    transport's async drop paths surface via this callback; the
//    runtime's SafeTransport wrapper also routes generic failures
//    through the same hook. Consumers see one consistent diagnostic
//    shape regardless of which layer emitted the notice.
const onInternalError = (err: Error): void => {
  // In real apps: route to your error reporter (Sentry, Bugsnag, etc.).
  // For this example we use console.error so the developer can see the
  // notice during local development.
  // eslint-disable-next-line no-console
  console.error('[logging-sdk] internal error:', err.message);
};

// 2. Configure once at app startup. Pass `environment` explicitly —
//    the package never reads `process.env.NODE_ENV` or
//    `import.meta.env`. The beacon transport delivers events
//    POST-body-only over HTTPS — NEVER as URL query params.
configureLogging({
  application: { name: 'checkout-web', version: '2025.05.0' },
  environment: 'production',
  transports: [
    createBeaconTransport({
      endpoint: 'https://logs.example.com/ingest',
      onInternalError, // ← inner hook for async beacon drops
    }),
    ConsoleTransport(),
  ],
  onInternalError, // ← outer hook for SafeTransport-wrapped failures
  // Optional per-emit dynamic context. Must be cheap and synchronous.
  correlation: () => ({
    attributes: {
      // Example: route name, trace id, build SHA — whatever your app
      // can pull synchronously.
      route: typeof location !== 'undefined' ? location.pathname : '/',
    },
  }),
});

// 3. Create a logger anywhere. Loggers are cheap and hold no captured
//    state — every emit reads the current configuration, so a later
//    `configureLogging()` call affects loggers created earlier.
const log = createLogger();

// 4. Emit STRUCTURED events. Each method takes a fixed-string `message`
//    plus a structured `attributes` bag. Values stay reviewable
//    downstream instead of disappearing into an interpolated string.

log.info('checkout opened', { cartItems: 3 });

log.warn('coupon rejected', {
  code: 'SUMMER25',
  reason: 'expired',
});

log.error(
  'payment failed',
  { provider: 'acme-pay', orderId: 'o-1234' },
  new Error('declined'),
);

// 5. A child logger derives extra context for a unit of work — e.g., a
//    single request, page, or component lifecycle. Parents are
//    unaffected by the child's context layer.
const requestLog = log.child({
  attributes: { requestId: 'r-92f1' },
});
requestLog.info('fetching cart');

// 6. Federated module pattern — the host owns the runtime configured
//    above. Each federated module creates its OWN logger by passing
//    `module: { name, version }` to `createLogger`; that identity is
//    attached to every event the module emits via
//    `event.context.module`. The host's transports / redactor /
//    sanitizer are reused — modules do NOT install transports or call
//    `configureLogging()`. See `examples/federated-module/` for the
//    full federated-module-author guidance.
const productRecommendationsLog = createLogger({
  module: { name: 'product-recommendations', version: '0.4.2' },
});
productRecommendationsLog.warn('recommendations fetch slow', {
  durationMs: 1820,
  cacheStatus: 'miss',
});

const checkoutCartLog = createLogger({
  module: { name: 'checkout-cart', version: '1.2.0' },
});
checkoutCartLog.error(
  'cart sync failed',
  { items: 3 },
  new Error('upstream 503'),
);
// Both modules emit through the SAME configured runtime. Their
// distinct module identities surface in the wire body's
// `context.module.name` — host operators can route on that field
// downstream (e.g., dashboards per module).

// 7. In `production`, the default level is `warn` — `debug` and `info`
//    are dropped unless the consumer raises the threshold. Override
//    per-environment when you need verbose dev output:
//
//      configureLogging({
//        environment: 'development',
//        level: { production: 'info', development: 'debug', test: 'warn' },
//        transports: [ConsoleTransport()],
//      });
//
// 8. Local development against a localhost ingestion endpoint: the
//    beacon transport refuses non-HTTPS endpoints at construction by
//    default. Opt into loopback delivery explicitly — and ONLY for
//    `localhost`, `127.0.0.1`, or `[::1]`:
//
//      createBeaconTransport({
//        endpoint: 'http://localhost:4318/ingest',
//        allowInsecureLoopback: true,
//        onInternalError,
//      });
//
//    The flag is the only escape from HTTPS at construction time, and
//    it never reads ambient state — your code makes the opt-in visible
//    at the call site.
//
// 9. Verify any custom transport against the security contract using
//    the `./testing` subpath helper. The first-party beacon transport
//    already passes this contract; consumers wrapping or extending it
//    should re-verify:
//
//      import { assertTransportContract } from '@your-org/frontend-logging-sdk/testing';
//      import { createBeaconTransport } from '@your-org/frontend-logging-sdk/transport-beacon';
//
//      await assertTransportContract(
//        createBeaconTransport({ endpoint: 'https://logs.example.com/ingest' }),
//      );

// ANTI-PATTERNS — do NOT do any of these in real consumer code. They
// are listed here as references for code reviewers; uncomment to see
// what the package does with them.
//
//   // BAD — interpolating values into the message hides them from
//   // downstream structured search.
//   log.info(`checkout opened by ${user.email}`);
//
//   // BAD — dumping a whole framework object. The package's
//   // sanitizer type-tags Event/Promise/Map/etc. and class instances
//   // rather than recursing, so this won't even produce useful data
//   // AND risks pulling unintended fields. See docs/safe-logging.md.
//   log.error('click failed', { event });
//
//   // BAD — dumping full application state.
//   log.error('reducer threw', { state });
