import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { configForMode, relicCacheKey } from "@relic/core";
import { env } from "../src/env.js";

/**
 * Recomputes every cached relic's key in place.
 *
 * relicCacheKey changed from hashing the raw DNA to hashing the compiled
 * prompt, which is a deliberate collapse: fields that never reach Meshy no
 * longer split the cache. The stored keys were computed under the old scheme,
 * so without this every existing relic would be stranded behind a key nothing
 * will ever ask for, and a demo backed by twenty pre-generated relics would
 * quietly generate all twenty again.
 *
 * Safe to re-run. It derives keys from each record's own dna and mode rather
 * than from the existing key, so running it twice is a no-op.
 */

interface Index {
  version: number;
  relics: Record<string, Record<string, unknown>>;
  byCacheKey: Record<string, string>;
}

async function main(): Promise<void> {
  const path = join(env.CACHE_DIR, "index.json");
  const index = JSON.parse(await readFile(path, "utf8")) as Index;

  const byCacheKey: Record<string, string> = {};
  let moved = 0;
  let collided = 0;

  for (const [relicId, record] of Object.entries(index.relics)) {
    const dna = record.dna as Parameters<typeof relicCacheKey>[0] | undefined;
    if (!dna) continue;

    const mode = (record.generationMode as "dev" | "hero" | undefined) ?? "hero";
    const key = relicCacheKey(dna, configForMode(mode));

    if (record.cacheKey !== key) moved++;
    record.cacheKey = key;

    // Only completed relics are servable; a failed one must never satisfy a
    // lookup or the player is handed an error instead of a weapon.
    if (record.status !== "COMPLETE") continue;

    // The collapse means several old keys can land on one new key. Keeping the
    // first is arbitrary but consistent, and the loser stays on disk rather
    // than being deleted, so nothing is lost if the scheme changes again.
    if (byCacheKey[key]) {
      collided++;
      continue;
    }
    byCacheKey[key] = relicId;
  }

  index.byCacheKey = byCacheKey;
  await writeFile(path, `${JSON.stringify(index, null, 2)}\n`, "utf8");

  console.log(
    `rekeyed ${Object.keys(index.relics).length} relics, ${moved} keys moved, ` +
      `${collided} merged onto an existing key, ${Object.keys(byCacheKey).length} servable`,
  );
}

void main();
