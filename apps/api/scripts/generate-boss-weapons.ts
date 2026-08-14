/**
 * A weapon for each boss.
 *
 * The bosses were generated with "no weapons in hand" to keep the meshes clean,
 * which left them slamming their bodies at the player. Each now gets its own
 * armament, generated separately so it can be socketed rather than fused into
 * the body mesh.
 *
 * There is a thematic payoff too: the weapon a boss carries is made of the same
 * material the relic will be forged from, so what it swings at you foreshadows
 * what you take from it.
 *
 * Uses the WEAPON composition contract, not the character one: tip up, vertical,
 * axis-aligned, so normalizeRelic finds the grip exactly as it does for relics.
 *
 *   pnpm --filter @relic/api exec tsx scripts/generate-boss-weapons.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../src/env.js";
import { COMPOSITION_CONTRACT, HERO_GENERATION_CONFIG } from "@relic/core";
import { fetchBuffer, fetchBytes } from "../src/lib/fetchBytes.js";
import { getBalance } from "../src/services/meshy/meshy.balance.js";
import { createConceptImage } from "../src/services/meshy/meshy.image.js";
import { createMeshFromConceptTask } from "../src/services/meshy/meshy.imageTo3d.js";
import { waitForTask } from "../src/services/meshy/meshy.tasks.js";
import { optimizeGlb } from "../src/generation/optimizeGlb.js";

interface BossWeapon {
  /** Matches the boss directory slug so the client can find it. */
  slug: string;
  /** greatsword | spear | warhammer, for the grip heuristic. */
  weaponClass: "greatsword" | "spear" | "warhammer";
  subject: string;
}

const WEAPONS: BossWeapon[] = [
  {
    slug: "ashen-warden",
    weaponClass: "greatsword",
    subject:
      "A colossal executioner's greatsword of scorched black stone, oversized and slab-like, molten orange fissures glowing along its length, chipped and blunted from centuries of use",
  },
  {
    slug: "drowned-choir",
    weaponClass: "spear",
    subject:
      "A long barnacle-crusted harpoon of corroded green bronze, salt-pitted shaft, cruel backward-facing barbs, strands of kelp knotted below the head",
  },
  {
    slug: "gilded-husk",
    weaponClass: "spear",
    subject:
      "An ornate ceremonial gilded scepter-spear, dark lacquered shaft wound with gold filigree, a bladed sunburst head, small coins and chains hanging from the collar",
  },
  {
    slug: "rootbound-king",
    weaponClass: "warhammer",
    subject:
      "An enormous mossy stone maul, head bound in thick living roots and bark, immense and crude, damp earth packed into its seams",
  },
  {
    slug: "hollow-sovereign",
    weaponClass: "greatsword",
    subject:
      "A tall regal blade of black void-iron, impossibly thin, violet light bleeding from a fracture running its full length, a crown-like guard of floating shards",
  },
];

async function main() {
  const cfg = HERO_GENERATION_CONFIG;
  const startBalance = await getBalance();
  const outRoot = path.join(env.storageDir, "bosses");

  console.log(`\nBoss weapons - ${WEAPONS.length} x (${cfg.imageModel} -> meshy-7 + ultra)`);
  console.log(`  estimate ~${WEAPONS.length * 44} credits (balance ${startBalance})\n`);

  const results: Record<string, unknown>[] = [];

  for (const weapon of WEAPONS) {
    // Written into the boss's own directory, so a boss and its armament stay
    // together and the client needs no second index.
    const dir = path.join(outRoot, weapon.slug);
    await mkdir(dir, { recursive: true });
    const prompt = `${weapon.subject}. ${COMPOSITION_CONTRACT}`;

    try {
      console.log(`${weapon.slug} - concept...`);
      const conceptTaskId = await createConceptImage(prompt, { imageModel: cfg.imageModel });
      const concept = await waitForTask("text-to-image", conceptTaskId);
      const conceptUrl = concept.image_urls[0];
      if (!conceptUrl) throw new Error("no concept image");
      await writeFile(path.join(dir, "weapon-concept.png"), await fetchBuffer(conceptUrl));

      console.log(`${weapon.slug} - mesh...`);
      const meshTaskId = await createMeshFromConceptTask(conceptTaskId, {
        meshyModel: cfg.meshyModel,
        ultraMode: cfg.ultraMode,
        targetPolycount: 8_000,
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
      await writeFile(path.join(dir, "weapon.glb"), data);

      const meta = {
        slug: weapon.slug,
        weaponClass: weapon.weaponClass,
        prompt,
        conceptTaskId,
        meshTaskId,
        glbBytes: stats.bytesAfter,
      };
      await writeFile(path.join(dir, "weapon.json"), JSON.stringify(meta, null, 2));
      results.push(meta);
      console.log(
        `${weapon.slug} - ${(stats.bytesBefore / 1048576).toFixed(1)} MB -> ` +
          `${(stats.bytesAfter / 1048576).toFixed(2)} MB\n`,
      );
    } catch (err) {
      console.error(`${weapon.slug} FAILED: ${(err as Error).message}\n`);
      results.push({ slug: weapon.slug, error: (err as Error).message });
    }
  }

  const endBalance = await getBalance();
  console.log(`Spent ${startBalance - endBalance} credits (balance ${endBalance}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
