/**
 * Compresses the textures of every rigged and animated GLB in place.
 *
 * Rigged output ships around 6 MB where the static mesh is 1.8 MB, and the
 * difference is almost entirely texture. Geometry is left untouched: welding or
 * pruning a skinned mesh is how you silently break animation.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../src/env.js";
import { optimizeRiggedGlb } from "../src/generation/optimizeGlb.js";

let before = 0;
let after = 0;

for (const group of ["champions", "bosses"]) {
  const root = path.join(env.storageDir, group);
  let entries: string[];
  try {
    entries = (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    continue;
  }

  for (const slug of entries) {
    const rigDir = path.join(root, slug, "rig");
    let files: string[];
    try {
      files = (await readdir(rigDir)).filter((f) => f.endsWith(".glb"));
    } catch {
      continue;
    }

    for (const file of files) {
      const target = path.join(rigDir, file);
      try {
        const raw = await readFile(target);
        const { data, stats } = await optimizeRiggedGlb(raw);
        // Only keep the result if it actually helped; a re-run on already
        // compressed textures can otherwise grow the file.
        if (stats.bytesAfter < stats.bytesBefore) {
          await writeFile(target, data);
          before += stats.bytesBefore;
          after += stats.bytesAfter;
          console.log(
            `${group}/${slug}/${file}  ${(stats.bytesBefore / 1048576).toFixed(2)} -> ` +
              `${(stats.bytesAfter / 1048576).toFixed(2)} MB`,
          );
        } else {
          console.log(`${group}/${slug}/${file}  already compressed`);
        }
      } catch (err) {
        console.error(`${group}/${slug}/${file} FAILED: ${(err as Error).message}`);
      }
    }
  }
}

if (before > 0) {
  console.log(
    `\nTotal ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB ` +
      `(${Math.round((1 - after / before) * 100)}% smaller)`,
  );
}
