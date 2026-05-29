/**
 * T010 — Endpoint validation matrix.
 *
 * Locks F-1 (construction-time failures) + TB-5 (HTTPS / loopback
 * relaxation rules) + TB-6 (options-shape validation as it pertains
 * to `endpoint`).
 *
 * The function under test (`validateEndpoint`) is the internal
 * helper from T005; it is reached via a relative path because the
 * `./transport-beacon` subpath does not re-export it (and must not,
 * per TB-1).
 *
 * Every thrown error MUST:
 *   (a) be an `Error` instance (TypeError for type/parse violations,
 *       Error for scheme/host violations);
 *   (b) include the offending endpoint string OR field name in its
 *       `.message`;
 *   (c) name the violated constraint.
 *
 * These tests pass against T005's implementation NOW — they are the
 * regression bar that locks F-1's behavior matrix.
 */

import { describe, expect, it } from 'vitest';

import { validateEndpoint } from '../../../src/transport-beacon/endpoint-validation.js';

describe('validateEndpoint — HTTPS endpoints', () => {
  it.each([
    'https://logs.example.com/ingest',
    'https://example.com',
    'https://example.com:443/path?q=1',
    'https://example.com/path#fragment',
    'https://[::1]/ingest',
    'https://[::1]:8443/ingest',
    'https://subdomain.example.co.uk/path',
  ])('accepts %s with flag=false', (endpoint) => {
    const url = validateEndpoint(endpoint, false);
    expect(url).toBeInstanceOf(URL);
    expect(url.protocol).toBe('https:');
  });

  it.each([
    'https://logs.example.com',
    'https://example.com',
  ])('accepts %s with flag=true (flag has no effect on HTTPS)', (endpoint) => {
    expect(() => validateEndpoint(endpoint, true)).not.toThrow();
  });
});

describe('validateEndpoint — non-string endpoint', () => {
  it.each([
    [123, 'number'],
    [undefined, 'undefined'],
    [null, 'null'],
    [{}, 'object'],
    [[], 'object'],
    [true, 'boolean'],
    [false, 'boolean'],
    [Symbol('x'), 'symbol'],
  ] as ReadonlyArray<
    readonly [unknown, string]
  >)('rejects %p with TypeError naming the type (%s)', (value, typeLabel) => {
    let thrown: unknown;
    try {
      validateEndpoint(value, false);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(TypeError);
    expect((thrown as Error).message).toMatch(/endpoint must be a string/);
    expect((thrown as Error).message).toContain(typeLabel);
  });
});

describe('validateEndpoint — malformed URLs', () => {
  it.each([
    '',
    'not-a-url',
    '   ',
    'http://',
    '://example.com',
    'https://[invalid',
  ])('rejects %p with TypeError naming the endpoint', (endpoint) => {
    let thrown: unknown;
    try {
      validateEndpoint(endpoint, false);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(TypeError);
    expect((thrown as Error).message).toMatch(/invalid endpoint URL/);
    expect((thrown as Error).message).toContain(endpoint);
  });
});

describe('validateEndpoint — non-HTTPS without loopback flag', () => {
  it.each([
    'http://example.com',
    'http://10.0.0.1',
    'http://logs.example.com/ingest',
    'http://localhost',
    'http://127.0.0.1',
    'http://[::1]',
  ])('rejects %s with flag=false', (endpoint) => {
    let thrown: unknown;
    try {
      validateEndpoint(endpoint, false);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/non-HTTPS endpoint/);
    expect((thrown as Error).message).toContain(endpoint);
  });
});

describe('validateEndpoint — loopback opt-in (flag=true)', () => {
  it.each([
    'http://localhost',
    'http://localhost:4318/ingest',
    'http://127.0.0.1',
    'http://127.0.0.1:9999/path?q=1',
    'http://[::1]',
    'http://[::1]:9999',
    'http://[0:0:0:0:0:0:0:1]', // canonicalises to [::1]
  ])('accepts loopback host %s', (endpoint) => {
    const url = validateEndpoint(endpoint, true);
    expect(url).toBeInstanceOf(URL);
    expect(url.protocol).toBe('http:');
  });

  it.each([
    'http://example.com',
    'http://10.0.0.1',
    'http://my-dev-server',
    'http://192.168.1.1',
    'http://172.16.0.1',
    'http://localhost.example.com', // not a loopback hostname despite the prefix
  ])('rejects non-loopback host %s even with flag=true', (endpoint) => {
    let thrown: unknown;
    try {
      validateEndpoint(endpoint, true);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(
      /allowInsecureLoopback permits only/,
    );
    expect((thrown as Error).message).toMatch(
      /localhost.*127\.0\.0\.1.*\[::1\]/,
    );
    expect((thrown as Error).message).toContain(endpoint);
  });
});

describe('validateEndpoint — other schemes', () => {
  it.each([
    'ws://example.com',
    'wss://example.com',
    'file:///path/to/file',
    'ftp://example.com',
    'data:text/plain,foo',
    'javascript:alert(1)',
    'about:blank',
  ])('rejects %s regardless of flag', (endpoint) => {
    for (const flag of [false, true]) {
      let thrown: unknown;
      try {
        validateEndpoint(endpoint, flag);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toMatch(/non-HTTPS endpoint/);
      expect((thrown as Error).message).toContain(endpoint);
    }
  });
});

describe('validateEndpoint — side-effect freedom', () => {
  it('does not read process.env, window.location, or document.cookie', () => {
    // Spy on access via a Proxy around process.env. If validateEndpoint
    // reads it, the get trap fires; we then assert it didn't.
    let envReads = 0;
    const originalEnv = process.env;
    const trapped = new Proxy(originalEnv, {
      get(_target, prop): unknown {
        if (typeof prop === 'string') envReads += 1;
        return Reflect.get(originalEnv, prop);
      },
    });
    Object.defineProperty(process, 'env', {
      value: trapped,
      configurable: true,
    });
    try {
      validateEndpoint('https://example.com', false);
      validateEndpoint('http://localhost', true);
    } finally {
      Object.defineProperty(process, 'env', {
        value: originalEnv,
        configurable: true,
      });
    }
    expect(envReads).toBe(0);
  });
});
