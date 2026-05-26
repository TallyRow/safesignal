/**
 * Contract test: public API surface (PA-1..PA-9 from
 * `contracts/public-api.md`).
 *
 * PA-5 and PA-6 (`.d.ts` does not mention OTel / forbidden names) are
 * already locked by `tests/contract/declarations-surface.test.ts` and
 * `tests/contract/internal-import-boundary.test.ts`. PA-7 is a
 * type-level assertion enforced by `// @ts-expect-error`; this file
 * still typechecks only if the types reject the bad calls. The
 * remaining PA-* items are runtime checks against `src/index.ts` and
 * the `./testing` subpath.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import * as root from '../../src/index.js';
import * as testingEntry from '../../src/testing/index.js';
import {
  type CapturingTransport,
  makeCapturingTransport,
} from '../helpers/failing-transport.js';

const ROOT_RUNTIME_EXPORTS = [
  'createLogger',
  'configureLogging',
  'getRootLogger',
  'createRedactor',
  'scrubUrl',
  'ConsoleTransport',
  'NoopTransport',
] as const;

const LOGGER_METHODS = [
  'debug',
  'info',
  'warn',
  'error',
  'child',
  'withContext',
] as const;

describe('public API contract (PA-1..PA-9)', () => {
  let capturing: CapturingTransport;

  beforeEach(() => {
    capturing = makeCapturingTransport();
    root.configureLogging({
      environment: 'development',
      transports: [capturing],
    });
  });

  describe('PA-1: root entry exports every documented runtime value', () => {
    for (const name of ROOT_RUNTIME_EXPORTS) {
      it(`exports ${name}`, () => {
        const value = (root as unknown as Record<string, unknown>)[name];
        expect(
          value,
          `'${name}' is missing from src/index.ts`,
        ).toBeDefined();
      });
    }
  });

  describe('PA-2: every exported function is callable per the documented signature', () => {
    // Note: we check behavior (callable with optional args omitted), not
    // `Function.length`, because TypeScript `?` annotations do not affect
    // the runtime `Function.length` value (only default-valued params do).
    it('createLogger is callable with no arguments', () => {
      expect(() => root.createLogger()).not.toThrow();
    });
    it('configureLogging requires a config argument and runs without throwing', () => {
      expect(() => root.configureLogging({})).not.toThrow();
    });
    it('getRootLogger is callable with no arguments and returns a Logger', () => {
      const r = root.getRootLogger();
      expect(r).toBeDefined();
      expect(r.info).toBeTypeOf('function');
    });
    it('createRedactor is callable with no arguments and returns a function', () => {
      const r = root.createRedactor();
      expect(r).toBeTypeOf('function');
    });
    it('scrubUrl is callable with a url alone (options is optional) and returns a string', () => {
      const r = root.scrubUrl('https://example.com/path?a=1');
      expect(typeof r).toBe('string');
    });
    it('ConsoleTransport is a factory function returning a Transport', () => {
      const t = root.ConsoleTransport();
      expect(t.name).toBeTypeOf('string');
      expect(t.send).toBeTypeOf('function');
    });
    it('NoopTransport is a factory function returning a Transport', () => {
      const t = root.NoopTransport();
      expect(t.name).toBeTypeOf('string');
      expect(t.send).toBeTypeOf('function');
    });
  });

  describe('PA-3: Logger instances have all six methods', () => {
    it('createLogger() returns a Logger with debug/info/warn/error/child/withContext', () => {
      const logger = root.createLogger();
      for (const method of LOGGER_METHODS) {
        expect(
          (logger as unknown as Record<string, unknown>)[method],
          `Logger is missing method '${method}'`,
        ).toBeTypeOf('function');
      }
    });
    it('getRootLogger() returns a Logger with the same shape', () => {
      const logger = root.getRootLogger();
      for (const method of LOGGER_METHODS) {
        expect(
          (logger as unknown as Record<string, unknown>)[method],
          `root Logger is missing method '${method}'`,
        ).toBeTypeOf('function');
      }
    });
  });

  describe('PA-4: ConsoleTransport and NoopTransport return Transport-shaped objects', () => {
    it('ConsoleTransport() returns { name, send }', () => {
      const t = root.ConsoleTransport();
      expect(t.name).toBe('console');
      expect(t.send).toBeTypeOf('function');
    });
    it('NoopTransport() returns { name: "noop", send }', () => {
      const t = root.NoopTransport();
      expect(t.name).toBe('noop');
      expect(t.send).toBeTypeOf('function');
    });
  });

  describe('PA-5/PA-6: covered by declarations-surface and internal-import-boundary tests', () => {
    it('intentionally deferred', () => {
      // declarations-surface.test.ts asserts no opentelemetry / OTel names.
      // internal-import-boundary.test.ts asserts no internal re-exports.
      expect(true).toBe(true);
    });
  });

  describe('PA-7: message must be a string at the type level', () => {
    it('TypeScript rejects non-string message arguments', () => {
      const logger = root.createLogger();
      // @ts-expect-error — message must be string, not object
      logger.info({ foo: 'bar' });
      // @ts-expect-error — message must be string, not number
      logger.debug(42);
      // @ts-expect-error — message must be string, not null
      logger.warn(null);
      // @ts-expect-error — message must be string, not undefined
      logger.error(undefined);
      // Runtime placeholder — the assertion above is at typecheck time.
      expect(true).toBe(true);
    });
  });

  describe('PA-8: logger.error reduces unknown to ErrorInfo before transport sees it', () => {
    it('passing an Error yields event.error with name/message/stack', () => {
      const logger = root.createLogger();
      const err = new TypeError('boom');
      logger.error('oops', {}, err);
      const event = capturing.calls.at(-1);
      expect(event).toBeDefined();
      expect(event?.error).toBeDefined();
      expect(event?.error?.name).toBe('TypeError');
      expect(event?.error?.message).toBe('boom');
      expect(typeof event?.error?.stack === 'string' || event?.error?.stack === undefined).toBe(true);
      // The raw Error is NOT attached.
      expect(event?.error).not.toBeInstanceOf(Error);
    });
    it('passing a non-Error value yields a NonError ErrorInfo', () => {
      const logger = root.createLogger();
      logger.error('oops', {}, 'just a string');
      const event = capturing.calls.at(-1);
      expect(event?.error?.name).toBe('NonError');
      expect(event?.error?.message).toBe('just a string');
    });
    it('omitting the error arg leaves event.error undefined', () => {
      const logger = root.createLogger();
      logger.error('oops without error');
      const event = capturing.calls.at(-1);
      expect(event?.error).toBeUndefined();
    });
  });

  describe('Negative API shape (T020): no raw-payload APIs on Logger', () => {
    // These `// @ts-expect-error` blocks fail to typecheck if someone adds
    // `dump`, `raw`, `log`, or unsupported level names to the Logger
    // interface — preventing the "easy unsafe path" the constitution and
    // plan explicitly prohibit. We REFERENCE each forbidden property
    // (without invoking it) so TypeScript still errors but the runtime
    // doesn't throw.
    it('Logger has no `dump` method (type-level + runtime)', () => {
      const logger = root.createLogger();
      // @ts-expect-error — `dump` is intentionally not part of the API
      void logger.dump;
      expect((logger as unknown as Record<string, unknown>).dump).toBeUndefined();
    });
    it('Logger has no `raw` method (type-level + runtime)', () => {
      const logger = root.createLogger();
      // @ts-expect-error — `raw` is intentionally not part of the API
      void logger.raw;
      expect((logger as unknown as Record<string, unknown>).raw).toBeUndefined();
    });
    it('Logger has no `log` method (type-level + runtime)', () => {
      const logger = root.createLogger();
      // @ts-expect-error — `log` is intentionally not part of the API
      void logger.log;
      expect((logger as unknown as Record<string, unknown>).log).toBeUndefined();
    });
    it('Logger has no `trace`, `fatal`, `verbose`, or other unsupported levels', () => {
      const logger = root.createLogger();
      // @ts-expect-error — trace is not a supported level
      void logger.trace;
      // @ts-expect-error — fatal is not a supported level
      void logger.fatal;
      // @ts-expect-error — verbose is not a supported level
      void logger.verbose;
      const record = logger as unknown as Record<string, unknown>;
      expect(record.trace).toBeUndefined();
      expect(record.fatal).toBeUndefined();
      expect(record.verbose).toBeUndefined();
    });
    it('Logger exposes ONLY the six documented methods', () => {
      const logger = root.createLogger();
      const keys = Object.keys(logger).sort();
      expect(keys).toEqual([
        'child',
        'debug',
        'error',
        'info',
        'warn',
        'withContext',
      ]);
    });
  });

  describe('PA-9: /testing helpers are not reachable through the root entry', () => {
    it('the root entry does NOT export assertTransportContract or makeSecretFixture', () => {
      const rootKeys = Object.keys(root);
      expect(rootKeys).not.toContain('assertTransportContract');
      expect(rootKeys).not.toContain('makeSecretFixture');
    });
    it('the testing entry is a separate module', () => {
      // T025 will populate src/testing/index.ts. Today it is intentionally
      // empty (export {}). The test still asserts the subpath is reachable
      // and structurally distinct from the runtime entry.
      expect(testingEntry).not.toBe(root);
      expect(typeof testingEntry).toBe('object');
    });
  });
});
