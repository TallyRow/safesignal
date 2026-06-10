/**
 * Contract test: auto-enabled local quality hooks + `verify` gate
 * (specs/019-auto-enable-hooks — contracts/hooks-and-verify.md W/C/P/B).
 *
 * Three concerns, one file (per plan):
 *   - Wiring + tolerance (US1): package.json `prepare`; setup-hooks.mjs sets
 *     core.hooksPath in a git repo (idempotent) and no-ops outside one.
 *   - Commit-time (US2): prepare-commit-msg auto-appends Signed-off-by (no dup);
 *     commit-msg blocks an unsigned message; all commit-time hooks are present,
 *     executable (git tree mode), sh-shebanged; pre-commit invokes biome check.
 *   - Push-time (US3): package.json `verify` shape; pre-push present/executable/
 *     sh-shebanged and invokes `npm run verify`.
 *
 * Shell-behavior assertions run via a resolved POSIX shell and SKIP (never fail)
 * where none is on PATH — CI (ubuntu) always runs them, so the local/CI verdict
 * never diverges (Principle IX).
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const SETUP_HOOKS = join(REPO_ROOT, 'scripts', 'setup-hooks.mjs');
const HOOKS_DIR = join(REPO_ROOT, 'scripts', 'hooks');

const EXPECTED_VERIFY =
  'npm run build && npm run typecheck && npm run lint && npm run format:check && npm test && npm run api:check';

function pkg(): { scripts?: Record<string, string> } {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
}

/** First field of `git ls-files -s <path>` — the index/tree file mode, e.g. "100755". */
function gitTreeMode(relPath: string): string {
  const out = execFileSync('git', ['ls-files', '-s', '--', relPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return out.slice(0, 6);
}

function hookText(name: string): string {
  return readFileSync(join(HOOKS_DIR, name), 'utf8');
}

/** Whether a POSIX shell is invokable here (Git ships one on Windows). */
function hasPosixShell(): boolean {
  try {
    execFileSync('sh', ['-c', 'exit 0'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
const SH = hasPosixShell();

const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'ss-hooks-'));
  tmpDirs.push(d);
  return d;
}

/**
 * A fresh temp git repo. `identity: true` configures a LOCAL committer identity
 * so the hook's `git config user.name/email` is deterministic and independent of
 * the host/CI machine (CI runners have no identity — that divergence must not
 * leak into the test). Returns the repo path.
 */
function makeGitRepo(identity = true): string {
  const repo = makeTmpDir();
  execFileSync('git', ['init', '-q'], { cwd: repo, stdio: 'ignore' });
  if (identity) {
    execFileSync('git', ['config', 'user.name', 'Test Dev'], {
      cwd: repo,
      stdio: 'ignore',
    });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], {
      cwd: repo,
      stdio: 'ignore',
    });
  }
  return repo;
}
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// US1 — wiring + tolerance (W1/W2/W3/W4)
// ---------------------------------------------------------------------------

describe('auto-enable wiring (US1 / W1–W4)', () => {
  it('package.json declares prepare = node scripts/setup-hooks.mjs', () => {
    expect(pkg().scripts?.prepare).toBe('node scripts/setup-hooks.mjs');
  });

  it('setup-hooks.mjs sets core.hooksPath in a git repo and is idempotent (W2)', () => {
    const repo = makeTmpDir();
    execFileSync('git', ['init', '-q'], { cwd: repo, stdio: 'ignore' });

    execFileSync('node', [SETUP_HOOKS], { cwd: repo, stdio: 'ignore' });
    const first = execFileSync('git', ['config', 'core.hooksPath'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim();
    expect(first).toBe('scripts/hooks');

    // Idempotent: a second run leaves the same value.
    execFileSync('node', [SETUP_HOOKS], { cwd: repo, stdio: 'ignore' });
    const second = execFileSync('git', ['config', 'core.hooksPath'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim();
    expect(second).toBe('scripts/hooks');
  });

  it('setup-hooks.mjs is a silent no-op outside a git repo — never throws, no stdout (W3/W4)', () => {
    const nonGit = makeTmpDir();
    let stdout = '';
    expect(() => {
      stdout = execFileSync('node', [SETUP_HOOKS], {
        cwd: nonGit,
        encoding: 'utf8',
      });
    }).not.toThrow();
    expect(stdout).toBe('');
  });
});

// ---------------------------------------------------------------------------
// US2 — commit-time hooks (C1–C4)
// ---------------------------------------------------------------------------

describe('commit-time hooks — structure (US2 / C1)', () => {
  it.each([
    'pre-commit',
    'commit-msg',
    'prepare-commit-msg',
  ])('hook %s exists, is executable (git mode 100755), and has an sh shebang', (name) => {
    const text = hookText(name);
    expect(text).toMatch(/^#![^\n]*\bsh\b/);
    expect(gitTreeMode(`scripts/hooks/${name}`)).toBe('100755');
  });

  it('pre-commit invokes biome check on staged files (the reused lint/format gate)', () => {
    expect(hookText('pre-commit')).toMatch(/biome check/);
  });
});

describe.skipIf(!SH)('commit-time hooks — behavior (US2 / C2–C4)', () => {
  const prepare = join(HOOKS_DIR, 'prepare-commit-msg');
  const commitMsg = join(HOOKS_DIR, 'commit-msg');

  it('prepare-commit-msg appends Signed-off-by when missing (C2)', () => {
    const repo = makeGitRepo();
    const msg = join(repo, 'MSG');
    writeFileSync(msg, 'feat: a change\n');
    execFileSync('sh', [prepare, msg], { cwd: repo, stdio: 'ignore' });
    expect(readFileSync(msg, 'utf8')).toMatch(
      /^Signed-off-by: Test Dev <test@example\.com>$/m,
    );
  });

  it('prepare-commit-msg does not duplicate an existing trailer (C3)', () => {
    const repo = makeGitRepo();
    const msg = join(repo, 'MSG');
    writeFileSync(
      msg,
      'feat: a change\n\nSigned-off-by: Dev <dev@example.com>\n',
    );
    execFileSync('sh', [prepare, msg], { cwd: repo, stdio: 'ignore' });
    const count = (readFileSync(msg, 'utf8').match(/^Signed-off-by:/gm) ?? [])
      .length;
    expect(count).toBe(1);
  });

  it('prepare-commit-msg no-ops when committer identity is unset (C2 edge)', () => {
    const repo = makeGitRepo(false); // no local identity
    const emptyCfg = join(makeTmpDir(), 'empty-gitconfig');
    writeFileSync(emptyCfg, '');
    const msg = join(repo, 'MSG');
    writeFileSync(msg, 'feat: a change\n');
    // Isolate from any global/system identity so user.name/email resolve empty.
    execFileSync('sh', [prepare, msg], {
      cwd: repo,
      stdio: 'ignore',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: emptyCfg,
        GIT_CONFIG_SYSTEM: emptyCfg,
      },
    });
    expect(readFileSync(msg, 'utf8')).not.toMatch(/Signed-off-by/);
  });

  it('commit-msg blocks a message with no sign-off (C4 backstop)', () => {
    const repo = makeGitRepo(false);
    const msg = join(repo, 'MSG');
    writeFileSync(msg, 'feat: unsigned\n');
    expect(() =>
      execFileSync('sh', [commitMsg, msg], { cwd: repo, stdio: 'ignore' }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// US3 — verify gate + pre-push (P1/P2)
// ---------------------------------------------------------------------------

describe('verify gate + pre-push (US3 / P1–P2)', () => {
  it('package.json declares the verify gate with the documented composition (P1)', () => {
    expect(pkg().scripts?.verify).toBe(EXPECTED_VERIFY);
  });

  it('pre-push exists, is executable (git mode 100755), has an sh shebang, and runs npm run verify (P2)', () => {
    const text = hookText('pre-push');
    expect(text).toMatch(/^#![^\n]*\bsh\b/);
    expect(text).toMatch(/npm run verify/);
    expect(gitTreeMode('scripts/hooks/pre-push')).toBe('100755');
  });
});
