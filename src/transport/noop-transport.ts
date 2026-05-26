/**
 * Built-in `NoopTransport`. Silently swallows every event.
 *
 * This is the automatic fallback when `LoggerConfig.transports` is
 * undefined or empty (per `contracts/logger-config.md` LC default
 * resolution). Useful in tests, in environments where logging is
 * deliberately disabled, and as a placeholder during incremental
 * configuration.
 */

import type { Transport, TransportFactory } from '../api/types.js';

export const NoopTransport: TransportFactory = (): Transport => ({
  name: 'noop',
  send(): void {
    // intentionally empty
  },
});
