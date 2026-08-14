import { compileRelicPrompt } from "./prompt.js";
import type { GenerationConfig, RelicDNA } from "./types.js";

/**
 * Stable stringify, object key order must never change the hash, or the same
 * relic generated twice would miss its own cache entry.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}

/** FNV-1a, no crypto dependency, so this stays runnable in the browser too. */
function fnv1a64(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c << 5) | (c >>> 3)), 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 16);
}

/**
 * The key hashes the *compiled prompt* and the entire generation config.
 *
 * Hashing the config is what stops the classic trap: you edit the prompt
 * compiler, regenerate, get the old sword back, and lose an afternoon to it.
 * Because promptVersion is part of the config, one constant bump invalidates
 * everything a prompt change could have affected.
 *
 * Hashing the compiled prompt rather than the raw DNA is what stops the
 * quieter, more expensive trap. `achievement` never reaches Meshy: it is a
 * label on the player's run, not an input to the image. Keying on DNA meant
 * DEATH'S DOOR and UNBROKEN produced two different keys for one identical
 * prompt, so the second player paid full generation time to be handed a mesh
 * already sitting on disk. It multiplied the reachable key space roughly
 * fivefold against a fixed set of cached relics, which is most of the reason a
 * real playthrough waited at all.
 *
 * Deriving the key from the prompt means the key cannot drift from the thing it
 * is meant to identify. A new field only splits the cache if it actually
 * changes what gets generated, and it does so without anyone maintaining a list
 * of which fields count.
 */
export function relicCacheKey(dna: RelicDNA, config: GenerationConfig): string {
  return fnv1a64(canonicalJson({ prompt: compileRelicPrompt(dna), config }));
}

export { canonicalJson };
