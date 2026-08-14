/**
 * Promotes the Gate 1 outputs into the live relic cache.
 *
 * After this, an actual fight matching either hero archetype resolves from
 * cache in milliseconds and spends nothing, which is what makes the demo
 * recordable. The live path is untouched: any telemetry that does not match a
 * cached DNA still generates for real.
 *
 *   pnpm --filter @relic/api exec tsx scripts/seed-hero-relics.ts
 */
import { copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HERO_GENERATION_CONFIG, RelicDNASchema, relicCacheKey } from "@relic/core";
import { env } from "../src/env.js";
import { putRelic } from "../src/cache/fileCache.js";

const MetaSchema = z.object({
  slug: z.string(),
  name: z.string(),
  dna: RelicDNASchema,
  prompt: z.string(),
  cacheKey: z.string(),
  conceptTaskId: z.string().nullish(),
  meshTaskId: z.string().nullish(),
  conceptMs: z.number().nullish(),
  meshMs: z.number().nullish(),
  glbBytes: z.number().nullish(),
  rawGlbBytes: z.number().nullish(),
});

async function main() {
  const source = path.join(env.storageDir, "gate1");
  const dirs = (await readdir(source, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (dirs.length === 0) {
    console.error("No Gate 1 output found. Run gate1-differentiation.ts first.");
    process.exit(1);
  }

  for (const slug of dirs) {
    try {
      const meta = MetaSchema.parse(
        JSON.parse(await readFile(path.join(source, slug, "meta.json"), "utf8")),
      );

      // Recomputed rather than trusted from meta: if PROMPT_VERSION or the
      // hero config has moved since the file was written, the stored key is
      // stale and seeding it would serve an outdated relic forever.
      const cacheKey = relicCacheKey(meta.dna, HERO_GENERATION_CONFIG);
      if (cacheKey !== meta.cacheKey) {
        console.warn(
          `${slug}: config has changed since generation ` +
            `(${meta.cacheKey} → ${cacheKey}); seeding under the current key.`,
        );
      }

      const relicId = randomUUID();
      const dir = path.join(env.storageDir, "relics", relicId);
      await mkdir(dir, { recursive: true });
      await copyFile(path.join(source, slug, "model.glb"), path.join(dir, "model.glb"));
      await copyFile(path.join(source, slug, "concept.png"), path.join(dir, "concept.png"));

      await putRelic({
        relicId,
        cacheKey,
        name: meta.name,
        dna: meta.dna,
        status: "COMPLETE",
        prompt: meta.prompt,
        generationMode: "hero",
        conceptUrl: `/assets/relics/${relicId}/concept.png`,
        modelUrl: `/assets/relics/${relicId}/model.glb`,
        conceptTaskId: meta.conceptTaskId ?? null,
        meshTaskId: meta.meshTaskId ?? null,
        conceptMs: meta.conceptMs ?? null,
        meshMs: meta.meshMs ?? null,
        totalMs: (meta.conceptMs ?? 0) + (meta.meshMs ?? 0),
        glbBytes: meta.glbBytes ?? null,
        rawGlbBytes: meta.rawGlbBytes ?? null,
        cached: false,
        createdAt: Date.now(),
      });

      console.log(
        `seeded ${slug.padEnd(8)} ${meta.name.padEnd(18)} ` +
          `${meta.dna.element}/${meta.dna.temperament}/${meta.dna.condition} → ${cacheKey}`,
      );
    } catch (err) {
      console.error(`${slug}: ${(err as Error).message}`);
    }
  }

  console.log("\nMatching fights now resolve from cache with zero credits spent.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
