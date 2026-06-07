// Type declarations for the surface extractor, so the TypeScript determinism
// test imports extract-surface.mjs fully typed (no `allowJs`).

import type { PublicSurface } from './compare-surface.d.mts';

export declare function extractSurface(options?: {
  cwd?: string;
}): PublicSurface;

export declare function serializeSurface(surface: PublicSurface): string;
