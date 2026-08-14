/**
 * Regenerates the missing concept images for the wave-0 spike shapes.
 *
 * Those three meshes came from the very first spike run, which crashed on a
 * schema bug. Recovery attached to the paid image-to-3d tasks and restored the
 * meshes, but the concept images belonged to separate text-to-image tasks whose
 * ids were never captured, so they were lost.
 *
 * These are therefore NOT the images that produced those meshes. Same prompt,
 * same model, new sample. That distinction is recorded in meta.json rather than
 * left to be assumed, because a concept presented as the input to a mesh it did
 * not produce is a quiet falsehood, and the normalization numbers in the README
 * depend on the corpus being described accurately.
 *
 *   pnpm --filter @relic/api exec tsx scripts/regen-spike-concepts.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../src/env.js";
import { HERO_GENERATION_CONFIG } from "@relic/core";
import { fetchBuffer } from "../src/lib/fetchBytes.js";
import { getBalance } from "../src/services/meshy/meshy.balance.js";
import { createConceptImage } from "../src/services/meshy/meshy.image.js";
import { waitForTask } from "../src/services/meshy/meshy.tasks.js";

/** Verbatim from spike-generate.ts, so the regeneration is the same request. */
const COMPOSITION = [
  "Designed as a functional fantasy game weapon.",
  "Single isolated weapon, full object visible, vertical orientation,",
  "tip pointing up, pommel down, three-quarter view, centered composition.",
  "No character. No hands. No environment. Neutral background.",
  "Strong readable silhouette. Production-quality game concept art.",
].join(" ");

const SHAPES = [
  {
    slug: "greatsword",
    subject: "a legendary two-handed greatsword, straight broad blade, dark steel",
  },
  {
    slug: "spear",
    subject: "a legendary spear, long slender shaft, narrow leaf-shaped point",
  },
  {
    slug: "warhammer",
    subject: "a legendary warhammer, heavy squared head, short thick haft",
  },
];

const startBalance = await getBalance();
console.log(`\nRegenerating ${SHAPES.length} spike concepts (balance ${startBalance})`);
console.log("These are fresh samples of the same prompt, not the originals.\n");

for (const shape of SHAPES) {
  const dir = path.join(env.storageDir, "spike", shape.slug);
  const prompt = `${shape.subject}. ${COMPOSITION}`;

  try {
    const taskId = await createConceptImage(prompt, {
      imageModel: HERO_GENERATION_CONFIG.imageModel,
    });
    const task = await waitForTask("text-to-image", taskId);
    const url = task.image_urls[0];
    if (!url) throw new Error("no image returned");
    await writeFile(path.join(dir, "concept.png"), await fetchBuffer(url));

    // Merge rather than overwrite: meta.json already carries the mesh's own
    // provenance, which this must not erase.
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(await readFile(path.join(dir, "meta.json"), "utf8")) as Record<string, unknown>;
    } catch {
      meta = { slug: shape.slug };
    }
    await writeFile(
      path.join(dir, "meta.json"),
      JSON.stringify(
        {
          ...meta,
          conceptPrompt: prompt,
          conceptTaskId: taskId,
          conceptRegenerated: true,
          conceptNote:
            "Illustrative. The original concept task id was lost when the first spike run crashed, so this is a fresh sample of the same prompt and did not produce the mesh beside it.",
        },
        null,
        2,
      ),
    );

    console.log(`${shape.slug} - ok`);
  } catch (err) {
    console.error(`${shape.slug} FAILED: ${(err as Error).message}`);
  }
}

const endBalance = await getBalance();
console.log(`\nSpent ${startBalance - endBalance} credits (balance ${endBalance}).`);
