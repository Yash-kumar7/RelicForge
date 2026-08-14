import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  prune,
  textureCompress,
  weld,
} from "@gltf-transform/functions";
import sharp from "sharp";

/**
 * Game-ready pass over a Meshy GLB.
 *
 * `should_remesh` fixes geometry (3.1M → 12k triangles), but textures then
 * dominate: three 4K PBR maps re-exported as PNG land at 12–22 MB, which is a
 * multi-second stall on the reveal — the exact moment the demo cannot afford one.
 *
 * WebP at 2K is visually indistinguishable on a weapon held at arm's length and
 * cuts the payload by roughly an order of magnitude. This runs once at
 * generation time, so the cached asset the player loads is already optimized.
 */
export interface OptimizeResult {
  bytesBefore: number;
  bytesAfter: number;
  ms: number;
}

/**
 * Texture-only pass for rigged and animated GLBs.
 *
 * The standard optimizer welds, dedups and prunes, which is exactly the kind of
 * surgery that breaks skin weights and animation channels. Rigged output arrives
 * around 6 MB against 1.8 MB for the static mesh, and almost all of that
 * difference is texture, so compressing textures alone recovers most of the size
 * without touching a single vertex or channel.
 */
export async function optimizeRiggedGlb(
  input: Uint8Array,
  { textureSize = 2048, quality = 85 } = {},
): Promise<{ data: Uint8Array; stats: OptimizeResult }> {
  const startedAt = Date.now();
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const document = await io.readBinary(input);

  await document.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      resize: [textureSize, textureSize],
      quality,
    }),
  );

  const data = await io.writeBinary(document);
  return {
    data,
    stats: { bytesBefore: input.byteLength, bytesAfter: data.byteLength, ms: Date.now() - startedAt },
  };
}

export async function optimizeGlb(
  input: Uint8Array,
  { textureSize = 2048, quality = 85 } = {},
): Promise<{ data: Uint8Array; stats: OptimizeResult }> {
  const startedAt = Date.now();
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const document = await io.readBinary(input);

  await document.transform(
    // Meshy meshes arrive unwelded; welding first makes dedup/prune effective.
    weld(),
    dedup(),
    prune({ keepAttributes: false }),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      resize: [textureSize, textureSize],
      quality,
    }),
  );

  const data = await io.writeBinary(document);
  return {
    data,
    stats: {
      bytesBefore: input.byteLength,
      bytesAfter: data.byteLength,
      ms: Date.now() - startedAt,
    },
  };
}
