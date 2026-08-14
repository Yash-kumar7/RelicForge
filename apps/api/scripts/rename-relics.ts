/**
 * Recomputes the stored name of every cached relic.
 *
 * The name is not part of the cache key, so renaming is free: no regeneration,
 * no credits, no invalidation. Worth running after widening the name pools,
 * since records generated under the old pools keep whatever they were given and
 * two relics from different bosses had ended up with the same name.
 */
import { composeRelicName } from "@relic/core";
import { listRelics, patchRelic } from "../src/cache/fileCache.js";

const relics = await listRelics();
const seen = new Map<string, number>();
let renamed = 0;

for (const relic of relics) {
  const next = composeRelicName(relic.dna);
  if (next !== relic.name) {
    await patchRelic(relic.relicId, { name: next });
    console.log(`${relic.name} -> ${next}   (${relic.dna.bossInfluence})`);
    renamed++;
  }
  seen.set(next, (seen.get(next) ?? 0) + 1);
}

const collisions = [...seen.entries()].filter(([, count]) => count > 1);
console.log(`\nRenamed ${renamed} of ${relics.length}.`);
if (collisions.length > 0) {
  // Duplicates are still possible and still harmless, but worth surfacing
  // rather than discovering them in a screenshot.
  console.log("Remaining duplicate names:");
  for (const [name, count] of collisions) console.log(`  ${name} x${count}`);
} else {
  console.log("No duplicate names.");
}
