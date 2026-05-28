/**
 * T009 — Public-API contract test scaffolding for the
 * `./transport-beacon` subpath.
 *
 * Locks TB-1..TB-12 from
 * `specs/002-beacon-transport/contracts/transport-beacon-public-api.md`.
 *
 * At this checkpoint (T009 landing on top of T003's throwing stub):
 *   - TB-1 (exactly 2 exports), TB-2 (default-entry unchanged), and
 *     TB-12 (exports map shape) are real assertions that PASS now.
 *   - TB-3, TB-7 (default-config), TB-8, TB-9, TB-10 (partial) are
 *     marked `it.todo` — they unlock as T015/T016 wire the
 *     implementation.
 *   - TB-7 (batching-config variant) is `it.skip` until US3 (T026
 *     unskips).
 *
 * Other contract assertions live elsewhere by design:
 *   - TB-4 (construction side-effect-free) → `tests/performance/`
 *     T014.
 *   - TB-5, TB-6 (endpoint + options validation) →
 *     `tests/unit/transport-beacon/endpoint-validation.test.ts`
 *     T010.
 *   - TB-11 (bundle-shape) → `tests/security/transport-beacon-
 *     bundle-shape.security.test.ts` T008.
 *
 * No imports from `src/internal/**`. The test resolves
 * `createBeaconTransport` via the package's published subpath the
 * same way consumers will: `import * as TB from
 * '@your-org/frontend-logging-sdk/transport-beacon'`. happy-dom
 * resolves the subpath through `package.json`'s `exports` map.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as TB from '@your-org/frontend-logging-sdk/transport-beacon';
import * as Pkg from '@your-org/frontend-logging-sdk';
import { assertTransportContract } from '@your-org/frontend-logging-sdk/testing';
import {
  installFetchDouble,
  installSendBeaconDouble,
} from '../helpers/beacon-network.js';

const PACKAGE_JSON_PATH = resolve(process.cwd(), 'package.json');

interface PackageJson {
  exports?: Record<string, Record<string, string>>;
  dependencies?: Record<string, string>;
}

function loadPackageJson(): PackageJson {
  return JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as PackageJson;
}

// ---------------------------------------------------------------------------
// TB-1: The subpath exports exactly one factory and one options type
// ---------------------------------------------------------------------------

describe('TB-1 — subpath public surface', () => {
  it('exports exactly 2 names — `createBeaconTransport` (runtime) and `BeaconTransportOptions` (type-only)', () => {
    // Type-only exports (interfaces) erase at runtime, so `Object.keys`
    // only sees the runtime function. The full set of TypeScript-visible
    // names is exactly { createBeaconTransport, BeaconTransportOptions }
    // — verified separately by a tsc-side reflection (the imports above
    // would fail to compile if either name were absent).
    expect(Object.keys(TB).sort()).toEqual(['createBeaconTransport']);
  });

  it('`createBeaconTransport` is a function', () => {
    expect(typeof TB.createBeaconTransport).toBe('function');
  });

  it('the subpath does not have a `default` export', () => {
    expect((TB as unknown as { default?: unknown }).default).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TB-2: The default entry is unchanged
// ---------------------------------------------------------------------------

describe('TB-2 — default-entry surface bit-identical to v1', () => {
  it('exports exactly the v1 set of names', () => {
    const expected = [
      // Runtime exports (functions and values)
      'ConsoleTransport',
      'NoopTransport',
      'configureLogging',
      'createLogger',
      'createRedactor',
      'getRootLogger',
      'scrubUrl',
    ].sort();
    expect(Object.keys(Pkg).sort()).toEqual(expected);
  });

  it('does NOT re-export `createBeaconTransport`', () => {
    expect((Pkg as unknown as { createBeaconTransport?: unknown }).createBeaconTransport).toBeUndefined();
  });

  it('does NOT re-export `BeaconTransportOptions` as a runtime symbol', () => {
    expect(
      (Pkg as unknown as { BeaconTransportOptions?: unknown }).BeaconTransportOptions,
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TB-3: The factory returns a `Transport`
// ---------------------------------------------------------------------------

describe('TB-3 — returned transport shape', () => {
  it.todo(
    'returns a Transport-shaped object with name, send, flush, shutdown (unlocks at T016)',
  );
  it.todo('the returned value is a plain object (prototype === Object.prototype) (unlocks at T016)');
});

// ---------------------------------------------------------------------------
// TB-7: assertTransportContract passes (default + batching)
// ---------------------------------------------------------------------------

describe('TB-7 — assertTransportContract battery', () => {
  // T015 lands the full assertion body. The .skip annotation lifts at T016
  // when createBeaconTransport stops throwing on construction.
  it.skip('default-mode transport passes the full T-1..T-9 + T-S1..T-S5 battery (unskips at T016)', async () => {
    const transport = TB.createBeaconTransport({
      endpoint: 'https://logs.example.com/ingest',
    });
    await assertTransportContract(transport);
  });
  it.skip('batching-mode transport passes the full T-1..T-9 + T-S1..T-S5 battery (unskips at T026)', async () => {
    // T026 will remove the .skip and run assertTransportContract against a
    // batching-configured instance.
    const transport = TB.createBeaconTransport({
      endpoint: 'https://logs.example.com/ingest',
      batching: { maxBatchSize: 10 },
    });
    await assertTransportContract(transport);
  });
});

// ---------------------------------------------------------------------------
// TB-8: name defaulting and override
// ---------------------------------------------------------------------------

describe('TB-8 — Transport.name field', () => {
  it.todo('defaults to "beacon" when options.name is omitted (unlocks at T016)');
  it.todo('overrides via options.name (unlocks at T016)');
});

// ---------------------------------------------------------------------------
// TB-9: Multi-instance independence
// ---------------------------------------------------------------------------

describe('TB-9 — multi-instance independence', () => {
  it.todo('two instances installed against different endpoints install independent listeners (unlocks at T016)');
  it.todo('a drop notice on one instance does not affect the other instance’s rate-limit (unlocks at T016)');
});

// ---------------------------------------------------------------------------
// TB-10: Synchronous construction + synchronous `send`
// ---------------------------------------------------------------------------

describe('TB-10 — synchronous factory and synchronous send', () => {
  it('factory does not return a Promise (synchronous construction)', () => {
    // The factory MUST be a normal function returning a Transport-shaped
    // object synchronously — never a Promise. An async-returning factory
    // would change the call-site signature in a breaking way.
    const result = TB.createBeaconTransport({
      endpoint: 'https://logs.example.com/ingest',
    });
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
    // Confirm the factory's `.constructor.name` is the normal 'Function',
    // not 'AsyncFunction'. (Type-only check would suffice but a runtime
    // check guards against an accidental refactor.)
    expect(TB.createBeaconTransport.constructor.name).toBe('Function');
  });
  describe('returned send() method', () => {
    let beaconCtrl: ReturnType<typeof installSendBeaconDouble> | null = null;
    let fetchCtrl: ReturnType<typeof installFetchDouble> | null = null;

    beforeEach(() => {
      // Hermetic: prevent the real-network fetch fallback that would
      // otherwise hit https://logs.example.com from a test environment.
      beaconCtrl = installSendBeaconDouble({ returnValue: true });
      fetchCtrl = installFetchDouble({ behavior: { kind: 'resolve', status: 204 } });
    });
    afterEach(() => {
      beaconCtrl?.uninstall();
      fetchCtrl?.uninstall();
      beaconCtrl = null;
      fetchCtrl = null;
    });

    it('returns void synchronously (no Promise)', () => {
      const transport = TB.createBeaconTransport({
        endpoint: 'https://logs.example.com/ingest',
      });
      const sendResult = transport.send({
        timestamp: '2026-05-27T00:00:00.000Z',
        level: 'warn',
        message: 'sync send check',
        attributes: {},
        context: {},
      });
      expect(sendResult).toBeUndefined();
      // shutdown() in default mode is a Promise-returning idempotent.
      // send() must not be — locked by D-1.
      expect(transport.send.constructor.name).toBe('Function');
    });
  });
});

// ---------------------------------------------------------------------------
// TB-12: exports map gains exactly one new entry; no new deps
// ---------------------------------------------------------------------------

describe('TB-12 — package.json exports + dependency hygiene', () => {
  it('exports map has exactly { ".", "./testing", "./transport-beacon" }', () => {
    const pkg = loadPackageJson();
    const keys = Object.keys(pkg.exports ?? {}).sort();
    expect(keys).toEqual(['.', './testing', './transport-beacon']);
  });

  it('the `./transport-beacon` entry has types/import/require triple', () => {
    const pkg = loadPackageJson();
    const entry = pkg.exports?.['./transport-beacon'];
    expect(entry).toEqual({
      types: './dist/transport-beacon.d.ts',
      import: './dist/transport-beacon.mjs',
      require: './dist/transport-beacon.cjs',
    });
  });

  it('package.json `dependencies` remains empty (no new runtime deps)', () => {
    const pkg = loadPackageJson();
    expect(pkg.dependencies ?? {}).toEqual({});
  });
});
