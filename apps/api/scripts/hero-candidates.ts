/**
 * Generates several attempts at each hero relic so the best can be kept.
 *
 * meshy-7 varies meaningfully run to run, and the two hero weapons appear in
 * every frame of the demo and every screenshot. Regenerating the same DNA and
 * picking the best result is the cheapest quality lever left: the prompt, the
 * pipeline and the normalizer are all already fixed, so the only variable is
 * which sample you happened to get.
 *
 * Candidates land in storage/candidates/<run>/<n>/ rather than the live cache.
 * Nothing is promoted automatically: choosing is a human judgement about how a
 * weapon reads, which is exactly the thing a heuristic should not decide.
 *
 *   pnpm --filter @relic/api exec tsx scripts/hero-candidates.ts [--count 4]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../src/env.js";
import {
  buildRelicDNA,
  compileRelicPrompt,
  composeRelicName,
  HERO_GENERATION_CONFIG,
  relicCacheKey,
  type CombatTelemetry,
} from "@relic/core";
import { fetchBuffer, fetchBytes } from "../src/lib/fetchBytes.js";
import { getBalance } from "../src/services/meshy/meshy.balance.js";
import { createConceptImage } from "../src/services/meshy/meshy.image.js";
import { createMeshFromConceptTask } from "../src/services/meshy/meshy.imageTo3d.js";
import { waitForTask } from "../src/services/meshy/meshy.tasks.js";
import { optimizeGlb } from "../src/generation/optimizeGlb.js";

const BOSS = "the Ashen Warden";

/** The two runs the comparison shot is built from. */
const RUNS: { id: string; telemetry: CombatTelemetry }[] = [
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
];

async function main() {
  const countArg = process.argv.indexOf("--count");
  const count = countArg === -1 ? 4 : Math.max(1, Number(process.argv[countArg + 1]));

  const cfg = HERO_GENERATION_CONFIG;
  const startBalance = await getBalance();
  const outRoot = path.join(env.storageDir, "candidates");
  await mkdir(outRoot, { recursive: true });

  // Concept candidate selection is a pipeline feature; here each attempt is
  // deliberately a single concept, so the variation being sampled is the mesh.
  const perAttempt = 9 + 35;
  console.log(`\nHero candidates - ${RUNS.length} runs x ${count} attempts`);
  console.log(`  estimate ~${RUNS.length * count * perAttempt} credits (balance ${startBalance})\n`);

  for (const run of RUNS) {
    const dna = buildRelicDNA(run.telemetry, BOSS);
    const name = composeRelicName(dna);
    const prompt = compileRelicPrompt(dna);
    const cacheKey = relicCacheKey(dna, cfg);

    console.log(`== ${run.id.toUpperCase()} - ${name} (${cacheKey}) ==`);
    console.log(`   ${dna.element}/${dna.temperament}/${dna.condition}/${dna.weaponClass}\n`);

    for (let attempt = 1; attempt <= count; attempt++) {
      const dir = path.join(outRoot, run.id, String(attempt));
      await mkdir(dir, { recursive: true });
      const label = `[${run.id} ${attempt}/${count}]`;

      try {
        const conceptTaskId = await createConceptImage(prompt, { imageModel: cfg.imageModel });
        const concept = await waitForTask("text-to-image", conceptTaskId);
        const conceptUrl = concept.image_urls[0];
        if (!conceptUrl) throw new Error("no concept image");
        await writeFile(path.join(dir, "concept.png"), await fetchBuffer(conceptUrl));

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

        const { data, stats } = await optimizeGlb(await fetchBytes(glbUrl));
        await writeFile(path.join(dir, "model.glb"), data);
        await writeFile(
          path.join(dir, "meta.json"),
          JSON.stringify(
            { run: run.id, attempt, name, dna, prompt, cacheKey, conceptTaskId, meshTaskId,
              glbBytes: stats.bytesAfter },
            null,
            2,
          ),
        );
        console.log(`${label} ok - ${(stats.bytesAfter / 1048576).toFixed(2)} MB`);
      } catch (err) {
        console.error(`${label} FAILED: ${(err as Error).message}`);
      }
    }
    console.log("");
  }

  const endBalance = await getBalance();
  console.log(`Spent ${startBalance - endBalance} credits (balance ${endBalance}).`);
  console.log(`Compare the concepts in ${outRoot}, then copy the winner over the`);
  console.log(`matching entry in storage/gate1/ and re-run seed-hero-relics.ts.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
