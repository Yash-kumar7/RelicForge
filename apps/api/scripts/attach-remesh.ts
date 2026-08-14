import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../src/env.js";
import { waitForTask } from "../src/services/meshy/meshy.tasks.js";
import { getBalance } from "../src/services/meshy/meshy.balance.js";

const pairs = [
  ["019fef32-f5d4-7d74-999a-65eb49b300bf", "greatsword"],
  ["019fef33-5e97-7b58-96cd-c3052c646d07", "spear"],
  ["019fef34-6fa5-7b71-b7d7-67b82be15391", "warhammer"],
] as const;

const outRoot = path.join(env.storageDir, "spike");
const results: Record<string, unknown>[] = [];
const WHY: Record<string, string> = {
  greatsword: "baseline",
  spear: "extreme aspect ratio",
  warhammer: "mass at one end, weak axis dominance",
};

for (const [taskId, slug] of pairs) {
  const dir = path.join(outRoot, slug);
  await mkdir(dir, { recursive: true });
  try {
    const t = await waitForTask("remesh", taskId);
    const url = t.model_urls.glb;
    if (!url) throw new Error("no glb");
    const bytes = await fetch(url).then((r) => r.arrayBuffer());
    await writeFile(path.join(dir, "model.glb"), Buffer.from(bytes));
    const meta = { slug, corpus: "core", why: WHY[slug], remeshTaskId: taskId, glbBytes: bytes.byteLength };
    await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    results.push(meta);
    console.log(`${slug}: ${(bytes.byteLength / 1048576).toFixed(2)} MB`);
  } catch (e) {
    console.error(`${slug}: ${(e as Error).message}`);
    results.push({ slug, error: (e as Error).message });
  }
}
await writeFile(path.join(outRoot, "wave-0.json"), JSON.stringify({ wave: 0, results }, null, 2));
console.log("balance", await getBalance());
