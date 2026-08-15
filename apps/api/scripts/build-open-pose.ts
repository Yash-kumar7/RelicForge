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
/**
 * A fighting stance, for the title screen face-off.
 *
 * The characters were generated in an A-pose because that is what a rig wants:
 * arms out, weight even, nothing overlapping. It is the correct pose to build a
 * skeleton from and the worst possible pose to sell a fight with, and the title
 * screen puts two of them opposite each other where standing still reads as two
 * catalogue photographs rather than an encounter.
 *
 * Editing rather than regenerating, for the same reason as the hands: the
 * character has to survive the change.
 */
const COMBAT_STANCE = [
  "Keep this exact character unchanged: same armour, same colours, same materials,",
  "same proportions, same camera distance, same lighting.",
  "Change two things only.",
  "First, the background becomes pure solid black, #000000, edge to edge,",
  "with no gradient, no vignette, no floor, no shadow and no backdrop of any kind.",
  "Second, the character is now in a low fighting stance,",
  "turned about thirty degrees to its left, weight forward on a bent front leg,",
  "shoulders squared and dropped, one arm raised and ready, braced to strike.",
  "Full body still visible from head to feet. Both hands empty, holding nothing.",
].join(" ");

const OPEN_HAND = [
  "Keep this exact character completely unchanged: same armour, same colours,",
  "same proportions, same pose, same camera, same lighting, same background.",
  "Change one thing only: the closed fist is now an open, relaxed hand with the",
  "fingers extended and hanging naturally, as if holding nothing.",
  "Both hands empty. No weapon, no object of any kind.",
].join(" ");

const DEFAULT_SLUGS = ["ember", "frost", "storm"];

/** Which live directory a slug's edited concept belongs beside. */
const KIND: Record<string, "champions" | "bosses"> = {
  ember: "champions",
  frost: "champions",
  storm: "champions",
  "ashen-warden": "bosses",
  "drowned-choir": "bosses",
  "gilded-husk": "bosses",
  "rootbound-king": "bosses",
  "hollow-sovereign": "bosses",
};

async function main(): Promise<void> {
  const slugs = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_SLUGS;
  const cfg = HERO_GENERATION_CONFIG;
  const balance = await getBalance();

  const imageOnlyEstimate = process.argv.includes("--image-only");
  console.log(`\nOpen-hand pose for ${slugs.length} characters, by editing their concepts`);
  console.log(`  ~${slugs.length * (imageOnlyEstimate ? 9 : 44)} credits (balance ${balance})\n`);

  /*
   * --image-only stops after the edit.
   *
   * The bosses need an open-handed portrait for the title screen and nothing
   * more: it is a backdrop, so there is no mesh to build and no rig to redo.
   * That is 9 credits each rather than 44.
   */
  const imageOnly = process.argv.includes("--image-only");

  /** --stance edits into a fighting pose instead of opening the hand. */
  const stance = process.argv.includes("--stance");
  const prompt = stance ? COMBAT_STANCE : OPEN_HAND;
  const outputName = stance ? "concept-stance.png" : "concept-open.png";

  for (const slug of slugs) {
    const dir = path.join(env.storageDir, KIND[slug] ?? "champions", slug);
    const regen = path.join(env.storageDir, "regen", slug, "concept.png");

    try {
      const source = await readFile(regen);
      const dataUri = `data:image/png;base64,${source.toString("base64")}`;

      console.log(`edit  ${slug}`);
      const editTaskId = await editConceptImage(prompt, dataUri, {
        imageModel: cfg.imageModel,
      });
      const edited = await waitForTask("image-to-image", editTaskId);
      const url = edited.image_urls[0];
      if (!url) throw new Error("no edited image");
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, outputName), await fetchBuffer(url));
      if (imageOnly) {
        console.log(`  ok  ${slug} - ${outputName}\n`);
        continue;
      }

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
