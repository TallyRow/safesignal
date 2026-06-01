// Type declarations for the deprecate-before-remove comparison logic, so the
// TypeScript contract tests import compare-surface.mjs fully typed (no
// `allowJs`). Mirrors specs/011-deprecate-before-remove/data-model.md.

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'const'
  | 'enum'
  | 'unknown';

export interface PublicSymbol {
  entry: string;
  name: string;
  kind: SymbolKind;
  signature: string;
  deprecated: boolean;
}

export interface PublicSurface {
  version: string;
  symbols: PublicSymbol[];
}

export interface AllowEntry {
  entry: string;
  name: string;
  from: string;
  to: string;
  reason: string;
  reviewedBy: string;
}

export type FindingClass = 'removed' | 'changed' | 'added';
export type ExcusedBy = 'deprecated' | 'allow-list';

export interface Finding {
  entry: string;
  name: string;
  class: FindingClass;
  excusedBy?: ExcusedBy;
}

export interface GateVerdict {
  removed: Finding[];
  changed: Finding[];
  added: Finding[];
  violations: Finding[];
  pass: boolean;
}

export interface FormattedVerdict {
  ok: boolean;
  report: string[];
  remediation: string | null;
}

export declare function compareSurface(
  baseline: PublicSurface,
  current: PublicSurface,
  allow?: AllowEntry[],
): GateVerdict;

export declare function formatVerdict(
  verdict: GateVerdict,
  baselineVersion: string,
): FormattedVerdict;
