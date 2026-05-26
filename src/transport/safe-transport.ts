/**
 * `SafeTransport` wraps any consumer-supplied `Transport` so that synchronous
 * throws and rejected Promises from `send()`, `flush()`, or `shutdown()`
 * never propagate to the caller. The first failure per wrapped transport
 * per session emits one `onInternalError` notice; subsequent failures are
 * silent (no log spam — FS-12).
 *
 * Locks the failure-safety invariants:
 *   FS-1  sync throw from send()  → caught
 *   FS-2  rejected Promise from send() → swallowed (no unhandled rejection)
 *   FS-11 one transport throws while others succeed → others still run
 *         (the dispatcher iterates over wrapped transports; each is isolated)
 *   FS-12 one notice per transport per session
 */

import type { LogEvent, Transport } from '../api/types.js';
import {
  type PackageErrorCode,
  wrapAsPackageError,
} from '../internal/errors/internal-errors.js';

export class SafeTransport implements Transport {
  readonly name: string;
  private readonly inner: Transport;
  private readonly onInternalError: (err: Error) => void;
  private notified = false;

  constructor(inner: Transport, onInternalError: (err: Error) => void) {
    this.inner = inner;
    this.name = inner.name;
    this.onInternalError = onInternalError;
  }

  send(event: LogEvent): void {
    try {
      const result = this.inner.send(event);
      if (result instanceof Promise) {
        result.then(undefined, (reason: unknown) => {
          this.notify(reason, 'transport_send_failed');
        });
      }
    } catch (err) {
      this.notify(err, 'transport_send_failed');
    }
  }

  async flush(): Promise<void> {
    if (this.inner.flush === undefined) return;
    try {
      await this.inner.flush();
    } catch (err) {
      this.notify(err, 'transport_send_failed');
    }
  }

  async shutdown(): Promise<void> {
    if (this.inner.shutdown === undefined) return;
    try {
      await this.inner.shutdown();
    } catch (err) {
      this.notify(err, 'transport_shutdown_failed');
    }
  }

  private notify(cause: unknown, code: PackageErrorCode): void {
    if (this.notified) return;
    this.notified = true;
    this.onInternalError(
      wrapAsPackageError(
        code,
        `Transport '${this.name}' failed: ${describe(cause)}`,
        cause,
        this.name,
      ),
    );
  }
}

function describe(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  return String(value);
}
