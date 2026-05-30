/**
 * Context-boundary safety security test (T055).
 *
 * Locks the load-bearing US4 ↔ US3 invariant: federated context
 * propagation (US4) must NOT regress the secure-logging pipeline
 * (US3). Every context entry point flows through the same sanitizer
 * + URL scrubber + redactor + control-char guard + freeze that
 * attribute-side data flows through — there is NO context-side
 * back door past the security pipeline.
 *
 * Four context entry points covered:
 *   1. `LoggerConfig.context.attributes` (root static context)
 *   2. `CreateLoggerOptions.context.attributes` (per-logger static)
 *   3. `logger.child(ctx).attributes` / `logger.withContext(ctx).attributes`
 *      (derived loggers)
 *   4. `correlation()` return value attributes (per-emit dynamic)
 *
 * Two assertion families:
 *   A. **Pathological values in context** (DOM nodes, framework
 *      objects, cyclic refs, deep nesting, oversized strings) are
 *      reduced to documented coercion outputs by the sanitizer; the
 *      transport never sees raw data.
 *   B. **Sensitive values in context** (the `makeSecretFixture()`
 *      bag — passwords, tokens, JWTs, Bearer tokens, etc.) are masked
 *      by the redactor; a JSON scan of the delivered event finds zero
 *      fixture values. This is the "context-through-pipeline" sweep
 *      that plan.md "Testing Strategy" references — same load-bearing
 *      property as T041's attribute sweep, but for context entry
 *      points specifically.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { LogEvent } from '../../src/api/types.js';
import { configureLogging, createLogger } from '../../src/index.js';
import {
  FIXTURE_VALUES,
  makeSecretFixture,
} from '../../src/testing/secret-fixtures.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const APP = { name: 'context-boundary', version: '1.0.0' };

let capture = makeCapturingTransport('capture');

beforeEach(() => {
  capture = makeCapturingTransport('capture');
});

/**
 * Scan the captured event's serialized form for any leaked fixture
 * value. Excludes `error.stack` (documented limitation, see T041).
 */
function findLeaks(event: LogEvent): string[] {
  const safe: LogEvent =
    event.error === undefined
      ? event
      : {
          ...event,
          error: { name: event.error.name, message: event.error.message },
        };
  // Exclude the SDK-generated `timestamp` from the leak scan: its
  // millisecond component can coincidentally contain a short fixture value
  // (e.g. the cvv fixture '123' vs a `…44.123Z` timestamp), a flaky
  // false-positive. The timestamp is never consumer-supplied. Mirrors the
  // fix in secret-leakage.test.ts + secret-sweep.integration.test.ts
  // (Principle VIII: same source, same result).
  const { timestamp: _timestamp, ...scannable } = safe;
  const serialized = JSON.stringify(scannable);
  return FIXTURE_VALUES.filter((v) => serialized.includes(v));
}

// ---------------------------------------------------------------------------
// A. Pathological values in context get sanitized
// ---------------------------------------------------------------------------

describe('pathological values in LoggerConfig.context.attributes are sanitized', () => {
  it('a DOM node in root context is type-tagged, not recursed', () => {
    const el = document.createElement('div');
    el.innerHTML = '<script>alert(1)</script>'; // hostile content
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      context: { attributes: { node: el as never } },
    });
    createLogger().info('e');
    const event = capture.calls[0]!;
    expect(event.context.attributes?.node).toBe('[Element:div]');
    expect(JSON.stringify(event)).not.toContain('alert(1)');
  });

  it('a Map / Set / Promise in root context is type-tagged', () => {
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      context: {
        attributes: {
          map: new Map([['k', 'v']]) as never,
          set: new Set([1, 2]) as never,
          promise: Promise.resolve(1) as never,
        },
      },
    });
    createLogger().info('e');
    const ctx = capture.calls[0]!.context.attributes!;
    expect(ctx.map).toBe('[Map]');
    expect(ctx.set).toBe('[Set]');
    expect(ctx.promise).toBe('[Promise]');
  });

  it('a cyclic context attribute is collapsed to "[Circular]"', () => {
    const cyclic: Record<string, unknown> = { tag: 'root' };
    cyclic.self = cyclic;
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      context: { attributes: { c: cyclic as never } },
    });
    createLogger().info('e');
    const c = capture.calls[0]!.context.attributes?.c as Record<
      string,
      unknown
    >;
    expect(c.self).toBe('[Circular]');
  });
});

describe('pathological values via createLogger({ context }) are sanitized', () => {
  it('a class instance in per-logger context is type-tagged (getters not invoked)', () => {
    let getterCalls = 0;
    class Cred {
      // eslint-disable-next-line @typescript-eslint/class-literal-property-style
      get password(): string {
        getterCalls++;
        return 'leak';
      }
    }
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
    });
    createLogger({ context: { attributes: { c: new Cred() as never } } }).info(
      'e',
    );
    expect(capture.calls[0]!.context.attributes?.c).toBe('[Cred]');
    expect(getterCalls).toBe(0);
  });
});

describe('pathological values via child() / withContext() are sanitized', () => {
  it('a DOM node injected via .child({ attributes }) is type-tagged at the transport', () => {
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
    });
    const log = createLogger();
    const withDom = log.child({
      attributes: { node: document.createElement('p') as never },
    });
    withDom.info('e');
    expect(capture.calls[0]!.context.attributes?.node).toBe('[Element:p]');
  });

  it('an oversized string in .withContext({ attributes }) is truncated', () => {
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      sanitizerLimits: { maxStringLength: 64 },
    });
    const log = createLogger();
    const derived = log.withContext({
      attributes: { huge: 'x'.repeat(500) },
    });
    derived.info('e');
    expect(capture.calls[0]!.context.attributes?.huge).toBe(
      `${'x'.repeat(64)}...[truncated]`,
    );
  });
});

describe('pathological values via correlation() are sanitized', () => {
  it('a cyclic object returned from correlation() is collapsed to "[Circular]"', () => {
    const cyclic: Record<string, unknown> = { tag: 'corr' };
    cyclic.self = cyclic;
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      correlation: () => ({
        attributes: { c: cyclic as never },
      }),
    });
    createLogger().info('e');
    const c = capture.calls[0]!.context.attributes?.c as Record<
      string,
      unknown
    >;
    expect(c.self).toBe('[Circular]');
  });

  it('a JWT-shape value returned from correlation() is masked', () => {
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      correlation: () => ({
        attributes: {
          jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturepart-LONG',
        },
      }),
    });
    createLogger().info('e');
    expect(capture.calls[0]!.context.attributes?.jwt).toBe('[REDACTED]');
  });

  it('a Map / DOM node returned from correlation() is type-tagged', () => {
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      correlation: () => ({
        attributes: {
          map: new Map([['k', 'v']]) as never,
          node: document.createElement('span') as never,
        },
      }),
    });
    createLogger().info('e');
    const ctx = capture.calls[0]!.context.attributes!;
    expect(ctx.map).toBe('[Map]');
    expect(ctx.node).toBe('[Element:span]');
  });
});

// ---------------------------------------------------------------------------
// B. Sensitive values in context get redacted (context-through-pipeline)
// ---------------------------------------------------------------------------

describe('context-through-pipeline sweep: every context entry point flows through sanitizer + redactor', () => {
  it('makeSecretFixture() values in LoggerConfig.context.attributes are masked at the transport', () => {
    const fixture = makeSecretFixture();
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      context: {
        attributes: {
          password: fixture.password,
          token: fixture.token,
          authorization: fixture.authorization,
          api_key: fixture.apiKey,
          session_id: fixture.sessionId,
          // Shape-matching value under a non-denied context key:
          extra_jwt: fixture.jwt,
        },
      },
    });
    createLogger().info('e');
    const event = capture.calls[0]!;
    expect(event.context.attributes?.password).toBe('[REDACTED]');
    expect(event.context.attributes?.token).toBe('[REDACTED]');
    expect(event.context.attributes?.authorization).toBe('[REDACTED]');
    expect(event.context.attributes?.api_key).toBe('[REDACTED]');
    expect(event.context.attributes?.session_id).toBe('[REDACTED]');
    expect(event.context.attributes?.extra_jwt).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });

  it('makeSecretFixture() values in createLogger({ context }) are masked at the transport', () => {
    const fixture = makeSecretFixture();
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
    });
    createLogger({
      context: {
        attributes: {
          password: fixture.password,
          token: fixture.token,
          api_key: fixture.apiKey,
        },
      },
    }).info('e');
    const event = capture.calls[0]!;
    expect(event.context.attributes?.password).toBe('[REDACTED]');
    expect(event.context.attributes?.token).toBe('[REDACTED]');
    expect(event.context.attributes?.api_key).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });

  it('makeSecretFixture() values in child() / withContext() are masked at the transport', () => {
    const fixture = makeSecretFixture();
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
    });
    const log = createLogger();
    log
      .child({
        attributes: {
          password: fixture.password,
          authorization: fixture.authorization,
        },
      })
      .info('via-child');
    log
      .withContext({
        attributes: {
          api_key: fixture.apiKey,
          secret: fixture.secret,
        },
      })
      .info('via-withContext');
    const a = capture.calls[0]!;
    const b = capture.calls[1]!;
    expect(a.context.attributes?.password).toBe('[REDACTED]');
    expect(a.context.attributes?.authorization).toBe('[REDACTED]');
    expect(b.context.attributes?.api_key).toBe('[REDACTED]');
    expect(b.context.attributes?.secret).toBe('[REDACTED]');
    expect(findLeaks(a)).toEqual([]);
    expect(findLeaks(b)).toEqual([]);
  });

  it('makeSecretFixture() values returned from correlation() are masked at the transport', () => {
    const fixture = makeSecretFixture();
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      correlation: () => ({
        attributes: {
          password: fixture.password,
          session_id: fixture.sessionId,
          extra_jwt: fixture.jwt,
        },
      }),
    });
    createLogger().info('e');
    const event = capture.calls[0]!;
    expect(event.context.attributes?.password).toBe('[REDACTED]');
    expect(event.context.attributes?.session_id).toBe('[REDACTED]');
    expect(event.context.attributes?.extra_jwt).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });

  it('a single event with secrets at EVERY context entry point leaks nothing', () => {
    const fixture = makeSecretFixture();
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      context: { attributes: { password: fixture.password } },
      correlation: () => ({
        attributes: { token: fixture.token },
      }),
    });
    const log = createLogger({
      context: { attributes: { api_key: fixture.apiKey } },
    });
    const derived = log.child({
      attributes: { session_id: fixture.sessionId },
    });
    derived.info('all-entry-points');
    const event = capture.calls[0]!;
    expect(event.context.attributes?.password).toBe('[REDACTED]');
    expect(event.context.attributes?.api_key).toBe('[REDACTED]');
    expect(event.context.attributes?.session_id).toBe('[REDACTED]');
    expect(event.context.attributes?.token).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// C. US4 does not regress US3: sanitizer + redactor still apply
// ---------------------------------------------------------------------------

describe('US4 cannot regress US3: pipeline still enforces sanitization + redaction on context', () => {
  it('a JWT in correlation() is masked even though correlation has highest precedence in the merge order', () => {
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      // Root context has a safe value; correlation overrides with a JWT.
      context: { attributes: { token: 'safe-root-value' } },
      correlation: () => ({
        attributes: {
          token: 'eyJhbGciOi.payloadabc123.signaturedef456-LONG',
        },
      }),
    });
    createLogger().info('e');
    // The redactor key rule for `token` masks the merged final value
    // (correlation override → JWT shape → token key denied) regardless
    // of which layer contributed it.
    expect(capture.calls[0]!.context.attributes?.token).toBe('[REDACTED]');
  });

  it('an oversized cyclic object in correlation() does not crash the pipeline', () => {
    const cyclic: Record<string, unknown> = { tag: 'corr' };
    cyclic.self = cyclic;
    for (let i = 0; i < 50; i++) cyclic[`k${String(i)}`] = `v-${String(i)}`;
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      correlation: () => ({
        attributes: { c: cyclic as never },
      }),
    });
    expect(() => createLogger().info('e')).not.toThrow();
    expect(capture.calls).toHaveLength(1);
  });
});
