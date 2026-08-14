/**
 * Pre-generates a relic for every boss and every playstyle, straight into the
 * live cache.
 *
 * Live generation is the honest path and stays the honest path: any telemetry
 * that has not been seen before still costs two minutes and real credits. But a
 * demo should never be one API hiccup away from an awkward silence, and the boss
 * name is part of the DNA, so a relic earned from the Ashen Warden cannot serve
 * a fight against the Hollow Sovereign.
 *
 * Three playstyles per boss covers the archetypes the game is built to
 * demonstrate: reckless fire, precise ice, measured storm. Anything outside them
 * still generates for real.
 *
 *   pnpm --filter @relic/api exec tsx scripts/precache-relics.ts [--boss N]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  buildRelicDNA,
  compileRelicPrompt,
  composeRelicName,
  HERO_GENERATION_CONFIG,
  relicCacheKey,
  type CombatTelemetry,
} from "@relic/core";
import { env } from "../src/env.js";
import { fetchBuffer, fetchBytes } from "../src/lib/fetchBytes.js";
import { getBalance } from "../src/services/meshy/meshy.balance.js";
import { createConceptImage } from "../src/services/meshy/meshy.image.js";
import { createMeshFromConceptTask } from "../src/services/meshy/meshy.imageTo3d.js";
import { waitForTask } from "../src/services/meshy/meshy.tasks.js";
import { optimizeGlb } from "../src/generation/optimizeGlb.js";
import { findByCacheKey, putRelic } from "../src/cache/fileCache.js";

/** Must match the ladder in apps/web/src/game/bosses.ts. */
const BOSSES = [
  "the Ashen Warden",
  "the Drowned Choir",
  "the Gilded Husk",
  "the Rootbound King",
  "the Hollow Sovereign",
];

/** The three archetypes: reckless, precise, measured. */
const PLAYSTYLES: { id: string; telemetry: CombatTelemetry }[] = [
  {
    id: "ember",
    telemetry: {
      affinity: "fire",
      damageDealt: 1000,
      damageTaken: 92,
      lightAttacks: 3,
      heavyAttacks: 14,
      finishingAttack: "heavy",
      healthRemaining: 8,
      dodges: 1,
      healingUsed: 0,
      fightDuration: 88,
    },
  },
  {
    id: "frost",
    telemetry: {
      affinity: "ice",
      damageDealt: 1000,
      damageTaken: 18,
      lightAttacks: 21,
      heavyAttacks: 2,
      finishingAttack: "light",
      healthRemaining: 82,
      dodges: 7,
      healingUsed: 0,
      fightDuration: 41,
    },
  },
  {
    id: "storm",
    telemetry: {
      affinity: "storm",
      damageDealt: 1000,
      damageTaken: 55,
      lightAttacks: 9,
      heavyAttacks: 9,
      finishingAttack: "ability",
      healthRemaining: 45,
      dodges: 3,
      healingUsed: 1,
      fightDuration: 62,
    },
  },
];

async function main() {
  const bossArg = process.argv.indexOf("--boss");
  const onlyBoss = bossArg === -1 ? null : Number(process.argv[bossArg + 1]);
  const bosses = onlyBoss ? [BOSSES[onlyBoss - 1]!] : BOSSES;

  const cfg = HERO_GENERATION_CONFIG;
  const startBalance = await getBalance();
  const jobs = bosses.length * PLAYSTYLES.length;

  console.log(`\nPre-caching ${jobs} relics (${bosses.length} bosses x ${PLAYSTYLES.length} playstyles)`);
  console.log(`  estimate ~${jobs * 62} credits (balance ${startBalance})\n`);

  let generated = 0;
  let skipped = 0;

  for (const boss of bosses) {
    for (const style of PLAYSTYLES) {
      const dna = buildRelicDNA(style.telemetry, boss);
      const name = composeRelicName(dna);
      const prompt = compileRelicPrompt(dna);
      const cacheKey = relicCacheKey(dna, cfg);
      const label = `${boss} / ${style.id}`;

      // Idempotent: re-running must not re-spend on relics already cached.
      if (await findByCacheKey(cacheKey)) {
        console.log(`skip  ${label} - already cached (${cacheKey})`);
        skipped++;
        continue;
      }

      const relicId = randomUUID();
      const dir = path.join(env.storageDir, "relics", relicId);
      await mkdir(dir, { recursive: true });

      try {
        console.log(`gen   ${label} - ${name} (${dna.element}/${dna.temperament}/${dna.condition})`);
        const conceptStart = Date.now();
        const conceptTaskId = await createConceptImage(prompt, { imageModel: cfg.imageModel });
        const concept = await waitForTask("text-to-image", conceptTaskId);
        const conceptUrl = concept.image_urls[0];
        if (!conceptUrl) throw new Error("no concept image");
        await writeFile(path.join(dir, "concept.png"), await fetchBuffer(conceptUrl));
        const conceptMs = Date.now() - conceptStart;

        const meshStart = Date.now();
        const meshTaskId = await createMeshFromConceptTask(conceptTaskId, {
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
        const meshMs = Date.now() - meshStart;

        const { data, stats } = await optimizeGlb(await fetchBytes(glbUrl));
        await writeFile(path.join(dir, "model.glb"), data);

        await putRelic({
          relicId,
          cacheKey,
          name,
          dna,
          status: "COMPLETE",
          prompt,
          generationMode: "hero",
          conceptUrl: `/assets/relics/${relicId}/concept.png`,
          modelUrl: `/assets/relics/${relicId}/model.glb`,
          conceptTaskId,
          meshTaskId,
          conceptMs,
          meshMs,
          optimizeMs: stats.ms,
          totalMs: conceptMs + meshMs,
          glbBytes: stats.bytesAfter,
          rawGlbBytes: stats.bytesBefore,
          cached: false,
          createdAt: Date.now(),
        });

        generated++;
        console.log(`  ok  ${name} - ${(stats.bytesAfter / 1048576).toFixed(2)} MB\n`);
      } catch (err) {
        console.error(`  !!  ${label} FAILED: ${(err as Error).message}\n`);
      }
    }
  }

  const endBalance = await getBalance();
  console.log(`Generated ${generated}, skipped ${skipped}.`);
  console.log(`Spent ${startBalance - endBalance} credits (balance ${endBalance}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
