/**
 * Turns already-paid concept images into cached relics.
 *
 * A saturation run was interrupted after its concepts were created but before
 * any mesh started. Those concepts are finished tasks on Meshy's side and were
 * charged, but the script died holding the only record of which relic each one
 * belonged to, so nothing could use them.
 *
 * They are recoverable because compileRelicPrompt is deterministic: recompiling
 * every prompt the boss can produce and matching on the exact string identifies
 * which DNA each orphaned task was generating. That is a property worth having
 * regardless, and it is why this file is short.
 *
 *   pnpm --filter @relic/api exec tsx scripts/recover-concepts.ts --boss 2
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  compileRelicPrompt,
  composeRelicName,
  HERO_GENERATION_CONFIG,
  relicCacheKey,
  type Condition,
  type Element,
  type RelicDNA,
  type Temperament,
} from "@relic/core";
import { env } from "../src/env.js";
import { fetchBuffer, fetchBytes } from "../src/lib/fetchBytes.js";
import { getBalance } from "../src/services/meshy/meshy.balance.js";
import { meshyJson } from "../src/services/meshy/meshy.client.js";
import { createMeshFromConceptTask } from "../src/services/meshy/meshy.imageTo3d.js";
import { waitForTask } from "../src/services/meshy/meshy.tasks.js";
import { optimizeGlb } from "../src/generation/optimizeGlb.js";
import { findByCacheKey, putRelic } from "../src/cache/fileCache.js";

const BOSSES = [
  "the Ashen Warden",
  "the Drowned Choir",
  "the Gilded Husk",
  "the Rootbound King",
  "the Hollow Sovereign",
];

const ELEMENTS: Element[] = ["fire", "ice", "lightning"];
const TEMPERAMENTS: Temperament[] = ["brutal", "balanced", "elegant"];
const CONDITIONS: Condition[] = ["pristine", "battle-worn", "shattered"];

interface RemoteTask {
  id: string;
  status: string;
  prompt?: string;
  image_urls?: string[];
}

async function main(): Promise<void> {
  const bossArg = process.argv.indexOf("--boss");
  const level = bossArg === -1 ? 1 : Number(process.argv[bossArg + 1]);
  const boss = BOSSES[level - 1];
  if (!boss) throw new Error(`no boss at level ${level}`);

  const cfg = HERO_GENERATION_CONFIG;
  const balance = await getBalance();

  /** Every prompt this boss can produce, keyed by the prompt itself. */
  const byPrompt = new Map<string, RelicDNA>();
  for (const element of ELEMENTS) {
    for (const temperament of TEMPERAMENTS) {
      for (const condition of CONDITIONS) {
        const dna: RelicDNA = {
          weaponClass: temperament === "elegant" ? "spear" : "greatsword",
          element,
          temperament,
          condition,
          bossInfluence: boss,
          rarity: "legendary",
        };
        byPrompt.set(compileRelicPrompt(dna), dna);
      }
    }
  }

  const listed = await meshyJson<unknown>("/v1/text-to-image?page_size=30", { method: "GET" });
  const tasks = (Array.isArray(listed) ? listed : []) as RemoteTask[];

  const orphans = tasks.filter(
    (task) => task.status === "SUCCEEDED" && task.prompt && byPrompt.has(task.prompt),
  );

  console.log(`\n${boss}: ${orphans.length} paid concepts to turn into relics`);
  console.log(`  ~${orphans.length * 35} credits for the meshes (balance ${balance})\n`);

  for (const task of orphans) {
    const dna = byPrompt.get(task.prompt!)!;
    const cacheKey = relicCacheKey(dna, cfg);
    const label = `${dna.element}/${dna.temperament}/${dna.condition}`;

    if (await findByCacheKey(cacheKey)) {
      console.log(`skip  ${label} - already cached`);
      continue;
    }

    const relicId = randomUUID();
    const dir = path.join(env.storageDir, "relics", relicId);
    await mkdir(dir, { recursive: true });

    try {
      console.log(`gen   ${label}`);
      const conceptUrl = task.image_urls?.[0];
      if (conceptUrl) await writeFile(path.join(dir, "concept.png"), await fetchBuffer(conceptUrl));

      // Chained off the existing task, so the concept is not paid for twice.
      const meshStart = Date.now();
      const meshTaskId = await createMeshFromConceptTask(task.id, {
        meshyModel: cfg.meshyModel,
        ultraMode: cfg.ultraMode,
        targetPolycount: cfg.targetPolycount,
        enablePbr: cfg.enablePbr,
        targetFormats: cfg.targetFormats,
        shouldRemesh: cfg.shouldRemesh,
      });
      const mesh = await waitForTask("image-to-3d", meshTaskId);
      const glbUrl = mesh.model_urls.glb;
      if (!glbUrl) throw new Error("no glb");

      const { data, stats } = await optimizeGlb(await fetchBytes(glbUrl));
      await writeFile(path.join(dir, "model.glb"), data);

      await putRelic({
        relicId,
        cacheKey,
        name: composeRelicName(dna),
        dna,
        status: "COMPLETE",
        prompt: task.prompt!,
        generationMode: "hero",
        conceptUrl: conceptUrl ? `/assets/relics/${relicId}/concept.png` : null,
        modelUrl: `/assets/relics/${relicId}/model.glb`,
        conceptTaskId: task.id,
        meshTaskId,
        conceptMs: 0,
        meshMs: Date.now() - meshStart,
        optimizeMs: stats.ms,
        totalMs: Date.now() - meshStart,
        glbBytes: stats.bytesAfter,
        rawGlbBytes: stats.bytesBefore,
        cached: false,
        createdAt: Date.now(),
      });

      console.log(`  ok  ${label} - ${(stats.bytesAfter / 1048576).toFixed(2)} MB`);
    } catch (err) {
      console.error(`  !!  ${label}: ${(err as Error).message}`);
    }
  }

  console.log(`\nSpent ${balance - (await getBalance())} credits.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
