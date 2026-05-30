/**
 * Dependency-pins / vendor-free package audit (T070).
 *
 * Locks the constitution v1.2.0 + plan.md "Vendor-Neutral Core
 * Architecture" guarantee: the package's runtime `dependencies` MUST
 * NOT contain any observability-vendor SDK. The core ships with
 * direct transport fan-out from the dispatcher (`pipeline/dispatcher
 * .ts`) and built-in `ConsoleTransport` / `NoopTransport`. There is
 * no OpenTelemetry / Datadog / Sentry / any-other-vendor SDK on the
 * default emit path, in the bundle, in the declarations, or in the
 * runtime install graph.
 *
 * Four assertions (matching tasks.md T070 (a)-(d)):
 *
 *   (a) `package.json` `dependencies` contains zero observability-
 *       vendor packages.
 *   (b) Any vendor packages that appear in the adapter-seam source
 *       tree (`src/internal/telemetry/otel/**`) are declared in
 *       `devDependencies` only — that's where dev-time TypeScript
 *       resolution for the seam code lives, but no consumer install
 *       pulls them down.
 *   (c) The built default entry (`dist/index.{mjs,cjs}`) does not
 *       import any vendor SDK and does not re-export from
 *       `dist/internal/**`.
 *   (d) The published declarations (`dist/index.d.ts` + `dist/index
 *       .d.cts`) contain no vendor-specific identifier.
 *
 * Vendor neutrality is structural here — the assertions read static
 * artifacts (package.json text, built bundle files, declaration
 * files). A future vendor adapter would ship as a peer transport in
 * a separate package or feature; the core's audit guarantee never
 * weakens.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const PACKAGE_JSON = resolve(REPO_ROOT, 'package.json');
const DIST_ROOT = resolve(REPO_ROOT, 'dist');
const DIST_INDEX_MJS = resolve(DIST_ROOT, 'index.mjs');
const DIST_INDEX_CJS = resolve(DIST_ROOT, 'index.cjs');
const DIST_INDEX_DTS = resolve(DIST_ROOT, 'index.d.ts');
const DIST_INDEX_DCTS = resolve(DIST_ROOT, 'index.d.cts');

// ---------------------------------------------------------------------------
// Vendor identity sets
// ---------------------------------------------------------------------------

/**
 * Observability-vendor package-name patterns. Each entry matches a
 * vendor's npm-scope or canonical package name. Used to flag a
 * `dependencies` entry that names any vendor SDK.
 *
 * Anchored to a real package-name shape — a scope prefix
 * (`@opentelemetry/`, `@datadog/`, `@sentry/`) or a top-level
 * package name (`opentelemetry`, `dd-rum`, `dd-trace`,
 * `posthog-js`, `splunk-otel-web`, etc.).
 */
const VENDOR_PACKAGE_PREFIXES: ReadonlyArray<string> = [
  '@opentelemetry/',
  '@datadog/',
  '@sentry/',
  '@elastic/apm-',
  '@newrelic/',
  '@honeycombio/',
  '@logz/',
  '@splunk/',
];

const VENDOR_EXACT_PACKAGES: ReadonlyArray<string> = [
  'opentelemetry',
  'dd-rum',
  'dd-trace',
  'datadog-metrics',
  'newrelic',
  'raygun4js',
  'logrocket',
  'rollbar',
  'bugsnag-js',
  '@bugsnag/js',
];

/**
 * Vendor-specific identifier names that must not appear in the
 * published declaration files. Word-boundary matched so a generic
 * word inside a JSDoc paragraph does not trip the check.
 */
const VENDOR_DTS_IDENTIFIERS: ReadonlyArray<string> = [
  'SeverityNumber',
  'LoggerProvider',
  'LogRecord',
  'LogRecordProcessor',
  'LogRecordExporter',
  'SpanContext',
  'SpanProcessor',
  'SpanExporter',
  'TraceFlags',
  'TraceProvider',
  'TraceState',
  'TracerProvider',
  'OtelLogsBackend',
  'DDLogger',
  'SentryHub',
];

interface PackageJsonShape {
  readonly name: string;
  readonly version: string;
  readonly type?: string;
  readonly sideEffects?: boolean;
  readonly main?: string;
  readonly module?: string;
  readonly types?: string;
  readonly exports?: Record<string, unknown>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
}

function loadPackageJson(): PackageJsonShape {
  const raw = readFileSync(PACKAGE_JSON, 'utf8');
  return JSON.parse(raw) as PackageJsonShape;
}

function isVendorPackage(name: string): boolean {
  for (const prefix of VENDOR_PACKAGE_PREFIXES) {
    if (name.startsWith(prefix)) return true;
  }
  return VENDOR_EXACT_PACKAGES.includes(name);
}

function listVendorEntries(deps: Record<string, string> | undefined): string[] {
  if (deps === undefined) return [];
  return Object.keys(deps).filter(isVendorPackage);
}

// ---------------------------------------------------------------------------
// Build prerequisite (assertions (c) + (d) only)
// ---------------------------------------------------------------------------

beforeAll(() => {
  // Assertions (a) and (b) read only `package.json` and can run any time.
  // Assertions (c) and (d) read `dist/`; fail loudly if missing so that a
  // CI step that forgot `npm run build` doesn't silently pass.
  const distFiles = [
    DIST_INDEX_MJS,
    DIST_INDEX_CJS,
    DIST_INDEX_DTS,
    DIST_INDEX_DCTS,
  ];
  const missing = distFiles.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    throw new Error(
      `dist/ artifacts missing: ${missing.map((p) => p.replace(`${REPO_ROOT}/`, '')).join(', ')}\n` +
        `Run 'npm run build' before invoking the dependency-pins audit.`,
    );
  }
});

// ---------------------------------------------------------------------------
// (a) `dependencies` contains zero observability-vendor packages
// ---------------------------------------------------------------------------

describe('T070 (a) — package.json `dependencies` is vendor-free', () => {
  it('no observability-vendor packages appear in `dependencies`', () => {
    const pkg = loadPackageJson();
    const vendorDeps = listVendorEntries(pkg.dependencies);
    expect(
      vendorDeps,
      'package.json "dependencies" declares vendor SDK(s): ' +
        vendorDeps.join(', ') +
        '. The core is vendor-neutral; observability-vendor SDKs must live ' +
        'in "devDependencies" (for the dormant adapter-seam source tree) ' +
        'or in a future peer-transport package, never in "dependencies".',
    ).toEqual([]);
  });

  it('`dependencies` is empty or contains only non-observability runtime deps', () => {
    // Defense-in-depth: today the package is truly dependency-free.
    // If a future runtime dep is added (e.g., a tiny utility), this
    // assertion still flags any vendor package via the
    // `isVendorPackage` check. Non-vendor entries are explicitly
    // allowed — the assertion below documents the current empty
    // state but is structured to permit growth in the vendor-free
    // direction.
    const pkg = loadPackageJson();
    const deps = pkg.dependencies ?? {};
    const vendorDeps = Object.keys(deps).filter(isVendorPackage);
    expect(vendorDeps).toEqual([]);
  });

  it('`peerDependencies` is also vendor-free (no implicit vendor coupling)', () => {
    // peerDependencies are a sneaky leak vector: a consumer who
    // installs the package would also need the peer installed.
    // Vendor-neutrality forbids any observability-vendor peer at
    // the core level. A future opt-in vendor-adapter feature may
    // declare its own peers in its own package, not here.
    const pkg = loadPackageJson();
    const vendorPeers = listVendorEntries(pkg.peerDependencies);
    expect(
      vendorPeers,
      'package.json "peerDependencies" declares vendor SDK(s): ' +
        vendorPeers.join(', '),
    ).toEqual([]);
  });

  it('`optionalDependencies` is also vendor-free', () => {
    const pkg = loadPackageJson();
    const vendorOptional = listVendorEntries(pkg.optionalDependencies);
    expect(vendorOptional).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (b) Vendor packages used by adapter-seam code/tests live in
//     `devDependencies` only
// ---------------------------------------------------------------------------

describe('T070 (b) — vendor packages used by the adapter seam live in `devDependencies` only', () => {
  it('the OTel adapter seam imports @opentelemetry/* via packages that resolve at dev/test time only', () => {
    // The adapter-seam source at src/internal/telemetry/otel/**
    // imports `@opentelemetry/api`, `@opentelemetry/api-logs`, and
    // `@opentelemetry/sdk-logs`. After T066's dispatcher refactor
    // this code is unreachable from src/index.ts and is tree-shaken
    // out of the built bundle (locked by tests/security/bundle-
    // shape.security.test.ts and assertion (c) below). The package
    // must NOT declare these as runtime deps; they belong in
    // devDependencies so that the in-repo seam typecheck still
    // resolves them without forcing the consumer to install them.
    const pkg = loadPackageJson();
    const devDeps = pkg.devDependencies ?? {};
    for (const otelName of [
      '@opentelemetry/api',
      '@opentelemetry/api-logs',
      '@opentelemetry/sdk-logs',
    ]) {
      expect(
        Object.hasOwn(devDeps, otelName),
        'expected "' +
          otelName +
          '" in devDependencies ' +
          "(it's used by the dormant adapter seam at " +
          'src/internal/telemetry/otel/** and must not be installed ' +
          'for downstream consumers)',
      ).toBe(true);
    }
  });

  it('no vendor package appears in BOTH `dependencies` and `devDependencies` (no double-listed leak)', () => {
    const pkg = loadPackageJson();
    const runtime = new Set(Object.keys(pkg.dependencies ?? {}));
    const dev = Object.keys(pkg.devDependencies ?? {});
    const doublyDeclared = dev.filter(
      (n) => runtime.has(n) && isVendorPackage(n),
    );
    expect(doublyDeclared).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (c) Built default entry does not import any vendor SDK and does
//     not re-export from dist/internal/**
// ---------------------------------------------------------------------------

describe('T070 (c) — built `dist/index.{mjs,cjs}` contains no vendor SDK imports', () => {
  it.each([
    ['mjs', DIST_INDEX_MJS],
    ['cjs', DIST_INDEX_CJS],
  ] as const)('`dist/index.%s` contains zero vendor-SDK imports', (_label, path) => {
    const content = readFileSync(path, 'utf8');
    const vendorImports: string[] = [];

    // Scan for any vendor-prefixed bare module reference in the
    // built bundle. tsup emits a single bundled file per entry, so
    // any import that survives the bundle would appear as a string
    // literal next to a `from` / `require(` token.
    const importPatterns = [
      /from\s+['"]([^'"]+)['"]/g,
      /require\(\s*['"]([^'"]+)['"]\s*\)/g,
      /import\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const re of importPatterns) {
      for (const match of content.matchAll(re)) {
        const specifier = match[1];
        if (specifier !== undefined && isVendorPackage(specifier)) {
          vendorImports.push(specifier);
        }
      }
    }

    expect(
      vendorImports,
      `dist/index.${_label} bundles vendor-SDK imports: ${vendorImports.join(', ')}. ` +
        `The default entry must be vendor-free. ` +
        `If a future vendor adapter is added, it must live in a separate ` +
        `peer-transport package, not in the core default entry.`,
    ).toEqual([]);
  });

  it.each([
    ['mjs', DIST_INDEX_MJS],
    ['cjs', DIST_INDEX_CJS],
  ] as const)('`dist/index.%s` contains no string fragment naming a vendor package', (_label, path) => {
    const content = readFileSync(path, 'utf8');
    // Substring check (case-insensitive) — catches even raw string
    // literals that might appear in error messages or comments. The
    // built bundle should not name a vendor; the only legitimate
    // references would be in identifiers (variable names), which
    // word-boundary matching above already covers.
    const lower = content.toLowerCase();
    for (const prefix of VENDOR_PACKAGE_PREFIXES) {
      expect(
        lower.includes(prefix.toLowerCase()),
        `dist/index.${_label} contains the vendor-package prefix "${prefix}"`,
      ).toBe(false);
    }
    for (const exact of VENDOR_EXACT_PACKAGES) {
      // Substring match for these is too aggressive (e.g., "newrelic"
      // could collide with valid identifier text in unrelated code).
      // Use word-boundary instead.
      const re = new RegExp(
        `\\b${exact.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`,
      );
      expect(
        re.test(content),
        `dist/index.${_label} contains the vendor-package name "${exact}"`,
      ).toBe(false);
    }
  });

  it.each([
    ['mjs', DIST_INDEX_MJS],
    ['cjs', DIST_INDEX_CJS],
  ] as const)('`dist/index.%s` does not re-export from `dist/internal/**`', (_label, path) => {
    const content = readFileSync(path, 'utf8');
    expect(content).not.toMatch(/from\s+['"]\.\/internal\//);
    expect(content).not.toMatch(/require\(\s*['"]\.\/internal\//);
  });
});

// ---------------------------------------------------------------------------
// (d) Published declarations contain no vendor-specific identifier
// ---------------------------------------------------------------------------

describe('T070 (d) — published `dist/index.d.{ts,cts}` contain no vendor-specific identifier', () => {
  function stripComments(source: string): string {
    let stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
    stripped = stripped.replace(/\/\/.*$/gm, '');
    return stripped;
  }

  for (const [label, path] of [
    ['index.d.ts', DIST_INDEX_DTS],
    ['index.d.cts', DIST_INDEX_DCTS],
  ] as const) {
    describe(label, () => {
      it.each(
        VENDOR_DTS_IDENTIFIERS,
      )('does not expose the vendor-specific identifier "%s"', (ident) => {
        const code = stripComments(readFileSync(path, 'utf8'));
        const re = new RegExp(`\\b${ident}\\b`);
        expect(
          re.test(code),
          `dist/${label} exposes the vendor identifier "${ident}" (comments stripped)`,
        ).toBe(false);
      });

      it.each([
        ...VENDOR_PACKAGE_PREFIXES,
        ...VENDOR_EXACT_PACKAGES,
      ])('does not name the vendor package "%s"', (name) => {
        const code = stripComments(readFileSync(path, 'utf8'));
        expect(
          code.toLowerCase().includes(name.toLowerCase()),
          `dist/${label} names the vendor package "${name}" (comments stripped)`,
        ).toBe(false);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// `package.json` `exports` map and `sideEffects` are correct
// ---------------------------------------------------------------------------

describe('T070 sanity — `package.json` exports map exposes `.`, `./testing`, `./transport-beacon`, `./transport-otlp`, sideEffects:false', () => {
  it('exports map keys are exactly { ".", "./testing", "./transport-beacon", "./transport-otlp" }', () => {
    const pkg = loadPackageJson();
    const exports = pkg.exports ?? {};
    expect(Object.keys(exports).sort()).toEqual([
      '.',
      './testing',
      './transport-beacon',
      './transport-otlp',
    ]);
  });

  it('sideEffects is explicitly false', () => {
    const pkg = loadPackageJson();
    expect(pkg.sideEffects).toBe(false);
  });

  it('main, module, types fields point into dist/', () => {
    const pkg = loadPackageJson();
    expect(pkg.main).toMatch(/^\.\/dist\/index\.(mjs|cjs)$/);
    expect(pkg.module).toMatch(/^\.\/dist\/index\.(mjs|cjs)$/);
    expect(pkg.types).toMatch(/^\.\/dist\/index\.d\.(c?ts)$/);
  });

  // T030 — extend the sanity block with the full TB-12 shape-check
  // per exports entry. Every entry MUST carry the documented
  // types / import / require triple pointing into dist/.
  it.each([
    ['.', 'index'],
    ['./testing', 'testing'],
    ['./transport-beacon', 'transport-beacon'],
  ])('entry %s has the documented { types, import, require } triple for "%s"', (key, name) => {
    const pkg = loadPackageJson();
    const entry = (
      pkg.exports as Record<string, Record<string, string>> | undefined
    )?.[key];
    expect(entry).toEqual({
      types: `./dist/${name}.d.ts`,
      import: `./dist/${name}.mjs`,
      require: `./dist/${name}.cjs`,
    });
  });
});

// ---------------------------------------------------------------------------
// T030 sanity — `package.json` dependencies + devDependencies after
// the beacon-transport feature (TB-12)
// ---------------------------------------------------------------------------

describe('T030 sanity — no new runtime or vendor deps after 002-beacon-transport', () => {
  it('package.json `dependencies` is empty (zero runtime deps)', () => {
    const pkg = loadPackageJson();
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('package.json `devDependencies` does not contain any observability-vendor SDK beyond feature 001 baseline', () => {
    const pkg = loadPackageJson();
    const dev = Object.keys(pkg.devDependencies ?? {});
    // The beacon-transport feature MUST NOT add any vendor SDK to
    // devDependencies. The pre-existing @opentelemetry/* pins from
    // feature 001 are documented as a retained reference adapter
    // surface (per plan.md 'Vendor-Neutral Core Architecture'),
    // never linked into the default or beacon-transport bundles —
    // enforced separately by feature 001's bundle-shape test and
    // by tests/security/transport-beacon-bundle-shape.security.test.ts.
    const newVendorIntroductions = dev.filter(
      (name) =>
        name.startsWith('@datadog/') ||
        name === 'dd-rum' ||
        name === 'dd-trace' ||
        name.startsWith('@sentry/'),
    );
    expect(newVendorIntroductions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Bundle-size budget for the vendor-free core path
// ---------------------------------------------------------------------------

describe('T070 — vendor-free core bundle size is within plan.md target', () => {
  it('gzipped `dist/index.mjs` is under 15 KB (vendor-free core target per plan.md)', async () => {
    // Use a lightweight gzip-size proxy: write the file's bytes
    // through Node's zlib at default settings. This matches what
    // npm install + bundlers measure for downstream consumers. The
    // 15 KB target is the plan's vendor-free core budget; if a
    // future addition crosses this, it's either (a) accidentally
    // pulling in a vendor SDK, or (b) a legitimate growth that
    // requires updating the plan. The assertion fails loudly so
    // either path gets a deliberate decision.
    const zlib = await import('node:zlib');
    const content = readFileSync(DIST_INDEX_MJS);
    const gzipped = zlib.gzipSync(content);
    expect(
      gzipped.length,
      `dist/index.mjs gzipped is ${String(gzipped.length)} bytes (target: <15360). ` +
        `If this exceeds the budget, audit whether a vendor SDK regressed ` +
        `into the bundle (T066 / dependency-pins guarantees) or whether the ` +
        `growth is intentional and the plan budget should be revisited.`,
    ).toBeLessThan(15 * 1024);
  });
});
