/**
 * T006 — Unit tests for `src/transport-otlp/endpoint-validation.ts`.
 *
 * Locks TO-5 (research D8): HTTPS always passes; http:// only for
 * loopback under `allowInsecureLoopback`; everything else throws at
 * construction time.
 */

import { describe, expect, it } from 'vitest';

import { validateEndpoint } from '../../../src/transport-otlp/endpoint-validation.js';

describe('validateEndpoint', () => {
  it('accepts an HTTPS endpoint regardless of the loopback flag', () => {
    const url = validateEndpoint('https://otlp.example.com/v1/logs', false);
    expect(url).toBeInstanceOf(URL);
    expect(url.protocol).toBe('https:');
  });

  it('accepts http:// loopback hosts when allowInsecureLoopback is true', () => {
    for (const ep of [
      'http://localhost:4318/v1/logs',
      'http://127.0.0.1:4318/v1/logs',
      'http://[::1]:4318/v1/logs',
    ]) {
      expect(validateEndpoint(ep, true)).toBeInstanceOf(URL);
    }
  });

  it('rejects http:// loopback when allowInsecureLoopback is false', () => {
    expect(() =>
      validateEndpoint('http://localhost:4318/v1/logs', false),
    ).toThrow(/non-HTTPS/);
  });

  it('rejects http:// non-loopback even with allowInsecureLoopback true', () => {
    expect(() =>
      validateEndpoint('http://otlp.example.com/v1/logs', true),
    ).toThrow(/allowInsecureLoopback permits only/);
  });

  it('rejects non-http(s) schemes', () => {
    expect(() => validateEndpoint('ftp://example.com/logs', true)).toThrow(
      /not permitted/,
    );
  });

  it('rejects a non-string endpoint', () => {
    expect(() => validateEndpoint(42 as unknown, false)).toThrow(
      /endpoint must be a string/,
    );
    expect(() => validateEndpoint(null as unknown, false)).toThrow(
      /endpoint must be a string/,
    );
  });

  it('rejects a malformed URL string', () => {
    expect(() => validateEndpoint('not a url', false)).toThrow(
      /invalid endpoint URL/,
    );
  });
});
