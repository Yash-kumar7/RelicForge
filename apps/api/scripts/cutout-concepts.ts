import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "../src/env.js";

/**
 * Gives the character concepts a real alpha channel.
 *
 * The title screen stands two of them on a dark page, which needs their
 * backgrounds gone. Two attempts to solve that in the prompt both failed in
 * instructive ways: asking for a neutral background produced a pale sheet, so
 * every figure arrived inside a grey card, and asking for pure black produced
 * near-black with a faint gradient, which still shows as a rectangle against a
 * page that is not exactly the same near-black.
 *
 * A prompt cannot promise an exact pixel value. This can. The background is
 * darker than anything in the figures, so luminance separates them cleanly, and
 * a soft ramp rather than a hard threshold keeps the edges from turning into
 * cutout jaggies.
 *
 *   pnpm --filter @relic/api exec tsx scripts/cutout-concepts.ts
 */

/** Below this luminance is background, above it is figure. */
const TRANSPARENT_BELOW = 12;
const OPAQUE_ABOVE = 40;

/** Which files to cut, in order of preference. */
const SOURCES = ["concept-stance.png", "concept-open.png"];

async function cutout(file: string, out: string): Promise<string> {
  const image = sharp(file);
  const { width = 0, height = 0 } = await image.metadata();
  const rgb = await sharp(file).removeAlpha().raw().toBuffer();

  const alpha = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgb[i * 3] ?? 0;
    const g = rgb[i * 3 + 1] ?? 0;
    const b = rgb[i * 3 + 2] ?? 0;
    // Rec. 709 luminance: the eye weights green far above blue, and using a
    // flat average would cut the blue-lit frost champion differently from the
    // orange-lit ember one.
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const t = (luma - TRANSPARENT_BELOW) / (OPAQUE_ABOVE - TRANSPARENT_BELOW);
    alpha[i] = Math.round(Math.max(0, Math.min(1, t)) * 255);
  }

  await sharp(rgb, { raw: { width, height, channels: 3 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toFile(out);

  return `${width}x${height}`;
}

async function main(): Promise<void> {
  let done = 0;

  for (const kind of ["champions", "bosses"] as const) {
    const root = path.join(env.storageDir, kind);
    for (const slug of (await readdir(root).catch(() => [])).filter((d) => !d.includes("."))) {
      const dir = path.join(root, slug);

      let source: string | null = null;
      for (const name of SOURCES) {
        const candidate = path.join(dir, name);
        if (await readFile(candidate).then(() => true, () => false)) {
          source = candidate;
          break;
        }
      }
      if (!source) {
        console.log(`skip  ${kind}/${slug} - nothing to cut`);
        continue;
      }

      const out = path.join(dir, "concept-cut.png");
      const size = await cutout(source, out);
      done++;
      console.log(`  ok  ${kind}/${slug} - ${path.basename(source)} -> concept-cut.png (${size})`);
    }
  }

  console.log(`\nCut ${done} concepts. No credits: this is pixels, not generation.`);
  await writeFile(
    path.join(env.storageDir, "cutout.json"),
    JSON.stringify({ transparentBelow: TRANSPARENT_BELOW, opaqueAbove: OPAQUE_ABOVE }, null, 2),
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
