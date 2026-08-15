/**
 * Builds a character's relaxed, open-hand mesh from one of its concept
 * candidates.
 *
 * The setup screen shows a champion with its hands empty until a weapon is
 * chosen, and a fist clenched around nothing looks as wrong as an open hand
 * wrapped around a sword. Every champion therefore needs two meshes, and for
 * most of them the open one is simply the pre-regeneration model.
 *
 * Ember is the exception. Its original had a cape hanging down the front, so
 * that file was deleted rather than kept, and falling back to the closed mesh
 * left it clenching at nothing while the other two relaxed. One of the concept
 * candidates from its reroll happened to be exactly the missing asset: no cape,
 * both hands open. The image was already paid for, so only the mesh is spent.
 *
 *   pnpm --filter @relic/api exec tsx scripts/build-open-variant.ts champions/ember 2
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { HERO_GENERATION_CONFIG } from "@relic/core";
import { env } from "../src/env.js";
import { fetchBytes } from "../src/lib/fetchBytes.js";
import { getBalance } from "../src/services/meshy/meshy.balance.js";
import { createMeshFromConceptTask } from "../src/services/meshy/meshy.imageTo3d.js";
import { waitForTask } from "../src/services/meshy/meshy.tasks.js";
import { optimizeGlb } from "../src/generation/optimizeGlb.js";

async function main(): Promise<void> {
  const [target, candidateArg] = process.argv.slice(2);
  if (!target || !candidateArg) {
    console.error("Usage: build-open-variant.ts <kind>/<slug> <candidate>");
    process.exit(1);
  }

  const slug = target.split("/")[1]!;
  const cfg = HERO_GENERATION_CONFIG;
  const balance = await getBalance();

  const { taskId } = JSON.parse(
    await readFile(
      path.join(env.storageDir, "regen", slug, "candidates", `${candidateArg}.json`),
      "utf8",
    ),
  ) as { taskId: string };

  console.log(`\n${target} open-hand variant from candidate ${candidateArg}`);
  console.log(`  ~35 credits (balance ${balance})\n`);

  const meshTaskId = await createMeshFromConceptTask(taskId, {
    meshyModel: cfg.meshyModel,
    ultraMode: cfg.ultraMode,
    targetPolycount: 10_000,
    enablePbr: cfg.enablePbr,
    targetFormats: cfg.targetFormats,
    shouldRemesh: true,
  });
  const mesh = await waitForTask("image-to-3d", meshTaskId);
  const glbUrl = mesh.model_urls.glb;
  if (!glbUrl) throw new Error("no glb");

  const { data, stats } = await optimizeGlb(await fetchBytes(glbUrl));
  const dir = path.join(env.storageDir, target);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "model-open.glb"), data);

  console.log(`  ok  ${target}/model-open.glb - ${(stats.bytesAfter / 1048576).toFixed(2)} MB`);
  console.log(`Spent ${balance - (await getBalance())} credits.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
