// Public API surface extractor for @tallyrow/safesignal.
//
// Reads the built dist/*.d.ts for every package `exports` entry point and
// emits a deterministic PublicSurface JSON: one record per exported symbol
// with its kind, a normalized signature, and whether it carries `@deprecated`.
//
// Authored as Node ESM (runs directly under `node`, no transpile, no new
// dependency — reuses the bundled `typescript` compiler API). A sibling
// `extract-surface.d.mts` types `extractSurface` for the TypeScript tests.
//
// Spec: specs/011-deprecate-before-remove/ (R1/R3/R4/R6, contracts/).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// The four `exports` subpaths, mapped to their built declaration files.
const ENTRY_FILES = [
  { entry: '.', file: 'index.d.ts' },
  { entry: './testing', file: 'testing.d.ts' },
  { entry: './transport-beacon', file: 'transport-beacon.d.ts' },
  { entry: './transport-otlp', file: 'transport-otlp.d.ts' },
];

const COMPILER_OPTIONS = {
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
};

/** Resolve a re-export alias to the symbol that actually declares the type. */
function resolveAlias(checker, symbol) {
  if (symbol.getFlags() & ts.SymbolFlags.Alias) {
    return checker.getAliasedSymbol(symbol);
  }
  return symbol;
}

/** Classify a symbol into a stable public kind. */
function kindOf(symbol) {
  const flags = symbol.getFlags();
  if (flags & ts.SymbolFlags.Function) return 'function';
  if (flags & ts.SymbolFlags.Class) return 'class';
  if (flags & ts.SymbolFlags.Interface) return 'interface';
  if (flags & ts.SymbolFlags.TypeAlias) return 'type';
  if (
    flags &
    (ts.SymbolFlags.Enum |
      ts.SymbolFlags.RegularEnum |
      ts.SymbolFlags.ConstEnum)
  ) {
    return 'enum';
  }
  if (
    flags &
    (ts.SymbolFlags.Variable |
      ts.SymbolFlags.BlockScopedVariable |
      ts.SymbolFlags.Property)
  ) {
    return 'const';
  }
  return 'unknown';
}

/** True when the symbol (or its alias target) carries an `@deprecated` tag. */
function isDeprecated(checker, symbol) {
  return symbol.getJsDocTags(checker).some((tag) => tag.name === 'deprecated');
}

/** Collapse declaration text to a stable, comment-free, public-name string. */
function normalize(text) {
  return text
    .replace(/\/\*\*[\s\S]*?\*\//g, ' ')
    .replace(/\bexport\s+/g, '')
    .replace(/\bdeclare\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build the normalized signature from the symbol's declaration node(s). The
 * bundled `.d.ts` declares with real public names (not mangled internals), so
 * printed declarations are stable and faithful to the authored surface.
 */
function signatureOf(printer, symbol) {
  const declarations = symbol.getDeclarations() ?? [];
  const texts = declarations.map((decl) =>
    normalize(
      printer.printNode(ts.EmitHint.Unspecified, decl, decl.getSourceFile()),
    ),
  );
  texts.sort();
  return texts.join(' ');
}

/** Extract the full public surface from the built dist/*.d.ts. */
export function extractSurface(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const distDir = join(cwd, 'dist');

  const missing = ENTRY_FILES.map((e) => e.file).filter(
    (file) => !existsSync(join(distDir, file)),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing built declaration file(s) in dist/: ${missing.join(', ')}. ` +
        'Run `npm run build` first.',
    );
  }

  const version = JSON.parse(
    readFileSync(join(cwd, 'package.json'), 'utf8'),
  ).version;

  const rootFiles = ENTRY_FILES.map((e) => join(distDir, e.file));
  const program = ts.createProgram(rootFiles, COMPILER_OPTIONS);
  const checker = program.getTypeChecker();
  const printer = ts.createPrinter({ removeComments: true });

  const symbols = [];
  for (const { entry, file } of ENTRY_FILES) {
    const sourceFile = program.getSourceFile(join(distDir, file));
    const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) continue;
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      const target = resolveAlias(checker, exported);
      symbols.push({
        entry,
        name: exported.getName(),
        kind: kindOf(target),
        signature: signatureOf(printer, target),
        deprecated:
          isDeprecated(checker, target) || isDeprecated(checker, exported),
      });
    }
  }

  symbols.sort((a, b) =>
    a.entry === b.entry
      ? a.name.localeCompare(b.name)
      : a.entry.localeCompare(b.entry),
  );

  return { version, symbols };
}

/** Deterministic serialization (sorted symbols, fixed keys, trailing NL). */
export function serializeSurface(surface) {
  return `${JSON.stringify(surface, null, 2)}\n`;
}

// CLI: regenerate the committed baseline. Used at release time by
// `npm run api:extract` (see CONTRIBUTING.md § Cutting a release).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const surface = extractSurface();
  const outDir = join(process.cwd(), 'api');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'surface.json'), serializeSurface(surface));
  process.stdout.write(
    `Wrote api/surface.json (${surface.symbols.length} symbols, ` +
      `version ${surface.version}).\n`,
  );
}
