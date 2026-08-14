import { canonicalJson } from "./cacheKey.js";
import type { Element, RelicDNA, Temperament } from "./types.js";

/**
 * Deterministic naming. An LLM would write better names, but names must never
 * be able to block or fail a generation, so this is the P0 path and LLM
 * flavour text is P1 decoration on top.
 *
 * Same DNA always yields the same name, which also keeps cached relics stable.
 */

/**
 * Pool size is a correctness concern, not decoration.
 *
 * Five prefixes by five suffixes is 25 names per element-temperament pair, and
 * with a relic cached for every boss and playstyle that produced two different
 * weapons both called Stormedge. Nine by nine is 81, which makes a collision
 * across the whole cache unlikely rather than expected.
 */
const PREFIX: Record<Element, string[]> = {
  fire: ["Ember", "Ashen", "Cinder", "Molten", "Pyre", "Scoria", "Kiln", "Slag", "Char"],
  ice: ["Winter", "Frost", "Glacial", "Rime", "Hoar", "Sleet", "Verglas", "Snowfall", "Bitterhold"],
  lightning: ["Storm", "Thunder", "Arc", "Tempest", "Levin", "Voltaic", "Skyfall", "Gale", "Fulgur"],
};

const SUFFIX: Record<Temperament, string[]> = {
  brutal: ["fang", "maw", "ruin", "wrath", "breaker", "render", "crusher", "scourge", "tyrant"],
  balanced: ["oath", "vow", "edge", "warden", "keeper", "sentinel", "accord", "bulwark", "creed"],
  elegant: ["whisper", "grace", "judgment", "veil", "song", "requiem", "lament", "wane", "elegy"],
};

function hashIndex(seed: string, length: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  }
  return h % length;
}

export function composeRelicName(dna: RelicDNA): string {
  const seed = canonicalJson(dna);
  const prefixes = PREFIX[dna.element];
  const suffixes = SUFFIX[dna.temperament];

  const prefix = prefixes[hashIndex(seed, prefixes.length)] ?? "Ashen";
  const suffix = suffixes[hashIndex(`${seed}:suffix`, suffixes.length)] ?? "oath";

  // "Winter's Judgment" reads better than "Winterjudgment"; short pairs fuse
  // into one word the way real fantasy loot names do.
  const fused = suffix.length <= 5 && prefix.length <= 6;
  if (fused) return `${prefix}${suffix}`;
  return `${prefix}'s ${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`;
}
