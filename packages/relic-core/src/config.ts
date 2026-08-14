import type { GenerationConfig } from "./types.js";

/**
 * Bump this whenever compileRelicPrompt changes. It feeds the cache key, so a
 * prompt edit invalidates every cached relic. Without it you edit the compiler,
 * regenerate, get the old sword back, and lose an afternoon to confusion.
 *
 * v2: the composition contract gained explicit no-text and hard vertical
 * clauses after Gate 1 produced a concept with "ASHEN WARDEN" lettered across
 * it, which becomes real geometry downstream, and a diagonally framed sword.
 */
export const PROMPT_VERSION = "v2";

/**
 * Fast loop for building and debugging: one concept, no ultra pass.
 * Testing a state transition should not wait on candidate selection.
 * ≈33 credits.
 */
export const DEV_GENERATION_CONFIG = {
  promptVersion: PROMPT_VERSION,
  imageModel: "nano-banana",
  conceptCandidates: 1,
  meshyModel: "meshy-7",
  ultraMode: false,
  targetPolycount: 12_000,
  shouldRemesh: true,
  enablePbr: true,
  targetFormats: ["glb"],
} as const satisfies GenerationConfig;

/**
 * Anything a human will actually look at. Three pro concepts, best one picked,
 * ultra geometry. ≈62 credits, worth it for models that appear in every
 * screenshot and video frame.
 */
export const HERO_GENERATION_CONFIG = {
  promptVersion: PROMPT_VERSION,
  imageModel: "nano-banana-pro",
  conceptCandidates: 3,
  meshyModel: "meshy-7",
  ultraMode: true,
  targetPolycount: 12_000,
  shouldRemesh: true,
  enablePbr: true,
  targetFormats: ["glb"],
} as const satisfies GenerationConfig;

export type GenerationMode = "dev" | "hero";

export function configForMode(mode: GenerationMode): GenerationConfig {
  return mode === "hero" ? HERO_GENERATION_CONFIG : DEV_GENERATION_CONFIG;
}

/** Longest dimension in world units after alignment. */
export const CANONICAL_LENGTH = {
  greatsword: 1.8,
  spear: 2.2,
  warhammer: 1.5,
} as const;
