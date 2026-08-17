import { mkdir, copyFile, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, textureCompress, TextureResizeFilter } from "@gltf-transform/functions";
import sharp from "sharp";

/**
 * Builds the committed asset bundle from the generated originals.
 *
 * Everything this game shows was generated once and downloaded to storage, and
 * storage is four hundred megabytes that cannot go in a repository. So the state
 * a fresh clone starts in is the state where every character, boss and arena is
 * a 404 — which is also the first thing a reviewer sees, and it is the whole
 * game missing.
 *
 * The fix is not to commit storage. Most of storage is not runtime content: the
 * spike corpus the normalizer was validated against, concept art at every stage,
 * open-hand meshes that were superseded, and every relic ever generated. What
 * the game actually requests is sixty files, and at their generated size they
 * are still too heavy to commit.
 *
 * So they are re-encoded. Meshy returns three 2048x2048 maps per character,
 * which is correct for a hero asset inspected up close and four times more than
 * anything here needs: a champion renders about a third of the screen tall and a
 * boss is usually further away. At 1024 the difference is not visible at any
 * distance this game uses, the files fall by roughly three quarters, and GPU
 * memory falls with them — 67MB of texture per character becomes 17MB, which is
 * a bigger deal than the disk saving on a machine running two characters, an
 * arena and a relic at once.
 *
 * Geometry is left alone. Draco would roughly halve what is left, and it needs a
 * decoder wired into the loader at runtime, usually fetched from a CDN. Trading
 * a size win for a new way to fail to load a model is the wrong trade in a
 * project whose problem was models failing to load.
 *
 * Originals are never touched. This reads from storage and writes to assets/,
 * and if the output is ever wrong the answer is to delete assets/ and run it
 * again.
 */

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..", "..");
const SOURCE = join(ROOT, "apps", "api", "storage");
const DEST = join(ROOT, "assets");

/** Every file the web app asks for, and nothing else. */
function manifestFor(kind: "champions" | "bosses" | "arena", slug: string): string[] {
  if (kind === "champions") {
    return [
      `champions/${slug}/model.glb`,
      // The open-hand mesh is still shown in champion preview.
      `champions/${slug}/model-open.glb`,
      `champions/${slug}/rig/walking.glb`,
      `champions/${slug}/rig/idle.glb`,
    ];
  }
  if (kind === "bosses") {
    return [
      `bosses/${slug}/model.glb`,
      `bosses/${slug}/weapon.glb`,
      `bosses/${slug}/rig/walking.glb`,
      `bosses/${slug}/rig/idle.glb`,
      `bosses/${slug}/concept.png`,
    ];
  }
  return [`arena/${slug}/model.glb`];
}

/** Only the fields the showcase needs to name and place a relic. */
interface ShowcaseRecord {
  status?: string;
  modelUrl?: string;
  dna?: { bossInfluence?: string; element?: string };
  [key: string]: unknown;
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** Re-encodes one GLB. Returns bytes before and after. */
async function shrink(from: string, to: string): Promise<[number, number]> {
  const before = (await stat(from)).size;
  const doc = await io.read(from);

  await doc.transform(
    dedup(),
    prune(),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      resize: [1024, 1024],
      /* Only shrink. A map already at or below 1024 is left as it is rather
         than resampled to no purpose. */
      resizeFilter: TextureResizeFilter.LANCZOS3,
    }),
  );

  await mkdir(dirname(to), { recursive: true });
  await io.write(to, doc);
  return [before, (await stat(to)).size];
}

async function slugsIn(kind: string): Promise<string[]> {
  const dir = join(SOURCE, kind);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function main(): Promise<void> {
  if (!existsSync(SOURCE)) {
    console.error(
      `No generated assets at ${relative(ROOT, SOURCE)}. This script bundles what generation produced; run the generation scripts first.`,
    );
    process.exitCode = 1;
    return;
  }

  /*
   * Models only.
   *
   * Generation also writes an index.json and a meta.json beside each asset,
   * holding the compiled prompt and the Meshy task IDs that produced it. Nothing
   * at runtime reads either — the only index.json this codebase loads is the
   * relic cache's own — so they are generation records, and a bundle meant to be
   * committed should carry what the game requests and not what the pipeline
   * happened to leave next to it.
   */
  const wanted: string[] = [];
  for (const kind of ["champions", "bosses", "arena"] as const) {
    for (const slug of await slugsIn(kind)) wanted.push(...manifestFor(kind, slug));
  }

  let before = 0;
  let after = 0;
  let copied = 0;
  const missing: string[] = [];

  for (const rel of wanted) {
    const from = join(SOURCE, rel);
    const to = join(DEST, rel);

    if (!existsSync(from)) {
      missing.push(rel);
      continue;
    }

    if (rel.endsWith(".glb")) {
      const [was, is] = await shrink(from, to);
      before += was;
      after += is;
      console.log(`  ${rel}  ${(was / 1e6).toFixed(2)}MB → ${(is / 1e6).toFixed(2)}MB`);
    } else {
      await mkdir(dirname(to), { recursive: true });
      await copyFile(from, to);
      const size = (await stat(to)).size;
      before += size;
      after += size;
    }
    copied += 1;
  }

  /*
   * One relic per boss, and the cache entries that make them real.
   *
   * The title screen is built out of a relic. The champion on the left comes
   * from its element, the boss behind it from what it was forged from, and the
   * weapon turns in the middle — all three read off one record. So a deployment
   * with an empty relic cache does not get a plainer title screen, it gets an
   * empty one, and a fresh deploy is exactly that: relics are generated at
   * runtime and the cache is not committed.
   *
   * Five relics, one per rung, chosen for what they demonstrate rather than for
   * being first in the file. The same pipeline against five different bosses
   * producing five different weapons is the argument this whole project makes,
   * and the title screen is where it gets made.
   *
   * They ship as cache records too, so a first fight against a boss already in
   * here answers from cache instead of spending two minutes and sixty-two
   * credits regenerating a weapon that exists.
   */
  const cacheIndex = join(ROOT, "apps", "api", "cache", "index.json");
  if (existsSync(cacheIndex)) {
    const parsed = JSON.parse(await readFile(cacheIndex, "utf8")) as {
      relics: Record<string, ShowcaseRecord>;
    };

    /* Only relics whose model is really on disk. A record pointing at a file
       that was cleaned up is worse than no record: it renders as a title screen
       that is broken rather than one that is empty. */
    const usable = Object.values(parsed.relics).filter(
      (r) =>
        r.status === "COMPLETE" &&
        r.modelUrl &&
        r.dna?.bossInfluence &&
        existsSync(join(SOURCE, r.modelUrl.replace(/^\/assets\//, ""))),
    );

    /*
     * One per boss, and spread across elements where there is a choice.
     *
     * Taking the first match per boss gave four fire relics out of five, and the
     * title screen picks its champion from the relic's element — so the same
     * figure stood on the left through nearly the whole cycle. A showcase whose
     * argument is that different fights make different weapons should not show
     * the same fighter five times.
     */
    const chosen: ShowcaseRecord[] = [];
    const seenBoss = new Set<string>();
    const seenElement = new Set<string>();

    for (const pass of [0, 1]) {
      for (const relic of usable) {
        const boss = relic.dna?.bossInfluence as string;
        const element = (relic.dna as { element?: string })?.element ?? "";
        if (seenBoss.has(boss)) continue;
        // First pass takes only elements not yet spoken for; the second fills in
        // whatever bosses are still unrepresented.
        if (pass === 0 && seenElement.has(element)) continue;
        seenBoss.add(boss);
        seenElement.add(element);
        chosen.push(relic);
      }
    }

    for (const relic of chosen) {
      const rel = (relic.modelUrl as string).replace(/^\/assets\//, "");
      const [was, is] = await shrink(join(SOURCE, rel), join(DEST, rel));
      before += was;
      after += is;
      copied += 1;
      console.log(`  ${rel}  ${(was / 1e6).toFixed(2)}MB → ${(is / 1e6).toFixed(2)}MB`);
    }

    await writeFile(join(DEST, "showcase.json"), `${JSON.stringify({ relics: chosen }, null, 2)}\n`);
    console.log(`\nShowcase: ${chosen.length} relics, one per boss`);
  }

  /* Written so the bundle can say what produced it. A committed binary
     directory with no provenance is the kind of thing nobody dares regenerate. */
  await writeFile(
    join(DEST, "BUNDLE.json"),
    `${JSON.stringify({ files: copied, sourceBytes: before, bundledBytes: after }, null, 2)}\n`,
  );

  console.log(
    `\n${copied} files, ${(before / 1e6).toFixed(1)}MB → ${(after / 1e6).toFixed(1)}MB (${Math.round((1 - after / before) * 100)}% smaller)`,
  );
  if (missing.length) {
    // Named rather than counted. "3 files missing" sends you looking; a list
    // tells you whether it matters.
    console.warn(`\nNot found in storage, skipped:\n${missing.map((m) => `  ${m}`).join("\n")}`);
  }
}

await main();
