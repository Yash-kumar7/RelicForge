/**
 * Rewrites an animation GLB down to the animation.
 *
 * Meshy returns every clip as a complete character: the skinned mesh, its
 * skeleton, and three textures, with the animation attached. That is the right
 * thing to hand back from an API and the wrong thing to ship three times over —
 * a boss carries walking, idle and attack, and every one of them is another copy
 * of the same body at another megabyte and a half.
 *
 * The game already knows this. AnimatedCharacter loads the extra clips purely to
 * read `animations[0]` off them and drops the scene on the floor, so the mesh and
 * the textures are downloaded, decoded, and thrown away, every load, on a page
 * that is already asking for eighty megabytes.
 *
 * What has to survive is the node hierarchy the animation channels point at —
 * three.js retargets clips by node name — so the bones stay and everything hanging
 * off them goes.
 *
 *   pnpm --filter @relic/api exec tsx scripts/strip-clip.ts <file.glb> [more.glb...]
 */
import { readFile, writeFile, stat } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { resample } from "@gltf-transform/functions";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: strip-clip.ts <file.glb> [more.glb...]");
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const file of files) {
  const before = (await stat(file)).size;
  const doc = await io.readBinary(new Uint8Array(await readFile(file)));
  const root = doc.getRoot();

  if (!root.listAnimations().length) {
    console.log(`skip ${file}: no animation in it`);
    continue;
  }

  /*
   * Order matters going down: a skin references joints and an inverse-bind
   * accessor, a mesh references materials, a material references textures. Cut
   * from the top and the rest is unreferenced by the time prune runs.
   */
  for (const mesh of root.listMeshes()) mesh.dispose();
  for (const skin of root.listSkins()) skin.dispose();
  for (const material of root.listMaterials()) material.dispose();
  for (const texture of root.listTextures()) texture.dispose();

  /* Nodes are kept deliberately, including the ones that used to carry a mesh:
     the animation targets them by name, and a missing node is a channel that
     silently does nothing. */
  for (const node of root.listNodes()) node.setMesh(null).setSkin(null);

  /*
   * Then the curves, which turn out to be most of what is left.
   *
   * Meshy bakes every bone at a fixed rate, so a hand that does not move for half a
   * second still carries fifteen identical keyframes. Resampling drops the ones that
   * say nothing new, which is lossless for linearly interpolated tracks — and these
   * are linear.
   */
  await doc.transform(resample());

  await writeFile(file, Buffer.from(await io.writeBinary(doc)));
  const after = (await stat(file)).size;
  console.log(
    `${file}  ${(before / 1024 / 1024).toFixed(2)}MB -> ${(after / 1024).toFixed(0)}KB  (${root.listAnimations().length} clip)`,
  );
}
