/**
 * Reusable `LogEvent` fixtures for tests.
 *
 * Type stubs were replaced with imports from the canonical public surface
 * (`src/api/types.ts`) once T005 landed. Types are re-exported for
 * convenience so test files can import both fixtures and types from one
 * helper path.
 */

import type {
  AppIdentity,
  Attributes,
  AttributeValue,
  ErrorInfo,
  LogContext,
  LogEvent,
  LogLevel,
  ModuleIdentity,
} from '../../src/api/types.js';

export type {
  AppIdentity,
  Attributes,
  AttributeValue,
  ErrorInfo,
  LogContext,
  LogEvent,
  LogLevel,
  ModuleIdentity,
};

export const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

const FIXED_TIMESTAMP = '2026-05-26T12:00:00.000Z';

/**
 * Build a `LogEvent` with sensible defaults. Pass `overrides` to vary fields.
 *
 * Default fixture:
 *   - timestamp: 2026-05-26T12:00:00.000Z (deterministic)
 *   - level: 'info'
 *   - message: 'fixture event'
 *   - attributes: {}
 *   - context: { application: { name: 'fixture-app' }, environment: 'test', attributes: {} }
 */
export function makeLogEvent(overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    timestamp: FIXED_TIMESTAMP,
    level: 'info',
    message: 'fixture event',
    attributes: {},
    context: {
      application: { name: 'fixture-app' },
      environment: 'test',
      attributes: {},
    },
    ...overrides,
  };
}

/**
 * Minimal `LogEvent` with the smallest valid payload — useful for testing
 * sanitizer/redactor boundaries on near-empty input.
 */
export function makeMinimalLogEvent(): LogEvent {
  return {
    timestamp: FIXED_TIMESTAMP,
    level: 'warn',
    message: '',
    attributes: {},
    context: {},
  };
}

/**
 * Build a `LogEvent` for every supported level. Useful for level-filter
 * and transport multi-emit tests.
 */
export function makeEventsForAllLevels(): readonly LogEvent[] {
  return LEVELS.map((level) =>
    makeLogEvent({ level, message: `fixture ${level} event` }),
  );
}
