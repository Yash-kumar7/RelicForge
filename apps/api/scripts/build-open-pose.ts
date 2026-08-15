/**
 * Builds each champion's relaxed, open-hand mesh by editing its own concept.
 *
 * The setup screen wants two poses: hands empty before a weapon is chosen, a
 * closed fist around it after. The obvious way to get the second pose is to
 * generate it, and that does not work. Two text-to-image runs from one prompt
 * return two different characters, differing in armour detail, proportion and
 * lighting, so swapping between them reads as the champion being replaced
 * rather than relaxing. That mistake cost a mesh before it was obvious.
 *
 * Editing the chosen concept keeps the character and changes only the hand,
 * which is the whole point of image-to-image over text-to-image here.
 *
 *   pnpm --filter @relic/api exec tsx scripts/build-open-pose.ts [slug ...]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { HERO_GENERATION_CONFIG } from "@relic/core";
import { env } from "../src/env.js";
import { fetchBuffer, fetchBytes } from "../src/lib/fetchBytes.js";
import { getBalance } from "../src/services/meshy/meshy.balance.js";
import { editConceptImage } from "../src/services/meshy/meshy.image.js";
import { createMeshFromConceptTask } from "../src/services/meshy/meshy.imageTo3d.js";
import { waitForTask } from "../src/services/meshy/meshy.tasks.js";
import { optimizeGlb } from "../src/generation/optimizeGlb.js";

/**
 * Only the hand changes.
 *
 * Everything else is named as unchanged on purpose. An edit prompt that
 * describes only the difference invites the model to reinterpret the rest, and
 * the entire reason for editing rather than regenerating is that the rest must
 * not move.
 */
const OPEN_HAND = [
  "Keep this exact character completely unchanged: same armour, same colours,",
  "same proportions, same pose, same camera, same lighting, same background.",
  "Change one thing only: the closed fist is now an open, relaxed hand with the",
  "fingers extended and hanging naturally, as if holding nothing.",
  "Both hands empty. No weapon, no object of any kind.",
].join(" ");

const DEFAULT_SLUGS = ["ember", "frost", "storm"];

async function main(): Promise<void> {
  const slugs = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_SLUGS;
  const cfg = HERO_GENERATION_CONFIG;
  const balance = await getBalance();

  console.log(`\nOpen-hand pose for ${slugs.length} champions, by editing their concepts`);
  console.log(`  ~${slugs.length * 44} credits (balance ${balance})\n`);

  for (const slug of slugs) {
    const dir = path.join(env.storageDir, "champions", slug);
    const regen = path.join(env.storageDir, "regen", slug, "concept.png");

    try {
      const source = await readFile(regen);
      const dataUri = `data:image/png;base64,${source.toString("base64")}`;

      console.log(`edit  ${slug}`);
      const editTaskId = await editConceptImage(OPEN_HAND, dataUri, {
        imageModel: cfg.imageModel,
      });
      const edited = await waitForTask("image-to-image", editTaskId);
      const url = edited.image_urls[0];
      if (!url) throw new Error("no edited image");
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "concept-open.png"), await fetchBuffer(url));

      console.log(`mesh  ${slug}`);
      const meshTaskId = await createMeshFromConceptTask(editTaskId, {
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
      await writeFile(path.join(dir, "model-open.glb"), data);
      console.log(`  ok  ${slug} - ${(stats.bytesAfter / 1048576).toFixed(2)} MB\n`);
    } catch (err) {
      console.error(`  !!  ${slug}: ${(err as Error).message}\n`);
    }
  }

  console.log(`Spent ${balance - (await getBalance())} credits.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
