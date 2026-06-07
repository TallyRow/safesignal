/**
 * Readable, source-mapped error stacks — the `./stacks` subpath (Feature 017).
 *
 * `createStackNormalizer(options?)` returns a `StackNormalizer` the host wires
 * once via `configureLogging({ normalizeStack })`. It parses a raw `error.stack`
 * string into ordered, **trimmed** structured frames (V8 + Firefox/Safari
 * formats), optionally maps each frame back to its original source position via a
 * consumer-supplied **synchronous** `resolver`, and bounds the result. The core
 * then attaches the frames to the error event as `attributes['safesignal.stack']`,
 * where the existing pipeline scrubs frame URLs and bounds them.
 *
 *   - Off by default (only active when wired); never throws (fail-safe).
 *   - No new dependency: the parser is hand-written; source maps + the resolver
 *     are consumer-provided. The only `src/` import is **type-only**.
 */

import type { StackFrame, StackNormalizer } from '../api/types.js';

/** Default frame cap when `maxFrames` is unset. */
export const DEFAULT_MAX_FRAMES = 30;
/** Upper bound for `maxFrames`. */
export const MAX_FRAMES_BOUND = 100;

/** Options for {@link createStackNormalizer}. */
export interface StackNormalizerOptions {
  /**
   * Optional **synchronous** source-map resolver: maps a minified
   * `{ file, line, column }` to the original position (or `null` if unmappable).
   * Per-frame and fail-safe; the consumer owns loading their maps.
   */
  resolver?: (frame: {
    file: string;
    line: number;
    column: number;
  }) => { file?: string; line?: number; column?: number; name?: string } | null;
  /** Max frames kept after trimming. Default 30; clamped to [1, 100]. */
  maxFrames?: number;
  /** Keep `node_modules` frames (default false → trimmed). */
  includeNodeModules?: boolean;
  /** Keep engine-internal / SafeSignal frames (default false → trimmed). */
  includeInternal?: boolean;
}

// V8: "    at fn (file:line:col)"  or  "    at file:line:col"
//   (fn may be "async fn", "new Ctor", "Object.<anonymous>", etc.)
const V8_LINE = /^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/;
// Firefox/JSC: "fn@file:line:col"  or  "@file:line:col"
const FF_LINE = /^\s*(?:(.*?)@)?(.+?):(\d+):(\d+)\s*$/;

/** Clean a captured function name; treat empty / anonymous as absent. */
function cleanFunction(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const fn = raw.trim();
  if (fn.length === 0 || fn === '<anonymous>') return undefined;
  return fn;
}

/** Parse one stack line into a frame, or `undefined` when it is not a frame. */
function parseLine(line: string): StackFrame | undefined {
  const m = V8_LINE.exec(line) ?? FF_LINE.exec(line);
  if (m === null) return undefined;
  const frame: StackFrame = {};
  const fn = cleanFunction(m[1]);
  if (fn !== undefined) frame.function = fn;
  if (m[2] !== undefined && m[2].length > 0) frame.file = m[2];
  if (m[3] !== undefined) frame.line = Number(m[3]);
  if (m[4] !== undefined) frame.column = Number(m[4]);
  return frame;
}

/** Whether a frame is noise to trim, given the options. */
function isNoise(frame: StackFrame, options: StackNormalizerOptions): boolean {
  const file = frame.file;
  if (file === undefined) return false;
  if (!options.includeNodeModules && file.includes('node_modules')) return true;
  if (!options.includeInternal) {
    if (/^(node:|internal\/)/.test(file)) return true;
    // Best-effort SafeSignal-own-frame match (rarely applicable; minified
    // consumer bundles usually defeat it — research R7).
    if (/safesignal/i.test(file)) return true;
  }
  return false;
}

function clampMaxFrames(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_MAX_FRAMES;
  return Math.min(MAX_FRAMES_BOUND, Math.max(1, Math.floor(value)));
}

/**
 * Build a synchronous {@link StackNormalizer}. The returned function parses,
 * trims, optionally source-map-resolves, and bounds a raw stack string into
 * `StackFrame[]` — or `null` when nothing parses (the raw stack stands). Never
 * throws.
 */
export function createStackNormalizer(
  options: StackNormalizerOptions = {},
): StackNormalizer {
  const maxFrames = clampMaxFrames(options.maxFrames);
  const resolver = options.resolver;

  return (stack: string): StackFrame[] | null => {
    let parsed: StackFrame[];
    try {
      parsed = [];
      for (const line of stack.split('\n')) {
        const frame = parseLine(line);
        if (frame !== undefined) parsed.push(frame);
      }
    } catch {
      return null;
    }
    if (parsed.length === 0) return null;

    // Trim noise; never return empty when frames existed (FR-003 fallback).
    let kept = parsed.filter((f) => !isNoise(f, options));
    if (kept.length === 0) kept = parsed;
    kept = kept.slice(0, maxFrames);

    if (resolver !== undefined) {
      for (const frame of kept) {
        if (
          frame.file === undefined ||
          frame.line === undefined ||
          frame.column === undefined
        ) {
          continue;
        }
        try {
          const original = resolver({
            file: frame.file,
            line: frame.line,
            column: frame.column,
          });
          if (original !== null) frame.original = original;
        } catch {
          // Per-frame swallow: one unmappable/throwing frame never loses the rest.
        }
      }
    }

    return kept;
  };
}
