// Auto-wire the repository's committed git hooks (specs/019-auto-enable-hooks).
//
// Run automatically by the npm `prepare` lifecycle script on `npm install` /
// `npm ci` in a development clone (and during `npm pack`/publish from a git
// checkout). Points Git at the tracked `scripts/hooks/` directory so the
// pre-commit / commit-msg / prepare-commit-msg / pre-push hooks activate with
// zero manual setup.
//
// Fail-safe + silent + idempotent: if this is not a git working copy (or git is
// unavailable — e.g. vendored source, an unusual CI image, a consumer tarball
// install), it is a no-op and never throws, so it can never break
// `npm install` / `npm ci` / `npm pack`.

import { execSync } from 'node:child_process';

try {
  execSync('git config core.hooksPath scripts/hooks', { stdio: 'ignore' });
} catch {
  // Not a git repository, or git is unavailable — nothing to wire. No-op.
}
