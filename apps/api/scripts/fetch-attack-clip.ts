/**
 * Pulls one already-generated attack clip down and saves it beside the walk and
 * idle for a boss.
 *
 * Separate from animate-characters.ts on purpose: that script *creates* the
 * animation, and creating costs three credits every time it runs. This one takes
 * a task that has already been paid for and only does the free half — fetch,
 * optimize, write, record the id — so recovering a download can never re-bill.
 *
 *   pnpm --filter @relic/api exec tsx scripts/fetch-attack-clip.ts <kind> <slug> <taskId>
 *
 * kind is "bosses" or "champions": both are rigged the same way and both now carry
 * an attack clip, so the only thing that differs is which tree it lands in.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAnimationTask } from "../src/services/meshy/meshy.rig.js";
import { optimizeRiggedGlb } from "../src/generation/optimizeGlb.js";

const [kind, slug, taskId] = process.argv.slice(2);
if (kind !== "bosses" && kind !== "champions") {
  console.error("usage: fetch-attack-clip.ts <bosses|champions> <slug> <animationTaskId>");
  process.exit(1);
}
if (!slug || !taskId) {
  console.error("usage: fetch-attack-clip.ts <bosses|champions> <slug> <animationTaskId>");
  process.exit(1);
}

/* Both trees carry the same files: storage is what the API serves from, assets is
   what the repo ships. The rig clips live in both, so this one does too. */
const TREES = [
  path.resolve(process.cwd(), "storage", kind, slug, "rig"),
  path.resolve(process.cwd(), "../../assets", kind, slug, "rig"),
];

const task = await getAnimationTask(taskId);
if (task.status !== "SUCCEEDED") throw new Error(`task ${taskId} is ${task.status}`);

const url = task.result?.animation_glb_url;
if (!url) throw new Error("animation task returned no glb url");

const res = await fetch(url);
if (!res.ok) throw new Error(`download failed: ${res.status}`);
const raw = Buffer.from(await res.arrayBuffer());

/*
 * Textures only, exactly as the rig and idle clips are treated.
 *
 * The standard optimizer welds and prunes, which is the surgery that breaks skin
 * weights and animation channels, so a skinned GLB gets the texture pass alone.
 */
const { data } = await optimizeRiggedGlb(raw);

for (const dir of TREES) {
  await writeFile(path.join(dir, "attack.glb"), data);
}

/* Recorded next to rigTaskId and idleTaskId, so the next person can tell what was
   paid for without reading a shell history. */
const recordPath = path.join(TREES[0]!, "rig.json");
const record = JSON.parse(await readFile(recordPath, "utf8")) as Record<string, unknown>;
await writeFile(recordPath, JSON.stringify({ ...record, attackTaskId: taskId }, null, 2));

console.log(
  `saved attack.glb ${(data.byteLength / 1024 / 1024).toFixed(2)}MB (from ${(raw.byteLength / 1024 / 1024).toFixed(2)}MB)`,
);
