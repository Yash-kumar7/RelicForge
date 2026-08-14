/**
 * Fills the entire reachable relic space for one boss, so no fight on that rung
 * ever waits on a live generation.
 *
 * precache-relics.ts covers three archetypes per boss, which leaves most of the
 * space uncovered: a player whose fight lands anywhere outside reckless-fire,
 * precise-ice or measured-storm still pays 90 to 120 seconds. That is the right
 * trade for the deeper rungs, where a live forge is the proof the pipeline is
 * real. It is the wrong trade for the first fight, which is the one a reviewer
 * actually plays and the one that forms their impression of the whole thing.
 *
 * The space is small and fully enumerable. Element, temperament and condition
 * are the only DNA fields that reach the prompt, at three values each, so one
 * boss is exactly 27 relics. Weapon class is derived from temperament rather
 * than chosen, and achievement never reaches Meshy at all.
 *
 * DNA is constructed directly instead of being derived from synthetic
 * telemetry: the telemetry to DNA mapping is many to one, so hitting all 27
 * through it would mean reverse-engineering 27 plausible fights to reach a
 * space that can simply be listed.
 *
 *   pnpm --filter @relic/api exec tsx scripts/saturate-boss.ts --boss 1 [--dry]
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

const ELEMENTS: Element[] = ["fire", "ice", "lightning"];
const TEMPERAMENTS: Temperament[] = ["brutal", "balanced", "elegant"];
const CONDITIONS: Condition[] = ["pristine", "battle-worn", "shattered"];

/**
 * How many relics to forge at once.
 *
 * Meshy runs these server side, so the wall clock is almost entirely waiting.
 * Serially this is 22 jobs times two minutes, which is most of an hour of doing
 * nothing. Kept low anyway: a wide fan-out against a rate limit turns one slow
 * run into a run with failures scattered through it, and each failure here costs
 * real credits to retry.
 */
const CONCURRENCY = 3;

interface Job {
  dna: RelicDNA;
  name: string;
  prompt: string;
  cacheKey: string;
  label: string;
}

async function forge(job: Job, cfg: typeof HERO_GENERATION_CONFIG): Promise<boolean> {
  const relicId = randomUUID();
  const dir = path.join(env.storageDir, "relics", relicId);
  await mkdir(dir, { recursive: true });

  try {
    const conceptStart = Date.now();
    const conceptTaskId = await createConceptImage(job.prompt, { imageModel: cfg.imageModel });
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
      cacheKey: job.cacheKey,
      name: job.name,
      dna: job.dna,
      status: "COMPLETE",
      prompt: job.prompt,
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

    console.log(`  ok  ${job.label} - ${job.name}, ${(stats.bytesAfter / 1048576).toFixed(2)} MB`);
    return true;
  } catch (err) {
    console.error(`  !!  ${job.label} FAILED: ${(err as Error).message}`);
    return false;
  }
}

async function main(): Promise<void> {
  const bossArg = process.argv.indexOf("--boss");
  const level = bossArg === -1 ? 1 : Number(process.argv[bossArg + 1]);
  const dry = process.argv.includes("--dry");
  const boss = BOSSES[level - 1];
  if (!boss) throw new Error(`no boss at level ${level}`);

  const cfg = HERO_GENERATION_CONFIG;
  const jobs: Job[] = [];
  let cached = 0;

  for (const element of ELEMENTS) {
    for (const temperament of TEMPERAMENTS) {
      for (const condition of CONDITIONS) {
        const dna: RelicDNA = {
          // Derived, never chosen: weaponClassFor is the single source of this
          // mapping and a hand-picked class here would drift from it.
          weaponClass: temperament === "elegant" ? "spear" : "greatsword",
          element,
          temperament,
          condition,
          bossInfluence: boss,
          rarity: "legendary",
        };
        const cacheKey = relicCacheKey(dna, cfg);

        // Idempotent, so an interrupted run resumes without re-spending.
        if (await findByCacheKey(cacheKey)) {
          cached++;
          continue;
        }

        jobs.push({
          dna,
          name: composeRelicName(dna),
          prompt: compileRelicPrompt(dna),
          cacheKey,
          label: `${element}/${temperament}/${condition}`,
        });
      }
    }
  }

  const total = ELEMENTS.length * TEMPERAMENTS.length * CONDITIONS.length;
  const balance = await getBalance();
  console.log(`\n${boss} - ${cached}/${total} already cached, ${jobs.length} to forge`);
  console.log(`  ~${jobs.length * 62} credits, balance ${balance}\n`);

  if (dry) {
    for (const job of jobs) console.log(`  would forge ${job.label} - ${job.name}`);
    return;
  }
  if (jobs.length === 0) return;
  if (jobs.length * 62 > balance) throw new Error("not enough credits for a full run");

  let done = 0;
  let failed = 0;
  const queue = [...jobs];

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (;;) {
        const job = queue.shift();
        if (!job) return;
        console.log(`gen   ${job.label} (${++done}/${jobs.length})`);
        if (!(await forge(job, cfg))) failed++;
      }
    }),
  );

  const after = await getBalance();
  console.log(`\nForged ${jobs.length - failed}, failed ${failed}.`);
  console.log(`Spent ${balance - after} credits (balance ${after}).`);
  console.log(`${boss} now ${cached + jobs.length - failed}/${total} cached.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
