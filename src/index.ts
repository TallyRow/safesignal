/**
 * Public runtime entrypoint for the frontend logging package.
 *
 * This is the ONLY module consumers may import at runtime. The
 * `package.json` `exports` map restricts public access to this file and
 * `./testing`; nothing under `src/internal/**` is reachable, and the
 * source-tree boundary scan in `tests/contract/internal-import-boundary.test.ts`
 * (T014) fails the build if a forbidden re-export is introduced.
 *
 * Exact public surface — locked by `contracts/public-api.md` (PA-1..PA-9)
 * and verified by `tests/contract/public-api.contract.test.ts` (T019,
 * Phase 3).
 */

// Functions ----------------------------------------------------------------
export {
  createLogger,
  configureLogging,
  getRootLogger,
} from './api/logger.js';
export { createRedactor } from './pipeline/redactor.js';
export { scrubUrl } from './pipeline/url-scrubber.js';

// Built-in transport factories ---------------------------------------------
export { ConsoleTransport } from './transport/console-transport.js';
export { NoopTransport } from './transport/noop-transport.js';

// Types --------------------------------------------------------------------
export type {
  AppIdentity,
  Attributes,
  AttributeValue,
  CreateLoggerOptions,
  ErrorInfo,
  LevelMap,
  LogContext,
  LogEvent,
  Logger,
  LoggerConfig,
  LogLevel,
  ModuleIdentity,
  Redactor,
  RedactionRule,
  SanitizerLimits,
  ScrubUrlOptions,
  Transport,
  TransportFactory,
} from './api/types.js';
