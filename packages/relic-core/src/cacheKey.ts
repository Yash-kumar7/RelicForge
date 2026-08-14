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
 * The key hashes DNA *and the entire generation config*.
 *
 * Keying on DNA alone is the classic trap: you edit the prompt compiler,
 * regenerate, get the old sword back, and lose an afternoon to it. Because
 * promptVersion is part of the config, one constant bump invalidates
 * everything that a prompt change could have affected.
 */
export function relicCacheKey(dna: RelicDNA, config: GenerationConfig): string {
  return fnv1a64(canonicalJson({ dna, config }));
}

export { canonicalJson };
