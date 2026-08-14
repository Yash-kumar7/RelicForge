/**
 * Generates the player character, one per affinity.
 *
 * First person means you never see your own body in the arena, which is why
 * the champion appears where it actually matters: on the affinity screen, where
 * you are deciding who to be, and in the loadout. Choosing "Ember" should show
 * you an ember champion rather than a word and an emoji.
 *
 *   pnpm --filter @relic/api exec tsx scripts/generate-champions.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../src/env.js";
import { HERO_GENERATION_CONFIG } from "@relic/core";
import { fetchBuffer, fetchBytes } from "../src/lib/fetchBytes.js";
import { getBalance } from "../src/services/meshy/meshy.balance.js";
import { createConceptImage } from "../src/services/meshy/meshy.image.js";
import { createMeshFromConceptTask } from "../src/services/meshy/meshy.imageTo3d.js";
import { waitForTask } from "../src/services/meshy/meshy.tasks.js";
import { optimizeGlb } from "../src/generation/optimizeGlb.js";

/** Same character contract the bosses use: upright, front-on, isolated, no text. */
const CHARACTER_COMPOSITION = [
  "Full body character concept, standing upright and perfectly vertical,",
  "front view, symmetrical A-pose, arms slightly away from the body, feet together on the ground.",
  "Entire figure visible from head to feet, centered composition, nothing cropped.",
  "Isolated single character. Neutral flat background. No ground plane, no shadow, no environment.",
  "No text, no lettering, no words, no caption, no watermark, no logo, no signature.",
  "No weapons in hand. Strong readable silhouette. Production-quality game character art.",
].join(" ");

const CHAMPIONS = [
  {
    slug: "ember",
    subject:
      "A battle-scarred human warrior in heavy blackened plate armour scorched by fire, glowing ember-orange cracks along the pauldrons and gauntlets, a torn crimson half-cape, close helm with a narrow visor slit, soot streaked across the breastplate",
  },
  {
    slug: "frost",
    subject:
      "A lean agile human duelist in pale layered armour rimed with frost, sharp angular plates over a deep blue underlayer, long tattered white scarf, hooded helm with a pale glowing visor, ice crystals forming along the shoulders",
  },
  {
    slug: "storm",
    subject:
      "A swift human skirmisher in dark segmented armour traced with amber lightning filaments, asymmetric shoulder guard, layered leather and metal, a crested helm with a glowing amber slit, arcs of static across the plating",
  },
];

async function main() {
  const cfg = HERO_GENERATION_CONFIG;
  const startBalance = await getBalance();
  const outRoot = path.join(env.storageDir, "champions");
  await mkdir(outRoot, { recursive: true });

  console.log(`\nChampions - ${CHAMPIONS.length} x (${cfg.imageModel} -> meshy-7 + ultra)`);
  console.log(`  estimate ~${CHAMPIONS.length * 44} credits (balance ${startBalance})\n`);

  const results: Record<string, unknown>[] = [];

  for (const champion of CHAMPIONS) {
    const dir = path.join(outRoot, champion.slug);
    await mkdir(dir, { recursive: true });
    const prompt = `${champion.subject}. ${CHARACTER_COMPOSITION}`;

    try {
      console.log(`${champion.slug} - concept...`);
      const conceptTaskId = await createConceptImage(prompt, { imageModel: cfg.imageModel });
      const concept = await waitForTask("text-to-image", conceptTaskId);
      const conceptUrl = concept.image_urls[0];
      if (!conceptUrl) throw new Error("no concept image");
      await writeFile(path.join(dir, "concept.png"), await fetchBuffer(conceptUrl));

      console.log(`${champion.slug} - mesh...`);
      const meshTaskId = await createMeshFromConceptTask(conceptTaskId, {
        meshyModel: cfg.meshyModel,
        ultraMode: cfg.ultraMode,
        targetPolycount: 10_000,
        enablePbr: cfg.enablePbr,
        targetFormats: cfg.targetFormats,
        shouldRemesh: true,
      });

      let last = -1;
      const mesh = await waitForTask("image-to-3d", meshTaskId, (t) => {
        const pct = Math.floor((t.progress ?? 0) / 25) * 25;
        if (pct > last) {
          last = pct;
          process.stdout.write(`  ${pct}%`);
        }
      });
      process.stdout.write("\n");

      const glbUrl = mesh.model_urls.glb;
      if (!glbUrl) throw new Error("no glb");

      const { data, stats } = await optimizeGlb(await fetchBytes(glbUrl));
      await writeFile(path.join(dir, "model.glb"), data);

      const meta = {
        slug: champion.slug,
        prompt,
        conceptTaskId,
        meshTaskId,
        glbBytes: stats.bytesAfter,
        rawGlbBytes: stats.bytesBefore,
      };
      await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
      results.push(meta);
      console.log(
        `${champion.slug} - ${(stats.bytesBefore / 1048576).toFixed(1)} MB -> ` +
          `${(stats.bytesAfter / 1048576).toFixed(2)} MB\n`,
      );
    } catch (err) {
      console.error(`${champion.slug} FAILED: ${(err as Error).message}\n`);
      results.push({ slug: champion.slug, error: (err as Error).message });
    }
  }

  await writeFile(path.join(outRoot, "index.json"), JSON.stringify({ results }, null, 2));
  const endBalance = await getBalance();
  console.log(`Spent ${startBalance - endBalance} credits (balance ${endBalance}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
