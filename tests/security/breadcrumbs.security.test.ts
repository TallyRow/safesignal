/**
 * Security test: breadcrumbs carry only post-redaction data (whole-value
 * guarantee) and never nest (specs/016-error-breadcrumbs — BC-7, BC-8, SC-004).
 *
 * The redactor masks WHOLE-value secrets (an entire attribute value / cause
 * message) — these tests assert that guarantee, not substring-in-free-text.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureLogging, createLogger } from '../../src/index.js';
import { FIXTURE_VALUES, makeSecretFixture } from '../../src/testing/index.js';
import {
  type CapturingTransport,
  makeCapturingTransport,
} from '../helpers/failing-transport.js';

let cap: CapturingTransport;

function lastError() {
  const errs = cap.calls.filter((e) => e.level === 'error');
  return errs[errs.length - 1]!;
}

/** Every fixture secret value must be absent from a JSON serialization. */
function assertNoSecret(serialized: string): void {
  for (const secret of FIXTURE_VALUES) {
    expect(serialized.includes(secret)).toBe(false);
  }
}

beforeEach(() => {
  cap = makeCapturingTransport();
  configureLogging({
    environment: 'test',
    level: 'debug',
    transports: [cap],
    breadcrumbs: true, // default redactor applies (whole-value masking)
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('breadcrumbs security (BC-7)', () => {
  it('a whole-value secret in attributes is masked in the trail', () => {
    const fixture = makeSecretFixture();
    const log = createLogger();
    log.info('with secret', { payload: fixture.jwt }); // whole JWT value → masked
    log.error('boom');

    const trail = JSON.stringify(
      lastError().attributes['safesignal.breadcrumbs'],
    );
    assertNoSecret(trail);
    expect(trail).toContain('[REDACTED]');
  });

  it('a whole-value secret in a cause message is masked in errorCauses', () => {
    const fixture = makeSecretFixture();
    createLogger().error(
      'failed',
      {},
      new Error('top', { cause: new Error(fixture.jwt) }),
    );
    const causes = JSON.stringify(
      lastError().attributes['safesignal.errorCauses'],
    );
    assertNoSecret(causes);
    expect(causes).toContain('[REDACTED]');
  });

  it('the rendered error event as a whole contains no unredacted fixture secret', () => {
    const fixture = makeSecretFixture();
    const log = createLogger();
    log.info('a', { token: fixture.jwt });
    log.warn('b', { authData: fixture.bearerToken });
    log.error('boom', { sessionPayload: fixture.jwt });
    assertNoSecret(JSON.stringify(lastError()));
  });
});
