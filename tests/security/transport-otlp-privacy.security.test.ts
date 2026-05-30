/**
 * T028 [US3] — Privacy/security test for the OTLP transport (TO-6 / FR-009).
 *
 * Configured auth headers reach the backend on the wire only — never in
 * the request body, any LogRecord, any diagnostic/error message, or the
 * published bundle.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { LogEvent } from '../../src/api/types.js';
import { createOtlpTransport } from '../../src/transport-otlp/index.js';
import { installFetchDouble } from '../helpers/beacon-network.js';

const ENDPOINT = 'https://otlp.example.com/v1/logs';
const SECRET = 'sk-live-PRIVACY-FIXTURE-9f8e7d6c5b4a';

function event(overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    timestamp: '2024-05-29T00:00:00.000Z',
    level: 'warn',
    message: 'm',
    attributes: { user: 'u1' },
    context: { application: { name: 'svc' } },
    ...overrides,
  };
}

let fetchDouble: ReturnType<typeof installFetchDouble> | null = null;

afterEach(() => {
  fetchDouble?.uninstall();
  fetchDouble = null;
});

describe('auth header isolation', () => {
  it('sends the secret as a request header only — not in the body or records', async () => {
    fetchDouble = installFetchDouble({
      behavior: { kind: 'resolve', status: 200 },
    });
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      headers: { 'x-api-key': SECRET },
      batching: { maxBatchSize: 1 },
    });
    t.send(event());
    await t.flush!();

    const call = fetchDouble!.calls[0]!;
    const headers = call.init?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(SECRET); // present on the wire
    expect(call.body ?? '').not.toContain(SECRET); // absent from body/records
  });

  it('keeps the secret out of diagnostic notices on failure', async () => {
    fetchDouble = installFetchDouble({
      behavior: { kind: 'resolve', status: 401 },
    });
    const notices: Error[] = [];
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      headers: { authorization: `Bearer ${SECRET}` },
      batching: { maxBatchSize: 1 },
      onInternalError: (e) => notices.push(e),
    });
    t.send(event());
    await t.flush!();
    expect(notices.length).toBeGreaterThan(0);
    for (const n of notices) {
      expect(n.message).not.toContain(SECRET);
      expect(JSON.stringify(n)).not.toContain(SECRET);
    }
  });
});

describe('bundle has no hard-coded credential or default endpoint', () => {
  const OTLP_MJS = resolve(process.cwd(), 'dist/transport-otlp.mjs');

  beforeAll(() => {
    if (!existsSync(OTLP_MJS)) {
      throw new Error(`dist/transport-otlp.mjs missing — run 'npm run build'.`);
    }
  });

  it('contains no obvious credential/token/default-endpoint literal', () => {
    const src = readFileSync(OTLP_MJS, 'utf8');
    expect(src).not.toContain(SECRET);
    // No baked-in backend endpoint or bearer/api-key literal.
    expect(src.toLowerCase()).not.toMatch(/bearer\s+[a-z0-9]/i);
    expect(src).not.toMatch(
      /https?:\/\/[a-z0-9.-]*(datadog|honeycomb|grafana)/i,
    );
  });
});
