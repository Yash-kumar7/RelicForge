/**
 * Decimates already-paid spike meshes to a game-ready polycount.
 *
 *   pnpm --filter @relic/api exec tsx scripts/remesh-spike.ts <taskId>:<slug> ...
 *
 * meshy-7 without `should_remesh` returns 0.9M-3.1M triangle meshes (37-116 MB),
 * which no browser game can load. 5 credits per rescue beats ~44 to regenerate.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../src/env.js";
import { HERO_GENERATION_CONFIG } from "@relic/core";
import { getBalance } from "../src/services/meshy/meshy.balance.js";
import { createRemesh } from "../src/services/meshy/meshy.remesh.js";
import { waitForTask } from "../src/services/meshy/meshy.tasks.js";

async function main() {
  const pairs = process.argv.slice(2).map((arg) => {
    const [taskId, slug] = arg.split(":");
    if (!taskId || !slug) throw new Error(`Expected <taskId>:<slug>, got "${arg}"`);
    return { taskId, slug };
  });
  if (pairs.length === 0) {
    console.error("Usage: remesh-spike.ts <taskId>:<slug> [...]");
    process.exit(1);
  }

  const startBalance = await getBalance();
  console.log(`\nRemesh, ${pairs.length} meshes → ${HERO_GENERATION_CONFIG.targetPolycount} tris`);
  console.log(`  estimate: ~${pairs.length * 5} credits (balance ${startBalance})\n`);

  const outRoot = path.join(env.storageDir, "spike");
  const results: Record<string, unknown>[] = [];

  for (const { taskId, slug } of pairs) {
    const dir = path.join(outRoot, slug);
    await mkdir(dir, { recursive: true });
    try {
      console.log(`${slug}, remeshing…`);
      const remeshId = await createRemesh(taskId, {
        targetPolycount: HERO_GENERATION_CONFIG.targetPolycount,
        targetFormats: HERO_GENERATION_CONFIG.targetFormats,
      });
      const task = await waitForTask("image-to-3d", remeshId);
      const glbUrl = task.model_urls.glb;
      if (!glbUrl) throw new Error("remesh returned no glb");

      const bytes = await fetch(glbUrl).then((r) => r.arrayBuffer());
      await writeFile(path.join(dir, "model.glb"), Buffer.from(bytes));

      const meta = {
        slug,
        corpus: "core" as const,
        why: "meshy-7 ultra, remeshed to game-ready polycount",
        sourceTaskId: taskId,
        remeshTaskId: remeshId,
        glbBytes: bytes.byteLength,
      };
      await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
      results.push(meta);
      console.log(`${slug}, ${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB\n`);
    } catch (err) {
      console.error(`${slug}, FAILED: ${(err as Error).message}\n`);
      results.push({ slug, error: (err as Error).message });
    }
  }

  await writeFile(path.join(outRoot, "wave-0.json"), JSON.stringify({ wave: 0, results }, null, 2));
  const endBalance = await getBalance();
  console.log(`Spent ${startBalance - endBalance} credits (balance ${endBalance}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
