/**
 * Drops dev-mode relics that a hero-mode relic already supersedes.
 *
 * Both are legitimate: the same DNA generated under DEV and HERO configs has
 * different cache keys by design, so both are cached and both are correct. But
 * the dev one skipped the ultra pass and the concept candidates, so once a hero
 * version of the same DNA exists the dev version is only noise in the loadout
 * and the compare view.
 *
 * Assets are left on disk. Removing a cache entry is reversible; deleting a
 * generated mesh is not, and it costs credits to undo.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../src/env.js";
import { listRelics } from "../src/cache/fileCache.js";
import { relicCacheKey, HERO_GENERATION_CONFIG } from "@relic/core";

const relics = await listRelics();
const heroKeys = new Set(
  relics.filter((r) => r.generationMode === "hero").map((r) => relicCacheKey(r.dna, HERO_GENERATION_CONFIG)),
);

const doomed = relics.filter(
  (r) => r.generationMode === "dev" && heroKeys.has(relicCacheKey(r.dna, HERO_GENERATION_CONFIG)),
);

if (doomed.length === 0) {
  console.log("Nothing to prune.");
} else {
  const indexPath = path.join(env.cacheDir, "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8")) as {
    relics: Record<string, unknown>;
    byCacheKey: Record<string, string>;
  };

  for (const relic of doomed) {
    delete index.relics[relic.relicId];
    if (index.byCacheKey[relic.cacheKey] === relic.relicId) delete index.byCacheKey[relic.cacheKey];
    console.log(`pruned ${relic.name} (dev, superseded by hero)`);
  }

  await writeFile(indexPath, JSON.stringify(index, null, 2));
  console.log(`\nPruned ${doomed.length}. Assets left on disk.`);
}
