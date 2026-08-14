/**
 * Gate 1 — gameplay legibility.
 *
 * Gate 0 proved the geometry can be equipped. This asks the product question:
 * do two maximally-separated fights actually yield visually different weapons?
 * If meshy-7 returns two generic fantasy blades differing mainly in hue, the
 * central claim of RelicForge collapses regardless of pipeline quality.
 *
 * Runs the real compileRelicPrompt output through the real hero config, so a
 * pass here is evidence about the shipping pipeline, not about a hand-tuned
 * prompt that only exists in a script.
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
import { getBalance } from "../src/services/meshy/meshy.balance.js";
import { createConceptImage } from "../src/services/meshy/meshy.image.js";
import { createMeshFromConceptTask } from "../src/services/meshy/meshy.imageTo3d.js";
import { waitForTask } from "../src/services/meshy/meshy.tasks.js";
import { optimizeGlb } from "../src/generation/optimizeGlb.js";

const BOSS = "the Ashen Warden";

/** Two runs against the same boss, fought as differently as the game allows. */
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
  const cfg = HERO_GENERATION_CONFIG;
  const startBalance = await getBalance();
  const outRoot = path.join(env.storageDir, "gate1");
  await mkdir(outRoot, { recursive: true });

  console.log(`\nGate 1 — visual differentiation`);
  console.log(`  config:  ${cfg.imageModel} → ${cfg.meshyModel}${cfg.ultraMode ? " + ultra" : ""}`);
  console.log(`  balance: ${startBalance}\n`);

  const results: Record<string, unknown>[] = [];

  for (const run of RUNS) {
    const dna = buildRelicDNA(run.telemetry, BOSS);
    const name = composeRelicName(dna);
    const prompt = compileRelicPrompt(dna);
    const cacheKey = relicCacheKey(dna, cfg);
    const dir = path.join(outRoot, run.id);
    await mkdir(dir, { recursive: true });

    console.log(`── ${run.id.toUpperCase()} ──`);
    console.log(`  name:  ${name}`);
    console.log(`  dna:   ${dna.element}/${dna.temperament}/${dna.condition}/${dna.weaponClass}`);
    console.log(`  key:   ${cacheKey}`);

    try {
      const conceptStart = Date.now();
      const conceptTaskId = await createConceptImage(prompt, { imageModel: cfg.imageModel });
      const concept = await waitForTask("text-to-image", conceptTaskId);
      const conceptUrl = concept.image_urls[0];
      if (!conceptUrl) throw new Error("no concept image");
      const conceptMs = Date.now() - conceptStart;
      await writeFile(
        path.join(dir, "concept.png"),
        Buffer.from(await fetch(conceptUrl).then((r) => r.arrayBuffer())),
      );
      console.log(`  concept ok (${(conceptMs / 1000).toFixed(1)}s)`);

      const meshStart = Date.now();
      const meshTaskId = await createMeshFromConceptTask(conceptTaskId, {
        meshyModel: cfg.meshyModel,
        ultraMode: cfg.ultraMode,
        targetPolycount: cfg.targetPolycount,
        enablePbr: cfg.enablePbr,
        targetFormats: cfg.targetFormats,
        shouldRemesh: cfg.shouldRemesh,
      });
      let lastPct = -1;
      const mesh = await waitForTask("image-to-3d", meshTaskId, (t) => {
        const pct = Math.floor((t.progress ?? 0) / 20) * 20;
        if (pct > lastPct) {
          lastPct = pct;
          process.stdout.write(`  ${pct}%`);
        }
      });
      process.stdout.write("\n");
      const glbUrl = mesh.model_urls.glb;
      if (!glbUrl) throw new Error("no glb");
      const meshMs = Date.now() - meshStart;

      const raw = new Uint8Array(await fetch(glbUrl).then((r) => r.arrayBuffer()));
      const { data, stats } = await optimizeGlb(raw);
      await writeFile(path.join(dir, "model.glb"), data);

      const meta = {
        slug: run.id,
        corpus: "core" as const,
        why: `${dna.element}/${dna.temperament}/${dna.condition}`,
        name,
        dna,
        prompt,
        cacheKey,
        conceptTaskId,
        meshTaskId,
        conceptMs,
        meshMs,
        glbBytes: stats.bytesAfter,
        rawGlbBytes: stats.bytesBefore,
      };
      await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
      results.push(meta);

      console.log(
        `  mesh ok (${(meshMs / 1000).toFixed(1)}s) — ` +
          `${(stats.bytesBefore / 1048576).toFixed(1)} MB → ${(stats.bytesAfter / 1048576).toFixed(2)} MB\n`,
      );
    } catch (err) {
      console.error(`  FAILED: ${(err as Error).message}\n`);
      results.push({ slug: run.id, error: (err as Error).message });
    }
  }

  await writeFile(path.join(outRoot, "gate1.json"), JSON.stringify({ results }, null, 2));
  const endBalance = await getBalance();
  console.log(`Spent ${startBalance - endBalance} credits (balance ${endBalance}).`);
  console.log(`Compare side by side at http://localhost:5173/#/gate1\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
