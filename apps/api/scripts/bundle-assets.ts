import { mkdir, copyFile, readdir, stat, writeFile } from "node:fs/promises";
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
