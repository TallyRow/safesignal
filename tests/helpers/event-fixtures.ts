/**
 * Reusable `LogEvent` fixtures for tests.
 *
 * Local type stubs mirror `contracts/log-event.md`. They will be replaced with
 * `import type { LogEvent, LogLevel, ... } from '../../src/api/types'` once
 * T005 lands the canonical public types.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type AttributeValue =
  | string
  | number
  | boolean
  | null
  | AttributeValue[]
  | { [key: string]: AttributeValue };

export type Attributes = Record<string, AttributeValue>;

export interface AppIdentity {
  name: string;
  version?: string;
}

export interface ModuleIdentity {
  name: string;
  version?: string;
}

export interface LogContext {
  application?: AppIdentity;
  module?: ModuleIdentity;
  environment?: string;
  attributes?: Attributes;
}

export interface ErrorInfo {
  name: string;
  message: string;
  stack?: string;
}

export interface LogEvent {
  timestamp: string;
  level: LogLevel;
  message: string;
  attributes: Attributes;
  context: LogContext;
  error?: ErrorInfo;
}

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
