/**
 * Contract test: global-listener boundary — the G1-filed remediation.
 * (specs/013-global-error-capture — FR-013 / SC-007; constitution Principle X;
 * Feature 014 / G1 deadline 2026-09-01.)
 *
 * Enforces Principle VIII v1.5.0's host-only boundary:
 *   1. Creating a logger / configuring logging attaches NO global
 *      `error` / `unhandledrejection` listeners (capture is never a
 *      `createLogger` side effect).
 *   2. ONLY `src/capture/**` may reference `addEventListener('error' |
 *      'unhandledrejection')` or `window.onerror` / `onunhandledrejection`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureLogging, createLogger } from '../../src/index.js';

const SRC_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
);
const CAPTURE_PREFIX = join('capture', '');

/** Global error/rejection listener registrations and `onerror`-style patches. */
const GLOBAL_ERROR_LISTENER_RE =
  /addEventListener\s*\(\s*['"](?:error|unhandledrejection)['"]/g;
const GLOBAL_ERROR_HANDLER_RE = /\bon(?:error|unhandledrejection)\s*=/g;

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('global-listener boundary (G1 remediation)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('SC-007: configureLogging + createLogger attach no global error/rejection listeners', () => {
    const spy = vi.spyOn(globalThis, 'addEventListener');
    configureLogging({
      application: { name: 'host' },
      environment: 'production',
    });
    createLogger({ module: { name: 'm' } });
    createLogger();

    const errorListeners = spy.mock.calls
      .map((c) => String(c[0]))
      .filter((t) => t === 'error' || t === 'unhandledrejection');
    expect(errorListeners).toEqual([]);
  });

  it('only src/capture/** references global error listeners / onerror patches', () => {
    const offenders: string[] = [];
    for (const file of tsFiles(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file);
      if (rel.startsWith(CAPTURE_PREFIX)) continue; // capture is the sanctioned home
      const text = readFileSync(file, 'utf8');
      if (
        GLOBAL_ERROR_LISTENER_RE.test(text) ||
        GLOBAL_ERROR_HANDLER_RE.test(text)
      ) {
        offenders.push(rel.split(sep).join('/'));
      }
    }
    expect(offenders).toEqual([]);
  });
});
