/**
 * Map SafeSignal runtime-global identity to an OTLP `Resource` (OP-2 / D3).
 *
 * The `Resource` carries only identity that is constant across a batch
 * from one configured transport — `service.name`, `service.version`,
 * `deployment.environment` (standard OTel semantic-convention attributes
 * every OTLP backend understands). The federated `module.*` identity is
 * **per-logger** (it can differ between events in the same batch via
 * `withContext`), so it is attributed per-`LogRecord` (see
 * `otlp-serializer.ts`), not on the shared Resource — preserving correct
 * origin attribution (Principle VI).
 *
 * Only present fields are emitted (no empty/`null` keys). Pure and
 * dependency-free.
 *
 * Specs: `specs/007-transport-otlp/contracts/otlp-payload.md` OP-2.
 */

import type { LogContext } from '../api/types.js';

import type { KeyValue } from './attributes.js';

export interface OtlpResource {
  attributes: KeyValue[];
}

/**
 * Build the OTLP `Resource` for a batch from a representative context
 * (the batch's first event). `service.*` / `deployment.environment` are
 * runtime-global, so any event in the batch is representative.
 */
export function buildResource(context: LogContext): OtlpResource {
  const attributes: KeyValue[] = [];

  const push = (key: string, value: string | undefined): void => {
    if (typeof value === 'string' && value.length > 0) {
      attributes.push({ key, value: { stringValue: value } });
    }
  };

  push('service.name', context.application?.name);
  push('service.version', context.application?.version);
  push('deployment.environment', context.environment);

  return { attributes };
}
