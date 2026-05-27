/**
 * Direct-forward `TelemetryBackend` that does NOT depend on
 * `@opentelemetry/*`. Used as the automatic fallback when `OtelLogsBackend`
 * init fails (T010, T024), and as the simplest possible backend for tests.
 *
 * Each accepted event is delivered to every configured transport. Failure
 * isolation belongs to `SafeTransport` (T011) — once that wrapper is in
 * place, the transports stored on `NormalizedConfig` will already be
 * isolated and the try/catch / promise-swallow below becomes redundant.
 * Until then the defense-in-depth here keeps FS-11 (one transport throws,
 * others still succeed) honored at this layer.
 */

import type { LogEvent, Transport } from '../../api/types.js';
import type { NormalizedConfig } from '../../config/config.js';
import type { TelemetryBackend } from './backend.js';

export class NoopBackend implements TelemetryBackend {
  private transports: ReadonlyArray<Transport> = [];

  init(config: NormalizedConfig): void {
    this.transports = config.transports;
  }

  handle(event: LogEvent): void {
    for (const transport of this.transports) {
      try {
        const result = transport.send(event);
        if (result instanceof Promise) {
          // Swallow rejection; SafeTransport (T011) will own this properly.
          result.then(undefined, () => undefined);
        }
      } catch {
        // Defense-in-depth pending T011 SafeTransport. Continues the loop
        // so a later transport still receives the event (FS-11).
      }
    }
  }

  async shutdown(): Promise<void> {
    // Transport lifecycle (flush + shutdown) is owned by
    // `ConfiguredRuntime`/`shutdownRuntime` (T058) — the runtime
    // tears down its wrapped transports independently of this
    // backend's lifecycle. Calling `transport.shutdown()` here
    // again would double-shutdown and double-flush. Backend-side
    // shutdown is now just dropping the local references.
    this.transports = [];
  }
}
