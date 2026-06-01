/**
 * Contract test: distributed-surface parity
 * (specs/012-distributed-surface-parity — FR-001..FR-006/FR-009, contracts/
 * distributed-surface.md). Enforces constitution Principle XI ("what ships
 * matches what is documented/contracted") via Principle X.
 *
 * The pure `checkParity` helper is unit-tested with synthetic drifted inputs to
 * prove fail-closed behavior without mutating the package; a real-package
 * assertion (over `npm pack --dry-run --json`) confirms the live surface is
 * honest. Run locally with `npm run surface:check`.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// The documented public subpaths (the `exports` keys). Source of truth:
// specs/012-distributed-surface-parity/contracts/distributed-surface.md.
const PUBLIC_SUBPATHS = [
  '.',
  './testing',
  './transport-beacon',
  './transport-otlp',
  './capture',
] as const;

interface PackageManifest {
  exports?: Record<string, Record<string, string>>;
  main?: string;
  module?: string;
  types?: string;
}

interface ParityVerdict {
  missingTargets: string[];
  strayFiles: string[];
  subpathDrift: { undocumented: string[]; missing: string[] };
  pass: boolean;
}

/** Strip a leading `./` so package.json targets compare to packed paths. */
function normalize(path: string): string {
  return path.replace(/^\.\//, '');
}

/**
 * In-surface rule (contracts/distributed-surface.md): a packaged file is part
 * of the documented surface iff it is under `dist/` (the sole `files` entry) or
 * is npm-mandatory metadata. This admits legitimate `dist/` resolution-support
 * files (maps, `.d.cts`, shared chunks) without false positives.
 */
function isInSurface(path: string): boolean {
  return (
    path.startsWith('dist/') ||
    path === 'package.json' ||
    /^(README|LICEN[CS]E)/i.test(path)
  );
}

/** Every file path the package's resolution metadata points at. */
function declaredTargets(pkg: PackageManifest): string[] {
  const targets = new Set<string>();
  for (const entry of Object.values(pkg.exports ?? {})) {
    for (const field of ['types', 'import', 'require']) {
      const file = entry[field];
      if (file) targets.add(normalize(file));
    }
  }
  for (const file of [pkg.main, pkg.module, pkg.types]) {
    if (file) targets.add(normalize(file));
  }
  return [...targets];
}

/**
 * Compare the actual published file set to the documented surface. Fails closed
 * on a missing target (FR-002), a stray file (FR-003), or subpath drift
 * (FR-004). Pure — no I/O.
 */
function checkParity(
  packedFiles: string[],
  pkg: PackageManifest,
  documentedSubpaths: readonly string[],
): ParityVerdict {
  const packed = new Set(packedFiles.map(normalize));
  const missingTargets = declaredTargets(pkg).filter((t) => !packed.has(t));
  const strayFiles = packedFiles.map(normalize).filter((p) => !isInSurface(p));

  const exportKeys = Object.keys(pkg.exports ?? {});
  const documented = new Set(documentedSubpaths);
  const undocumented = exportKeys.filter((k) => !documented.has(k));
  const missing = documentedSubpaths.filter((k) => !exportKeys.includes(k));

  const pass =
    missingTargets.length === 0 &&
    strayFiles.length === 0 &&
    undocumented.length === 0 &&
    missing.length === 0;

  return {
    missingTargets,
    strayFiles,
    subpathDrift: { undocumented, missing },
    pass,
  };
}

/** Actionable, per-drift failure report (FR-009 / SC-006). */
function formatVerdict(v: ParityVerdict): string {
  const lines = ['Distributed-surface parity FAILED.'];
  if (v.missingTargets.length > 0) {
    lines.push(
      '  Missing target(s) (declared in package.json but not shipped): ' +
        v.missingTargets.join(', '),
    );
  }
  if (v.strayFiles.length > 0) {
    lines.push(
      '  Stray file(s) (packaged but outside dist/ + npm metadata): ' +
        v.strayFiles.join(', '),
    );
  }
  if (v.subpathDrift.undocumented.length > 0) {
    lines.push(
      '  Subpath drift — undocumented exports key(s): ' +
        v.subpathDrift.undocumented.join(', '),
    );
  }
  if (v.subpathDrift.missing.length > 0) {
    lines.push(
      '  Subpath drift — documented subpath(s) missing from exports: ' +
        v.subpathDrift.missing.join(', '),
    );
  }
  lines.push(
    '  Fix: ensure every exports/entry target is built into dist/, keep ' +
      '`files` to `dist`, and update contracts/distributed-surface.md when ' +
      'intentionally changing the public subpaths.',
  );
  return lines.join('\n');
}

// A minimal honest package fixture for the synthetic unit cases.
const HONEST_PKG: PackageManifest = {
  exports: {
    '.': {
      types: './dist/index.d.ts',
      import: './dist/index.mjs',
      require: './dist/index.cjs',
    },
    './testing': {
      types: './dist/testing.d.ts',
      import: './dist/testing.mjs',
      require: './dist/testing.cjs',
    },
    './transport-beacon': {
      types: './dist/transport-beacon.d.ts',
      import: './dist/transport-beacon.mjs',
      require: './dist/transport-beacon.cjs',
    },
    './transport-otlp': {
      types: './dist/transport-otlp.d.ts',
      import: './dist/transport-otlp.mjs',
      require: './dist/transport-otlp.cjs',
    },
    './capture': {
      types: './dist/capture.d.ts',
      import: './dist/capture.mjs',
      require: './dist/capture.cjs',
    },
  },
  main: './dist/index.cjs',
  module: './dist/index.mjs',
  types: './dist/index.d.ts',
};

const HONEST_PACKED = [
  'package.json',
  'README.md',
  'LICENSE',
  ...Object.values(HONEST_PKG.exports ?? {}).flatMap((e) =>
    Object.values(e).map(normalize),
  ),
];

describe('distributed-surface parity rule (checkParity)', () => {
  it('passes an honest surface', () => {
    const v = checkParity(HONEST_PACKED, HONEST_PKG, PUBLIC_SUBPATHS);
    expect(v.pass).toBe(true);
  });

  it('fails closed when a declared target is not shipped (FR-002)', () => {
    const packed = HONEST_PACKED.filter(
      (p) => p !== 'dist/transport-otlp.d.ts',
    );
    const v = checkParity(packed, HONEST_PKG, PUBLIC_SUBPATHS);
    expect(v.pass).toBe(false);
    expect(v.missingTargets).toContain('dist/transport-otlp.d.ts');
  });

  it('fails closed on a stray packaged file (FR-003)', () => {
    const packed = [...HONEST_PACKED, 'src/secret-config.ts'];
    const v = checkParity(packed, HONEST_PKG, PUBLIC_SUBPATHS);
    expect(v.pass).toBe(false);
    expect(v.strayFiles).toContain('src/secret-config.ts');
  });

  it('does not flag dist/ resolution-support files as stray (FR-006)', () => {
    const packed = [
      ...HONEST_PACKED,
      'dist/index.mjs.map',
      'dist/index.d.cts',
      'dist/types-abc.d.ts',
    ];
    const v = checkParity(packed, HONEST_PKG, PUBLIC_SUBPATHS);
    expect(v.pass).toBe(true);
    expect(v.strayFiles).toHaveLength(0);
  });

  it('fails closed on an undocumented exports subpath (FR-004)', () => {
    const pkg: PackageManifest = {
      ...HONEST_PKG,
      exports: {
        ...HONEST_PKG.exports,
        './experimental': {
          types: './dist/experimental.d.ts',
          import: './dist/experimental.mjs',
          require: './dist/experimental.cjs',
        },
      },
    };
    const packed = [
      ...HONEST_PACKED,
      'dist/experimental.d.ts',
      'dist/experimental.mjs',
      'dist/experimental.cjs',
    ];
    const v = checkParity(packed, pkg, PUBLIC_SUBPATHS);
    expect(v.pass).toBe(false);
    expect(v.subpathDrift.undocumented).toContain('./experimental');
  });

  it('fails closed when a documented subpath is missing from exports (FR-004)', () => {
    const { './transport-otlp': _dropped, ...rest } = HONEST_PKG.exports ?? {};
    const pkg: PackageManifest = { ...HONEST_PKG, exports: rest };
    const v = checkParity(HONEST_PACKED, pkg, PUBLIC_SUBPATHS);
    expect(v.pass).toBe(false);
    expect(v.subpathDrift.missing).toContain('./transport-otlp');
  });

  it('names every drift and the remediation (FR-009 / SC-006)', () => {
    const packed = [
      ...HONEST_PACKED.filter((p) => p !== 'dist/index.cjs'),
      'src/leak.ts',
    ];
    const v = checkParity(packed, HONEST_PKG, PUBLIC_SUBPATHS);
    const message = formatVerdict(v);
    expect(message).toContain('dist/index.cjs');
    expect(message).toContain('src/leak.ts');
    expect(message).toContain('Fix:');
    expect(message).toContain('contracts/distributed-surface.md');
  });
});

describe('distributed-surface parity — real package', () => {
  beforeAll(() => {
    if (!existsSync(join(process.cwd(), 'dist', 'index.mjs'))) {
      throw new Error(
        'dist/ is not built — run `npm run build` first, then ' +
          '`npm run surface:check`.',
      );
    }
  });

  it('the published surface matches the documented contract (FR-001)', () => {
    const stdout = execSync('npm pack --dry-run --json', {
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const data = JSON.parse(stdout.slice(stdout.indexOf('['))) as Array<{
      files: Array<{ path: string }>;
    }>;
    const result = data[0];
    expect(
      result,
      '`npm pack --dry-run --json` returned no entry',
    ).toBeDefined();
    const packedFiles = (result?.files ?? []).map((f) => f.path);

    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as PackageManifest;

    const verdict = checkParity(packedFiles, pkg, PUBLIC_SUBPATHS);
    expect(verdict.pass, formatVerdict(verdict)).toBe(true);
  });
});
