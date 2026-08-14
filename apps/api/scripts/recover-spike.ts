/**
 * Attaches to already-paid image-to-3d tasks and downloads their output.
 *
 * Exists because a client-side parse bug can kill the script while the task
 * keeps running server-side — the credits are spent either way, so recovery
 * beats regeneration.
 *
 *   pnpm --filter @relic/api exec tsx scripts/recover-spike.ts <taskId>:<slug> ...
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../src/env.js";
import { waitForTask } from "../src/services/meshy/meshy.tasks.js";

async function main() {
  const pairs = process.argv.slice(2).map((arg) => {
    const [taskId, slug] = arg.split(":");
    if (!taskId || !slug) throw new Error(`Expected <taskId>:<slug>, got "${arg}"`);
    return { taskId, slug };
  });

  if (pairs.length === 0) {
    console.error("Usage: recover-spike.ts <taskId>:<slug> [...]");
    process.exit(1);
  }

  const outRoot = path.join(env.storageDir, "spike");
  await mkdir(outRoot, { recursive: true });
  const results: Record<string, unknown>[] = [];

  for (const { taskId, slug } of pairs) {
    const dir = path.join(outRoot, slug);
    await mkdir(dir, { recursive: true });
    const startedAt = Date.now();

    try {
      console.log(`${slug} — attaching to ${taskId}…`);
      let lastPct = -1;
      const mesh = await waitForTask("image-to-3d", taskId, (t) => {
        const pct = Math.floor((t.progress ?? 0) / 10) * 10;
        if (pct > lastPct) {
          lastPct = pct;
          process.stdout.write(`  ${pct}%`);
        }
      });
      process.stdout.write("\n");

      const glbUrl = mesh.model_urls.glb;
      if (!glbUrl) throw new Error("no glb in model_urls");

      const bytes = await fetch(glbUrl).then((r) => r.arrayBuffer());
      await writeFile(path.join(dir, "model.glb"), Buffer.from(bytes));

      const meta = {
        slug,
        corpus: "core" as const,
        why: "recovered from paid task",
        meshTaskId: taskId,
        meshMs: Date.now() - startedAt,
        glbBytes: bytes.byteLength,
      };
      await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
      results.push(meta);
      console.log(`${slug} — ${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB saved\n`);
    } catch (err) {
      console.error(`${slug} — FAILED: ${(err as Error).message}\n`);
      results.push({ slug, error: (err as Error).message });
    }
  }

  await writeFile(path.join(outRoot, "wave-0.json"), JSON.stringify({ wave: 0, results }, null, 2));
  console.log(`Wrote ${outRoot}/wave-0.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
