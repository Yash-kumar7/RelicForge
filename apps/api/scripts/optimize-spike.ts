/** Runs the game-ready optimization pass over every spike GLB in place. */
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { env } from "../src/env.js";
import { optimizeGlb } from "../src/generation/optimizeGlb.js";

const root = path.join(env.storageDir, "spike");
const dirs = (await readdir(root, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const slug of dirs) {
  const file = path.join(root, slug, "model.glb");
  try {
    const before = await readFile(file);
    const { data, stats } = await optimizeGlb(before);
    await writeFile(file, data);
    console.log(
      `${slug.padEnd(14)} ${(stats.bytesBefore / 1048576).toFixed(2)} MB → ` +
        `${(stats.bytesAfter / 1048576).toFixed(2)} MB  (${stats.ms} ms)`,
    );
  } catch (e) {
    console.error(`${slug}: ${(e as Error).message}`);
  }
}
