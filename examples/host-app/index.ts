/**
 * Single-app consumer example for `@your-org/frontend-logging-sdk`.
 *
 * Demonstrates the safe-by-default patterns required by the package
 * constitution and the plan's "Logging safely" guidance:
 *   - Structured `attributes`, never template-interpolated values in
 *     the message string.
 *   - Production-safe level defaults (`warn`/`error` baseline; `debug`/
 *     `info` opt-in via `level`).
 *   - Per-emit `correlation()` for cheap, synchronous dynamic context
 *     (trace id, route).
 *   - Built-in `ConsoleTransport` for browsers / development.
 *
 * For body-only HTTP / beacon delivery, see the shared transport at
 * `examples/shared/beacon-transport.ts` (lands in T029).
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

// 1. Configure once at app startup. Pass `environment` explicitly — the
//    package never reads `process.env.NODE_ENV` or `import.meta.env`.
configureLogging({
  application: { name: 'checkout-web', version: '2025.05.0' },
  environment: 'production',
  transports: [ConsoleTransport()],
  // Optional per-emit dynamic context. Must be cheap and synchronous.
  correlation: () => ({
    attributes: {
      // Example: route name, trace id, build SHA — whatever your app
      // can pull synchronously.
      route: typeof location !== 'undefined' ? location.pathname : '/',
    },
  }),
});

// 2. Create a logger anywhere. Loggers are cheap and hold no captured
//    state — every emit reads the current configuration, so a later
//    `configureLogging()` call affects loggers created earlier.
const log = createLogger();

// 3. Emit STRUCTURED events. Each method takes a fixed-string `message`
//    plus a structured `attributes` bag. Values stay reviewable downstream
//    instead of disappearing into an interpolated string.

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

// 4. A child logger derives extra context for a unit of work — e.g., a
//    single request, page, or component lifecycle. Parents are
//    unaffected by the child's context layer.
const requestLog = log.child({
  attributes: { requestId: 'r-92f1' },
});
requestLog.info('fetching cart');

// 5. In `production`, the default level is `warn` — `debug` and `info`
//    are dropped unless the consumer raises the threshold. Override
//    per-environment when you need verbose dev output:
//
//      configureLogging({
//        environment: 'development',
//        level: { production: 'info', development: 'debug', test: 'warn' },
//        transports: [ConsoleTransport()],
//      });

// ANTI-PATTERNS — do NOT do any of these in real consumer code. They
// are listed here as references for code reviewers; uncomment to see
// what the package does with them.
//
//   // BAD — interpolating values into the message hides them from
//   // downstream structured search.
//   log.info(`checkout opened by ${user.email}`);
//
//   // BAD — dumping a whole framework object. The sanitizer (T031)
//   // type-tags Event/Promise/Map/etc. and class instances rather
//   // than recursing, so this won't even produce useful data AND
//   // risks pulling unintended fields.
//   log.error('click failed', { event });
//
//   // BAD — dumping full application state.
//   log.error('reducer threw', { state });
