// Pure deprecate-before-remove comparison logic.
//
// Given the frozen baseline surface (last published release), the current
// built surface, and the reviewed allow-list, classify each delta and decide
// the gate verdict. No I/O — imported by both the gate entrypoint
// (check-surface.mjs) and the contract test, via the sibling .d.mts.
//
// Rule (contracts/api-surface-check.md):
//   REMOVED  → FAIL unless the baseline symbol was `deprecated: true`
//   CHANGED  → FAIL unless baseline `deprecated: true` OR an exact-match
//              reviewed AllowEntry (entry,name,from,to) excuses it
//   ADDED    → always PASS (informational)

/** @param {{ entry: string, name: string }} symbol */
function keyOf(symbol) {
  return `${symbol.entry} ${symbol.name}`;
}

/**
 * Compare two surfaces under the deprecate-before-remove rule.
 *
 * @param {import('./compare-surface.d.mts').PublicSurface} baseline
 * @param {import('./compare-surface.d.mts').PublicSurface} current
 * @param {import('./compare-surface.d.mts').AllowEntry[]} allow
 * @returns {import('./compare-surface.d.mts').GateVerdict}
 */
export function compareSurface(baseline, current, allow = []) {
  const currentByKey = new Map(current.symbols.map((s) => [keyOf(s), s]));
  const baselineByKey = new Map(baseline.symbols.map((s) => [keyOf(s), s]));

  const removed = [];
  const changed = [];
  const added = [];
  const violations = [];

  for (const base of baseline.symbols) {
    const curr = currentByKey.get(keyOf(base));
    if (!curr) {
      const finding = {
        entry: base.entry,
        name: base.name,
        class: 'removed',
        ...(base.deprecated ? { excusedBy: 'deprecated' } : {}),
      };
      removed.push(finding);
      if (!base.deprecated) violations.push(finding);
      continue;
    }
    if (curr.signature !== base.signature) {
      const allowed = allow.some(
        (a) =>
          a.entry === base.entry &&
          a.name === base.name &&
          a.from === base.signature &&
          a.to === curr.signature,
      );
      const excusedBy = base.deprecated
        ? 'deprecated'
        : allowed
          ? 'allow-list'
          : undefined;
      const finding = {
        entry: base.entry,
        name: base.name,
        class: 'changed',
        ...(excusedBy ? { excusedBy } : {}),
      };
      changed.push(finding);
      if (!excusedBy) violations.push(finding);
    }
  }

  for (const curr of current.symbols) {
    if (!baselineByKey.has(keyOf(curr))) {
      added.push({ entry: curr.entry, name: curr.name, class: 'added' });
    }
  }

  return { removed, changed, added, violations, pass: violations.length === 0 };
}

/**
 * Render a verdict into human-readable output. Pure (no I/O) so the contract
 * test can assert the failure message names every offending symbol and the
 * remediation (FR-010 / SC-006) without spawning the gate.
 *
 * @param {import('./compare-surface.d.mts').GateVerdict} verdict
 * @param {string} baselineVersion
 * @returns {import('./compare-surface.d.mts').FormattedVerdict}
 */
export function formatVerdict(verdict, baselineVersion) {
  const report = [
    `api-surface: compared current build against baseline ${baselineVersion}.`,
  ];
  for (const f of [...verdict.removed, ...verdict.changed, ...verdict.added]) {
    const excused = f.excusedBy ? ` (excused: ${f.excusedBy})` : '';
    report.push(`  ${f.class.toUpperCase()}  ${f.name} (${f.entry})${excused}`);
  }

  if (verdict.pass) {
    report.push(
      'api-surface: PASS — no undeprecated public-API removal or ' +
        'incompatible change.',
    );
    return { ok: true, report, remediation: null };
  }

  const detail = verdict.violations
    .map((v) =>
      v.class === 'removed'
        ? `  - ${v.name} (${v.entry}) was REMOVED but was not @deprecated in ` +
          'the last published release.'
        : `  - ${v.name} (${v.entry}) CHANGED incompatibly without a prior ` +
          '@deprecated signal or a reviewed allow-list entry.',
    )
    .join('\n');

  const remediation =
    `FAIL — ${verdict.violations.length} undeprecated public-API ` +
    `violation(s):\n${detail}\n` +
    '  Deprecate-before-remove (constitution Principle II): ship the symbol\n' +
    '  `@deprecated` with a working replacement and a documented migration\n' +
    '  path, keep it for at least one minor release, then remove. For a\n' +
    '  backward-compatible signature change, add a reviewed entry to\n' +
    '  api/surface-allow.json. Otherwise, revert the change.';

  return { ok: false, report, remediation };
}
