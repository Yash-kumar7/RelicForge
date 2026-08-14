/**
 * Generates a model for every boss on the ladder.
 *
 * The PRD deliberately kept characters out of scope: at the time, credits were
 * finite and the risk was blurring the one moment that matters. Both have
 * changed — the pipeline is proven, credits are replenishable, and a boss built
 * from boxes undercuts a game whose whole argument is that generated 3D belongs
 * in the runtime.
 *
 * These are static meshes moved by code, exactly like the primitive boss was.
 * No rig, no clips: approach, telegraph and strike are whole-body transforms,
 * so a generated mesh drops straight into the same behaviour.
 *
 *   pnpm --filter @relic/api exec tsx scripts/generate-bosses.ts [--level N]
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

/**
 * The character composition contract.
 *
 * Different from the weapon one for a reason: a weapon needs tip-up framing so
 * the mesh arrives axis-aligned, while a character needs a front-on A-pose so
 * it arrives upright, symmetrical and facing the camera. The shared clauses are
 * the ones that keep the mesh clean — isolated subject, neutral background, and
 * absolutely no lettering.
 */
const CHARACTER_COMPOSITION = [
  "Full body character concept, standing upright and perfectly vertical,",
  "front view, symmetrical A-pose, arms slightly away from the body, feet together on the ground.",
  "Entire figure visible from head to feet, centered composition, nothing cropped.",
  "Isolated single character. Neutral flat background. No ground plane, no shadow, no environment.",
  "No text, no lettering, no words, no caption, no watermark, no logo, no signature.",
  "No weapons in hand. Strong readable silhouette. Production-quality game character art.",
].join(" ");

interface BossSpec {
  level: number;
  slug: string;
  subject: string;
}

const BOSSES: BossSpec[] = [
  {
    level: 1,
    slug: "ashen-warden",
    subject:
      "A colossal burnt stone sentinel in cracked blackened plate armour, molten orange fissures glowing through the cracks, heavy pauldrons, a horned helm with no face, ash falling from its shoulders",
  },
  {
    level: 2,
    slug: "drowned-choir",
    subject:
      "A tall drowned knight encrusted in barnacles and salt, waterlogged robes fused to corroded armour, many small pale mouths across its chest, a cage-like helm streaming seawater",
  },
  {
    level: 3,
    slug: "gilded-husk",
    subject:
      "An ornate gilded suit of ceremonial armour standing hollow and empty, gold filigree over dark lacquer, cracked porcelain mask, coins and chains hanging from its frame",
  },
  {
    level: 4,
    slug: "rootbound-king",
    subject:
      "An enormous armoured king overgrown with thick roots and bark, mossy stone crown fused into his skull, tree limbs bursting through his ribcage, immense and slow",
  },
  {
    level: 5,
    slug: "hollow-sovereign",
    subject:
      "A towering hollow monarch of black iron and void, tattered regal cloak, a crown of floating shards above an empty helm, violet light pouring from every seam",
  },
];

async function main() {
  const levelArg = process.argv.indexOf("--level");
  const only = levelArg === -1 ? null : Number(process.argv[levelArg + 1]);
  const targets = only ? BOSSES.filter((b) => b.level === only) : BOSSES;

  const cfg = HERO_GENERATION_CONFIG;
  const startBalance = await getBalance();
  const outRoot = path.join(env.storageDir, "bosses");
  await mkdir(outRoot, { recursive: true });

  console.log(`\nBoss models — ${targets.length} × (${cfg.imageModel} → meshy-7 + ultra)`);
  console.log(`  estimate ~${targets.length * 44} credits (balance ${startBalance})\n`);

  const results: Record<string, unknown>[] = [];

  for (const boss of targets) {
    const dir = path.join(outRoot, boss.slug);
    await mkdir(dir, { recursive: true });
    const prompt = `${boss.subject}. ${CHARACTER_COMPOSITION}`;

    try {
      console.log(`[${boss.level}] ${boss.slug} — concept…`);
      const conceptTaskId = await createConceptImage(prompt, { imageModel: cfg.imageModel });
      const concept = await waitForTask("text-to-image", conceptTaskId);
      const conceptUrl = concept.image_urls[0];
      if (!conceptUrl) throw new Error("no concept image");
      await writeFile(path.join(dir, "concept.png"), await fetchBuffer(conceptUrl));

      console.log(`[${boss.level}] ${boss.slug} — mesh…`);
      const meshTaskId = await createMeshFromConceptTask(conceptTaskId, {
        meshyModel: cfg.meshyModel,
        ultraMode: cfg.ultraMode,
        // Characters are viewed from further away than a held weapon, so they
        // can afford fewer triangles than a relic.
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
        level: boss.level,
        slug: boss.slug,
        prompt,
        conceptTaskId,
        meshTaskId,
        glbBytes: stats.bytesAfter,
        rawGlbBytes: stats.bytesBefore,
      };
      await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
      results.push(meta);
      console.log(
        `[${boss.level}] ${boss.slug} — ${(stats.bytesBefore / 1048576).toFixed(1)} MB → ` +
          `${(stats.bytesAfter / 1048576).toFixed(2)} MB\n`,
      );
    } catch (err) {
      console.error(`[${boss.level}] ${boss.slug} FAILED: ${(err as Error).message}\n`);
      results.push({ slug: boss.slug, level: boss.level, error: (err as Error).message });
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
