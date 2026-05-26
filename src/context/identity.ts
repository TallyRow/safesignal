/**
 * Identity helpers for application and module identity.
 *
 * Types live in the public `src/api/types.ts`; this module re-exports them
 * for ergonomic internal use and adds package-internal helpers.
 */

import type { AppIdentity, ModuleIdentity } from '../api/types.js';

export type { AppIdentity, ModuleIdentity };

/**
 * Format an identity as a stable string for diagnostic messages routed
 * through `onInternalError`. Returns `'(unknown)'` for undefined identity.
 *
 *   formatIdentity({ name: 'checkout', version: '1.2.3' }) === 'checkout@1.2.3'
 *   formatIdentity({ name: 'checkout' })                    === 'checkout'
 *   formatIdentity(undefined)                                === '(unknown)'
 */
export function formatIdentity(
  identity: AppIdentity | ModuleIdentity | undefined,
): string {
  if (identity === undefined) return '(unknown)';
  if (identity.version === undefined) return identity.name;
  return `${identity.name}@${identity.version}`;
}
