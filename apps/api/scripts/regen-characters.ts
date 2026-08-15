/**
 * Regenerates every character with a closed weapon hand.
 *
 * The original characters were generated in an A-pose with open, relaxed hands,
 * and Meshy's rigging gives each hand a single bone with no fingers. The pose is
 * therefore baked into the mesh and nothing at runtime can close it, so a weapon
 * placed at the hand always reads as passing through spread fingers rather than
 * being held. A shaft through a closed fist reads as gripped; that is the whole
 * change.
 *
 * Runs in three stages so nothing expensive is spent on a pose that did not come
 * out, and so the live assets survive until the new ones are worth having:
 *
 *   --concepts   9 credits each. Writes storage/regen/<slug>/concept.png.
 *   --meshes     35 credits each. Reuses the concept task, so no re-upload.
 *   --promote    Free. Copies the new model over the live one, keeping a backup.
 *
 * Rigging is deliberately not here: rig-characters.ts already does it and reads
 * from the live directories, so it runs after --promote.
 *
 *   pnpm --filter @relic/api exec tsx scripts/regen-characters.ts --concepts
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
 * The pose clause, and the reason this run exists.
 *
 * Stated twice and from two directions, because "gripping a weapon" is the kind
 * of phrase an image model happily satisfies by drawing a weapon. The fist has
 * to be described as a shape, and the absence of anything in it has to be said
 * outright.
 */
const GRIP_POSE = [
  "The right hand is clenched into a tight closed fist, fingers curled fully into the palm,",
  "thumb wrapped across the front of the fingers, forearm angled slightly forward,",
  "shaped as if closed around a weapon haft but holding nothing at all.",
  "The left hand hangs open and relaxed.",
  "Both hands are empty. No weapon, no sword, no axe, no staff, no shield, no object of any kind.",
].join(" ");

/**
 * Otherwise identical to the contract the originals used, so the only variable
 * between the old characters and the new ones is the hand.
 */
const CHARACTER_COMPOSITION = [
  "Full body character concept, standing upright and perfectly vertical,",
  "front view, symmetrical A-pose, arms slightly away from the body, feet together on the ground.",
  "Entire figure visible from head to feet, centered composition, nothing cropped.",
  "Isolated single character. Neutral flat background. No ground plane, no shadow, no environment.",
  "No text, no lettering, no words, no caption, no watermark, no logo, no signature.",
  GRIP_POSE,
  "Strong readable silhouette. Production-quality game character art.",
].join(" ");

interface Character {
  slug: string;
  /** Which live directory this replaces. */
  kind: "champions" | "bosses";
  subject: string;
}

const CHARACTERS: Character[] = [
  {
    slug: "ember",
    kind: "champions",
    subject:
      "A battle-scarred human warrior in heavy blackened plate armour scorched by fire, glowing ember-orange cracks along the pauldrons and gauntlets, a torn crimson half-cape, close helm with a narrow visor slit, soot streaked across the breastplate",
  },
  {
    slug: "frost",
    kind: "champions",
    subject:
      "A lean agile human duelist in pale layered armour rimed with frost, sharp angular plates over a deep blue underlayer, long tattered white scarf, hooded helm with a pale glowing visor, ice crystals forming along the shoulders",
  },
  {
    slug: "storm",
    kind: "champions",
    subject:
      "A swift human skirmisher in dark segmented armour traced with amber lightning filaments, asymmetric shoulder guard, layered leather and metal, a crested helm with a glowing amber slit, arcs of static across the plating",
  },
  {
    slug: "ashen-warden",
    kind: "bosses",
    subject:
      "A colossal burnt stone sentinel in cracked blackened plate armour, molten orange fissures glowing through the cracks, heavy pauldrons, a horned helm with no face, ash falling from its shoulders",
  },
  {
    slug: "drowned-choir",
    kind: "bosses",
    subject:
      "A tall drowned knight encrusted in barnacles and salt, waterlogged robes fused to corroded armour, many small pale mouths across its chest, a cage-like helm streaming seawater",
  },
  {
    slug: "gilded-husk",
    kind: "bosses",
    subject:
      "An ornate gilded suit of ceremonial armour standing hollow and empty, gold filigree over dark lacquer, cracked porcelain mask, coins and chains hanging from its frame",
  },
  {
    slug: "rootbound-king",
    kind: "bosses",
    subject:
      "An enormous armoured king overgrown with thick roots and bark, mossy stone crown fused into his skull, tree limbs bursting through his ribcage, immense and slow",
  },
  {
    slug: "hollow-sovereign",
    kind: "bosses",
    subject:
      "A towering hollow monarch of black iron and void, tattered regal cloak, a crown of floating shards above an empty helm, violet light pouring from every seam",
  },
];

/** Bosses are lifted a little in the arena, so they carry more polygons. */
const POLYCOUNT = { champions: 10_000, bosses: 12_000 } as const;

const regenRoot = () => path.join(env.storageDir, "regen");

interface RegenMeta {
  slug: string;
  kind: Character["kind"];
  prompt: string;
  conceptTaskId: string;
  meshTaskId?: string;
  glbBytes?: number;
}

async function readMeta(slug: string): Promise<RegenMeta | null> {
  try {
    return JSON.parse(
      await readFile(path.join(regenRoot(), slug, "meta.json"), "utf8"),
    ) as RegenMeta;
  } catch {
    return null;
  }
}

async function concepts(): Promise<void> {
  const cfg = HERO_GENERATION_CONFIG;
  const balance = await getBalance();

  const onlyArg = process.argv.indexOf("--only");
  const only =
    onlyArg === -1 ? null : new Set((process.argv[onlyArg + 1] ?? "").split(",").filter(Boolean));

  /*
   * --candidates N generates several concepts for one character.
   *
   * The prompt asks for the right hand every time, and the image model does not
   * reliably honour it: seven of eight obeyed and Ember closed its left. Nothing
   * in a mesh or a rig distinguishes a fist from an open hand, so a wrong side
   * cannot be corrected afterwards, only re-rolled. Rolling once and hoping is
   * the expensive version of this; three cheap images and picking the one that
   * came out right is the cheap version, because the 35 credit mesh is only
   * spent after a human has looked.
   */
  const candidatesArg = process.argv.indexOf("--candidates");
  const candidates = candidatesArg === -1 ? 1 : Number(process.argv[candidatesArg + 1]) || 1;

  const targets = only ? CHARACTERS.filter((c) => only.has(c.slug)) : CHARACTERS;
  console.log(`\nConcepts for ${targets.length} characters x ${candidates}, closed weapon hand`);
  console.log(`  ~${targets.length * candidates * 9} credits (balance ${balance})\n`);

  if (candidates > 1) {
    for (const character of targets) {
      const dir = path.join(regenRoot(), character.slug, "candidates");
      await mkdir(dir, { recursive: true });
      const prompt = `${character.subject}. ${CHARACTER_COMPOSITION}`;

      for (let i = 1; i <= candidates; i++) {
        try {
          const taskId = await createConceptImage(prompt, { imageModel: cfg.imageModel });
          const concept = await waitForTask("text-to-image", taskId);
          const url = concept.image_urls[0];
          if (!url) throw new Error("no concept image");
          await writeFile(path.join(dir, `${i}.png`), await fetchBuffer(url));
          await writeFile(path.join(dir, `${i}.json`), JSON.stringify({ taskId }, null, 2));
          console.log(`  ok  ${character.slug} candidate ${i}`);
        } catch (err) {
          console.error(`  !!  ${character.slug} candidate ${i}: ${(err as Error).message}`);
        }
      }
    }
    console.log(`\nPick one, then rerun --concepts --only <slug> --pick <n>.`);
    console.log(`Spent ${balance - (await getBalance())} credits.`);
    return;
  }

  /*
   * --pick N adopts a candidate as the character's concept, so the mesh stage
   * uses it. Free: the task already exists and is chained by id.
   */
  const pickArg = process.argv.indexOf("--pick");
  if (pickArg !== -1) {
    const pick = Number(process.argv[pickArg + 1]);
    for (const character of targets) {
      const dir = path.join(regenRoot(), character.slug);
      const { taskId } = JSON.parse(
        await readFile(path.join(dir, "candidates", `${pick}.json`), "utf8"),
      ) as { taskId: string };
      await copyFile(path.join(dir, "candidates", `${pick}.png`), path.join(dir, "concept.png"));
      const meta = await readMeta(character.slug);
      await writeFile(
        path.join(dir, "meta.json"),
        JSON.stringify({ ...meta, conceptTaskId: taskId, meshTaskId: undefined }, null, 2),
      );
      console.log(`  ok  ${character.slug} adopted candidate ${pick}`);
    }
    return;
  }

  for (const character of targets) {
    const dir = path.join(regenRoot(), character.slug);
    await mkdir(dir, { recursive: true });

    // Idempotent, so a rerun after one failure does not re-spend on the rest.
    const existing = await readMeta(character.slug);
    if (existing?.conceptTaskId) {
      console.log(`skip  ${character.slug} - concept already generated`);
      continue;
    }

    const prompt = `${character.subject}. ${CHARACTER_COMPOSITION}`;
    try {
      const conceptTaskId = await createConceptImage(prompt, { imageModel: cfg.imageModel });
      const concept = await waitForTask("text-to-image", conceptTaskId);
      const url = concept.image_urls[0];
      if (!url) throw new Error("no concept image");
      await writeFile(path.join(dir, "concept.png"), await fetchBuffer(url));
      await writeFile(
        path.join(dir, "meta.json"),
        JSON.stringify(
          { slug: character.slug, kind: character.kind, prompt, conceptTaskId } satisfies RegenMeta,
          null,
          2,
        ),
      );
      console.log(`  ok  ${character.slug}`);
    } catch (err) {
      console.error(`  !!  ${character.slug}: ${(err as Error).message}`);
    }
  }

  console.log(`\nConcepts in ${regenRoot()}. Review them before running --meshes.`);
  console.log(`Spent ${balance - (await getBalance())} credits.`);
}

async function meshes(): Promise<void> {
  const cfg = HERO_GENERATION_CONFIG;
  const balance = await getBalance();
  const pending: RegenMeta[] = [];

  for (const character of CHARACTERS) {
    const meta = await readMeta(character.slug);
    if (!meta?.conceptTaskId) {
      console.log(`skip  ${character.slug} - no concept, run --concepts first`);
      continue;
    }
    if (meta.meshTaskId) {
      console.log(`skip  ${character.slug} - mesh already generated`);
      continue;
    }
    pending.push(meta);
  }

  console.log(`\nMeshes for ${pending.length} characters`);
  console.log(`  ~${pending.length * 35} credits (balance ${balance})\n`);

  for (const meta of pending) {
    const dir = path.join(regenRoot(), meta.slug);
    try {
      console.log(`gen   ${meta.slug}`);
      // Chained off the concept task, so the image never needs public hosting.
      const meshTaskId = await createMeshFromConceptTask(meta.conceptTaskId, {
        meshyModel: cfg.meshyModel,
        ultraMode: cfg.ultraMode,
        targetPolycount: POLYCOUNT[meta.kind],
        enablePbr: cfg.enablePbr,
        targetFormats: cfg.targetFormats,
        shouldRemesh: true,
      });
      const mesh = await waitForTask("image-to-3d", meshTaskId);
      const glbUrl = mesh.model_urls.glb;
      if (!glbUrl) throw new Error("no glb");

      const { data, stats } = await optimizeGlb(await fetchBytes(glbUrl));
      await writeFile(path.join(dir, "model.glb"), data);
      await writeFile(
        path.join(dir, "meta.json"),
        JSON.stringify({ ...meta, meshTaskId, glbBytes: stats.bytesAfter }, null, 2),
      );
      console.log(`  ok  ${meta.slug} - ${(stats.bytesAfter / 1048576).toFixed(2)} MB`);
    } catch (err) {
      console.error(`  !!  ${meta.slug}: ${(err as Error).message}`);
    }
  }

  console.log(`\nSpent ${balance - (await getBalance())} credits.`);
  console.log("Review the models, then --promote, then re-run rig-characters.ts.");
}

/**
 * Copies the new models over the live ones, keeping the previous one as an asset
 * rather than as a backup.
 *
 * The open-hand mesh is not dead weight, it is the other half of the feature. A
 * fist clenched around nothing looks as wrong as an open hand wrapped around a
 * sword, so the setup screen shows the relaxed character until a weapon is
 * chosen and the closed one once it is. Keeping it as model-open.glb means it is
 * served like any other asset instead of sitting beside the live file with an
 * extension nothing can load.
 */
async function promote(): Promise<void> {
  /*
   * --only ember,frost promotes a subset.
   *
   * The run is sequential and takes a quarter of an hour, and the setup screen
   * renders the unrigged model.glb directly, so a finished character can be seen
   * in game without waiting for the rest of the batch or for any rigging.
   */
  const onlyArg = process.argv.indexOf("--only");
  const only =
    onlyArg === -1 ? null : new Set((process.argv[onlyArg + 1] ?? "").split(",").filter(Boolean));

  let moved = 0;
  for (const character of CHARACTERS) {
    if (only && !only.has(character.slug)) continue;
    const from = path.join(regenRoot(), character.slug, "model.glb");
    const liveDir = path.join(env.storageDir, character.kind, character.slug);
    const to = path.join(liveDir, "model.glb");

    try {
      await mkdir(liveDir, { recursive: true });
      /*
       * Only the first promote captures the open-hand mesh.
       *
       * Promoting twice would copy the already-promoted fist over the top of it,
       * and the relaxed pose would be gone with no way back short of
       * regenerating it. Ember was promoted, re-rolled and promoted again, which
       * is exactly the sequence that would have destroyed it.
       */
      const open = path.join(liveDir, "model-open.glb");
      const haveOpen = await readFile(open).then(
        () => true,
        () => false,
      );
      if (!haveOpen) await copyFile(to, open).catch(() => undefined);
      await copyFile(from, to);
      await copyFile(
        path.join(regenRoot(), character.slug, "concept.png"),
        path.join(liveDir, "concept.png"),
      ).catch(() => undefined);
      moved++;
      console.log(`  ok  ${character.kind}/${character.slug}`);
    } catch (err) {
      console.error(`  !!  ${character.slug}: ${(err as Error).message}`);
    }
  }
  console.log(`\nPromoted ${moved}. Open-hand versions kept as model-open.glb.`);
  console.log("Rigs are now stale: re-run rig-characters.ts, then optimize-rigs.ts.");
}

async function main(): Promise<void> {
  if (process.argv.includes("--concepts")) return concepts();
  if (process.argv.includes("--meshes")) return meshes();
  if (process.argv.includes("--promote")) return promote();
  console.log("Pass one of --concepts, --meshes, --promote.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
