/**
 * Generates the arena's built objects: the forge, and one set piece per rung.
 *
 * The arena is primitives, which was the right call while the question was
 * whether any of this worked. The forge is where that stops being acceptable: it
 * is two boxes and a glowing panel, and it is the object the entire reveal
 * happens at, so it is in every victory shot and every frame of the demo that
 * matters.
 *
 * Same three stages as regen-characters.ts, and for the same reason: nothing
 * expensive is spent on a concept that did not come out, and the live assets
 * survive until the new ones are worth having.
 *
 *   --concepts   9 credits each. Writes storage/arena/<slug>/concept.png.
 *   --meshes     35 credits each. Chains off the concept task, so no re-upload.
 *   --promote    Free. Reports what is live; Fastify serves storage directly.
 *
 * Options: --only <slug,slug>  --candidates <n>  --pick <n>
 *
 *   pnpm --filter @relic/api exec tsx scripts/generate-arena.ts --concepts
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { HERO_GENERATION_CONFIG } from "@relic/core";
import { env } from "../src/env.js";
import { fetchBuffer, fetchBytes } from "../src/lib/fetchBytes.js";
import { getBalance } from "../src/services/meshy/meshy.balance.js";
import { createConceptImage } from "../src/services/meshy/meshy.image.js";
import { createMeshFromConceptTask } from "../src/services/meshy/meshy.imageTo3d.js";
import { waitForTask } from "../src/services/meshy/meshy.tasks.js";
import { optimizeGlb } from "../src/generation/optimizeGlb.js";

/**
 * The composition contract, and it is doing more work here than for a character.
 *
 * A prompt for a pillar invites an image of a temple containing pillars, which
 * is useless: image-to-3d would return a diorama, and the normalizer expects one
 * object standing upright with its base at the bottom. So the subject is stated
 * as a single isolated object, the ground is refused outright, and the framing is
 * fixed the same way it is for every relic.
 */
const ARENA_COMPOSITION = [
  "Single isolated object, one piece only, standing upright and perfectly vertical.",
  "Entire object visible from base to top, nothing cropped, centered composition, three-quarter view.",
  "Neutral flat dark background. No ground plane, no floor, no shadow, no environment, no room, no architecture behind it.",
  "No character, no figure, no hands, no creature.",
  "No text, no lettering, no words, no watermark, no logo, no signature.",
  "Strong readable silhouette. Production-quality game environment art.",
].join(" ");

interface ArenaPiece {
  slug: string;
  subject: string;
  /** Roughly how tall the real thing is, in metres, for the runtime scale. */
  metres: number;
}

const PIECES: ArenaPiece[] = [
  /*
   * One set piece per rung, standing around the edge of the arena.
   *
   * Not a ring of interchangeable pillars, which is what got deleted: those were
   * the same object repeated ten times and nothing about them said which fight
   * you were in. These are five different things. A player who has seen the
   * Choir's wreck cannot mistake it for the King's tree even with the colour
   * pulled out, which is the whole point.
   *
   * Each is placed a handful of times at different sizes and bearings, so a few
   * copies build a skyline rather than a fence.
   */
  {
    slug: "warden-arch",
    metres: 9,
    subject:
      "A colossal ruined stone archway, one side collapsed into rubble, blackened and scorched, deep fissures across the stonework glowing with molten orange rock from within, ash caked along every ledge",
  },
  {
    slug: "choir-wreck",
    metres: 10,
    subject:
      "The broken bow of a sunken wooden ship standing on end, hull planks splintered and encrusted with barnacles and pale salt, corroded iron fittings, tattered waterlogged rigging hanging from it, drowned and rotted",
  },
  {
    slug: "husk-screen",
    metres: 8.5,
    /*
     * Rewritten after the first attempt came back East-Asian: dragons, coin
     * strings, lotus scrollwork and a Noh mask. A lovely object, and a prop from
     * a different game. The other four rungs are an arch, a ship, a tree and a
     * spire, and all eight characters wear Western plate, so the vocabulary has
     * to be named explicitly rather than left to "ornate", which an image model
     * will happily resolve any way it likes.
     */
    subject:
      "A tall gothic cathedral altarpiece of dark stone and gold leaf, pointed lancet arches and carved stone tracery, rows of empty statue niches, a cracked white porcelain mask set into the centre panel, strings of gold coins hanging from its edges, guttered candle stubs along its base, European medieval, immaculate and symmetrical",
  },
  {
    slug: "king-tree",
    metres: 12,
    subject:
      "An enormous ancient dead tree, thick gnarled trunk splitting into bare twisted limbs, heavy roots buckling out of the ground at its base, bark cracked and mossy, stone rubble tangled in the roots",
  },
  {
    slug: "sovereign-spire",
    metres: 14,
    subject:
      "A tall shattered spire of black iron and dark stone, its upper half broken into floating fragments held suspended above the break, fine seams across the surface bleeding violet light, cold and monolithic",
  },
  {
    /*
     * A test, on one character, before this is done five times.
     *
     * Meshy's rigging rebuilds the mesh and re-poses it into an A-pose with the
     * hands opened, and the rig has one bone per hand and no fingers, so nothing
     * at runtime can close them. The closed fist exists only in the unrigged
     * mesh, which cannot walk.
     *
     * A gauntlet sat over the open hand is the remaining idea: cover the spread
     * fingers with a closed one. It is genuinely uncertain, because it has to sit
     * on a hand it was not modelled for and match armour it has never seen, so it
     * is generated for the Warden alone. If it works on the boss the player looks
     * at for an entire fight, it works; if it does not, one mesh is the whole
     * cost of finding out.
     */
    slug: "warden-fist",
    metres: 0.34,
    subject:
      "A single armoured gauntlet clenched into a tight fist, severed cleanly at the wrist with nothing behind it, fingers curled fully into the palm, thumb wrapped across the front of the fingers, a round opening through the grip where a weapon haft passes through, blackened scorched plate armour with glowing molten orange cracks between the plates, ash caked in the joints",
  },
  {
    /*
     * Not per boss: it is the one fixture that belongs to the game rather than to
     * a rung, and being the same object across all five is what makes it read as
     * the place relics come from.
     */
    slug: "forge",
    metres: 3.2,
    subject:
      "An ancient stone and blackened iron forge, a heavy squared furnace with a wide arched mouth full of white-hot coals, a thick anvil-like lip, iron banding and rivets, chains hanging at its sides, soot staining the stone above the opening",
  },
];

const POLYCOUNT = 12_000;

const arenaRoot = () => path.join(env.storageDir, "arena");

interface ArenaMeta {
  slug: string;
  metres: number;
  prompt: string;
  conceptTaskId: string;
  meshTaskId?: string;
  glbBytes?: number;
}

async function readMeta(slug: string): Promise<ArenaMeta | null> {
  try {
    return JSON.parse(
      await readFile(path.join(arenaRoot(), slug, "meta.json"), "utf8"),
    ) as ArenaMeta;
  } catch {
    return null;
  }
}

function targets(): ArenaPiece[] {
  const onlyArg = process.argv.indexOf("--only");
  if (onlyArg === -1) return PIECES;
  const only = new Set((process.argv[onlyArg + 1] ?? "").split(",").filter(Boolean));
  return PIECES.filter((piece) => only.has(piece.slug));
}

function numberFlag(flag: string, fallback: number): number {
  const at = process.argv.indexOf(flag);
  return at === -1 ? fallback : Number(process.argv[at + 1]) || fallback;
}

async function concepts(): Promise<void> {
  const cfg = HERO_GENERATION_CONFIG;
  const balance = await getBalance();
  const candidates = numberFlag("--candidates", 1);
  const list = targets();

  console.log(`\nConcepts for ${list.length} arena pieces x ${candidates}`);
  console.log(`  ~${list.length * candidates * 9} credits (balance ${balance})\n`);

  for (const piece of list) {
    const prompt = `${piece.subject}. ${ARENA_COMPOSITION}`;

    if (candidates > 1) {
      const dir = path.join(arenaRoot(), piece.slug, "candidates");
      await mkdir(dir, { recursive: true });
      for (let i = 1; i <= candidates; i++) {
        try {
          const taskId = await createConceptImage(prompt, { imageModel: cfg.imageModel });
          const concept = await waitForTask("text-to-image", taskId);
          const url = concept.image_urls[0];
          if (!url) throw new Error("no concept image");
          await writeFile(path.join(dir, `${i}.png`), await fetchBuffer(url));
          await writeFile(path.join(dir, `${i}.json`), JSON.stringify({ taskId }, null, 2));
          console.log(`  ok  ${piece.slug} candidate ${i}`);
        } catch (err) {
          console.error(`  !!  ${piece.slug} candidate ${i}: ${(err as Error).message}`);
        }
      }
      continue;
    }

    const dir = path.join(arenaRoot(), piece.slug);
    await mkdir(dir, { recursive: true });

    // Idempotent, so one failure does not re-spend on everything that worked.
    const existing = await readMeta(piece.slug);
    if (existing?.conceptTaskId) {
      console.log(`skip  ${piece.slug} - concept already generated`);
      continue;
    }

    try {
      const conceptTaskId = await createConceptImage(prompt, { imageModel: cfg.imageModel });
      const concept = await waitForTask("text-to-image", conceptTaskId);
      const url = concept.image_urls[0];
      if (!url) throw new Error("no concept image");
      await writeFile(path.join(dir, "concept.png"), await fetchBuffer(url));
      await writeFile(
        path.join(dir, "meta.json"),
        JSON.stringify(
          { slug: piece.slug, metres: piece.metres, prompt, conceptTaskId } satisfies ArenaMeta,
          null,
          2,
        ),
      );
      console.log(`  ok  ${piece.slug}`);
    } catch (err) {
      console.error(`  !!  ${piece.slug}: ${(err as Error).message}`);
    }
  }

  console.log(`\nConcepts in ${arenaRoot()}. Review before running --meshes.`);
  console.log(`Spent ${balance - (await getBalance())} credits.`);
}

/** Adopts a candidate as the piece's concept. Free: the task already exists. */
async function pick(): Promise<void> {
  const chosen = numberFlag("--pick", 1);
  for (const piece of targets()) {
    const dir = path.join(arenaRoot(), piece.slug);
    const { taskId } = JSON.parse(
      await readFile(path.join(dir, "candidates", `${chosen}.json`), "utf8"),
    ) as { taskId: string };
    await copyFile(path.join(dir, "candidates", `${chosen}.png`), path.join(dir, "concept.png"));
    await writeFile(
      path.join(dir, "meta.json"),
      JSON.stringify(
        {
          slug: piece.slug,
          metres: piece.metres,
          prompt: `${piece.subject}. ${ARENA_COMPOSITION}`,
          conceptTaskId: taskId,
        } satisfies ArenaMeta,
        null,
        2,
      ),
    );
    console.log(`  ok  ${piece.slug} adopted candidate ${chosen}`);
  }
}

async function meshes(): Promise<void> {
  const cfg = HERO_GENERATION_CONFIG;
  const balance = await getBalance();
  const pending: ArenaMeta[] = [];

  for (const piece of targets()) {
    const meta = await readMeta(piece.slug);
    if (!meta?.conceptTaskId) {
      console.log(`skip  ${piece.slug} - no concept, run --concepts first`);
      continue;
    }
    if (meta.meshTaskId) {
      console.log(`skip  ${piece.slug} - mesh already generated`);
      continue;
    }
    pending.push(meta);
  }

  console.log(`\nMeshes for ${pending.length} arena pieces`);
  console.log(`  ~${pending.length * 35} credits (balance ${balance})\n`);

  for (const meta of pending) {
    const dir = path.join(arenaRoot(), meta.slug);
    try {
      console.log(`gen   ${meta.slug}`);
      const meshTaskId = await createMeshFromConceptTask(meta.conceptTaskId, {
        meshyModel: cfg.meshyModel,
        ultraMode: cfg.ultraMode,
        targetPolycount: POLYCOUNT,
        enablePbr: cfg.enablePbr,
        targetFormats: cfg.targetFormats,
        // Without this, target_polycount is silently ignored on meshy-7.
        shouldRemesh: true,
      });
      const mesh = await waitForTask("image-to-3d", meshTaskId);
      const glbUrl = mesh.model_urls.glb;
      if (!glbUrl) throw new Error("no glb");

      const { data, stats } = await optimizeGlb(await fetchBytes(glbUrl));
      await writeFile(path.join(dir, "model.glb"), data);
      await writeFile(
        path.join(dir, "meta.json"),
        JSON.stringify({ ...meta, meshTaskId, glbBytes: data.byteLength }, null, 2),
      );
      console.log(
        `  ok  ${meta.slug} - ${(data.byteLength / 1024 / 1024).toFixed(2)}MB in ${stats.ms}ms`,
      );
    } catch (err) {
      console.error(`  !!  ${meta.slug}: ${(err as Error).message}`);
    }
  }

  console.log(`\nSpent ${balance - (await getBalance())} credits.`);
}

/**
 * Nothing to publish.
 *
 * Fastify already serves the storage directory at /assets, so the mesh is live
 * at /assets/arena/<slug>/model.glb the moment --meshes writes it. An earlier
 * version copied into web/public/assets, which looks equivalent and is not: vite
 * proxies /assets to the API, so a file in public under that prefix is shadowed
 * and never served.
 */
async function promote(): Promise<void> {
  for (const piece of targets()) {
    const meta = await readMeta(piece.slug);
    console.log(
      meta?.meshTaskId
        ? `  ok  ${piece.slug} - live at /assets/arena/${piece.slug}/model.glb`
        : `skip  ${piece.slug} - no mesh yet`,
    );
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--pick")) return pick();
  if (process.argv.includes("--concepts")) return concepts();
  if (process.argv.includes("--meshes")) return meshes();
  if (process.argv.includes("--promote")) return promote();
  console.log("Pass one of --concepts, --meshes, --promote. --pick adopts a candidate.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
