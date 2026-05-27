/**
 * Over-redaction security test (T045).
 *
 * Locks R-3 from `contracts/redaction.md`: safe values containing
 * denylist substrings in non-key positions are NOT mangled. The
 * redactor matches by KEY name (case-insensitive, full-name) and by
 * VALUE SHAPE (anchored Bearer / JWT patterns) — never by arbitrary
 * substring inside non-key values.
 *
 * Mitigates the risk that the package would erode debuggability by
 * masking legitimate fields just because their values mention
 * sensitive-keyword tokens in normal prose.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { configureLogging, createLogger } from '../../src/index.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const APP = { name: 'over-redaction', version: '1.0.0' };

let capture = makeCapturingTransport('capture');

beforeEach(() => {
  capture = makeCapturingTransport('capture');
  configureLogging({
    application: APP,
    environment: 'development',
    level: 'debug',
    transports: [capture],
  });
});

describe('R-3: substring matches in non-key positions are NOT mangled', () => {
  it('keeps a product description containing "tokenizer" untouched', () => {
    const log = createLogger();
    log.info('product', { product: 'tokenizer is great' });
    expect(capture.calls[0]!.attributes.product).toBe('tokenizer is great');
  });

  it('keeps a help text containing the word "authorization"', () => {
    const log = createLogger();
    log.info('help', {
      description: 'authorization is required to view this page',
    });
    expect(capture.calls[0]!.attributes.description).toBe(
      'authorization is required to view this page',
    );
  });

  it('keeps documentation text containing the word "password"', () => {
    const log = createLogger();
    log.info('doc', {
      hint: 'the user must enter a password to continue',
      label: 'password reset link',
    });
    expect(capture.calls[0]!.attributes.hint).toBe(
      'the user must enter a password to continue',
    );
    expect(capture.calls[0]!.attributes.label).toBe('password reset link');
  });

  it('keeps a "Bearer" value mid-string (not at the anchor)', () => {
    const log = createLogger();
    log.info('note', { note: 'visit Bearer abc123 then come back' });
    expect(capture.calls[0]!.attributes.note).toBe(
      'visit Bearer abc123 then come back',
    );
  });

  it('keeps a JWT-like substring inside a sentence', () => {
    // Sentence contains a JWT-looking prefix but is not entirely a JWT,
    // so the anchored shape rule does NOT match.
    const log = createLogger();
    log.info('note', {
      note: 'the JWT prefix eyJ usually identifies a base64 header',
    });
    expect(capture.calls[0]!.attributes.note).toBe(
      'the JWT prefix eyJ usually identifies a base64 header',
    );
  });
});

describe('R-3: key names that merely CONTAIN denylist words are NOT denied', () => {
  it('does not deny the key "tokenizer" (different name from "token")', () => {
    const log = createLogger();
    log.info('product', { tokenizer: 'this value should NOT be masked' });
    expect(capture.calls[0]!.attributes.tokenizer).toBe(
      'this value should NOT be masked',
    );
  });

  it('does not deny the key "authorization_required" (different from "authorization")', () => {
    // Strictly: default rules `/^authorization$|^auth$/i` are anchored.
    // A longer key like `authorization_required` is a different name.
    const log = createLogger();
    log.info('flag', { authorization_required: true });
    expect(capture.calls[0]!.attributes.authorization_required).toBe(true);
  });

  it('does not deny the key "secrets_manager" (different from "secret")', () => {
    const log = createLogger();
    log.info('config', { secrets_manager: 'aws-secrets-manager-region' });
    expect(capture.calls[0]!.attributes.secrets_manager).toBe(
      'aws-secrets-manager-region',
    );
  });

  it('does not deny the key "user_id" or "userId" (no documented denylist hit)', () => {
    const log = createLogger();
    log.info('user', { user_id: 'u-12345', userId: 'u-12345' });
    expect(capture.calls[0]!.attributes.user_id).toBe('u-12345');
    expect(capture.calls[0]!.attributes.userId).toBe('u-12345');
  });

  it('does deny "session_id" but NOT "session_data"', () => {
    const log = createLogger();
    log.info('session', {
      session_id: 'sess-1',
      session_data: 'arbitrary payload visible in logs',
    });
    expect(capture.calls[0]!.attributes.session_id).toBe('[REDACTED]');
    expect(capture.calls[0]!.attributes.session_data).toBe(
      'arbitrary payload visible in logs',
    );
  });
});

describe('R-3 edge cases', () => {
  it('keeps a long technical narrative containing many denylist words', () => {
    const text =
      'authorization, password, secret, token, session_id, api_key — these are the values consumers must avoid logging directly';
    const log = createLogger();
    log.info('doc', { explanation: text });
    expect(capture.calls[0]!.attributes.explanation).toBe(text);
  });

  it('keeps numeric values under non-denied keys even when the value looks card-like', () => {
    // The default credit-card denylist applies to KEY names. A non-denied
    // key carrying a card-shaped number is not masked by the default
    // ruleset; consumers who want value-shape detection here must add a
    // custom shape rule.
    const log = createLogger();
    log.info('payment-id', { reference: '4242 4242 4242 4242' });
    expect(capture.calls[0]!.attributes.reference).toBe(
      '4242 4242 4242 4242',
    );
  });
});
