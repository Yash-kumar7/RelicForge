/**
 * Downloads any completed image-to-3d task into a given directory.
 *
 * Exists because a dropped stream used to abandon meshes whose credits were
 * already spent. waitForTask polls as a fallback now, but a generic recovery
 * path is still worth having: the task always outlives the process that started
 * it, so a crash, a restart or a Ctrl-C never has to cost a generation.
 *
 *   pnpm --filter @relic/api exec tsx scripts/recover-task.ts <taskId>=<relDir> ...
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../src/env.js";
import { fetchBytes } from "../src/lib/fetchBytes.js";
import { waitForTask } from "../src/services/meshy/meshy.tasks.js";
import { optimizeGlb } from "../src/generation/optimizeGlb.js";

const pairs = process.argv.slice(2).map((arg) => {
  const [taskId, relDir] = arg.split("=");
  if (!taskId || !relDir) throw new Error(`Expected <taskId>=<relDir>, got "${arg}"`);
  return { taskId, relDir };
});

if (pairs.length === 0) {
  console.error("Usage: recover-task.ts <taskId>=<relDir> [...]");
  process.exit(1);
}

for (const { taskId, relDir } of pairs) {
  const dir = path.join(env.storageDir, relDir);
  await mkdir(dir, { recursive: true });
  try {
    const task = await waitForTask("image-to-3d", taskId);
    const url = task.model_urls.glb;
    if (!url) throw new Error("no glb");
    const { data, stats } = await optimizeGlb(await fetchBytes(url));
    await writeFile(path.join(dir, "model.glb"), data);
    console.log(`${relDir} <- ${taskId}  ${(stats.bytesAfter / 1048576).toFixed(2)} MB`);
  } catch (err) {
    console.error(`${relDir} FAILED: ${(err as Error).message}`);
  }
}
