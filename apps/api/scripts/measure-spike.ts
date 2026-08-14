/**
 * Gate 0B measurement. Loads every spike GLB, runs the normalizer, and prints
 * the numbers the gate is scored on, raw angle first, because if Meshy already
 * preserves the concept framing the hard orientation problem does not exist.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { env } from "../src/env.js";
import { measureRawAlignment, normalizeRelic, radiusProfile, resolveEnds, type MeshSample } from "@relic/core";
import type { WeaponClass } from "@relic/core";

const CLASS_OF: Record<string, WeaponClass> = {
  greatsword: "greatsword", "ornate-longsword": "greatsword", "curved-saber": "greatsword",
  dagger: "greatsword", spear: "spear", glaive: "spear", "ringed-staff": "spear",
  warhammer: "warhammer", "asymmetric-axe": "warhammer", "twin-maul": "warhammer",
  "crystal-shard-blade": "greatsword", "chained-flail": "warhammer",
};

/** Flattens every mesh primitive into one world-space sample. */
async function sampleOf(file: string): Promise<MeshSample> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.readBinary(await readFile(file));
  const positions: number[] = [];
  const indices: number[] = [];

  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (!pos) continue;
      const base = positions.length / 3;
      for (let i = 0; i < pos.getCount(); i++) {
        const v = pos.getElement(i, [0, 0, 0]) as number[];
        const x = v[0]!, y = v[1]!, z = v[2]!;
        positions.push(
          m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
          m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
          m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
        );
      }
      const idx = prim.getIndices();
      if (idx) for (let i = 0; i < idx.getCount(); i++) indices.push(base + idx.getScalar(i));
      else for (let i = 0; i < pos.getCount(); i++) indices.push(base + i);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

const root = path.join(env.storageDir, process.env.SPIKE_DIR ?? "spike");
const dirs = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);

console.log("\nslug            raw°    conf   gripT   scale   tris      ms");
console.log("─".repeat(64));
const angles: number[] = [];

for (const slug of dirs.sort()) {
  try {
    const sample = await sampleOf(path.join(root, slug, "model.glb"));
    const t0 = Date.now();
    const raw = measureRawAlignment(sample);
    const profile = radiusProfile(sample, raw.axis);
    const ends = resolveEnds(profile);
    const tr = normalizeRelic(sample, CLASS_OF[slug] ?? "greatsword");
    const ms = Date.now() - t0;
    angles.push(raw.angleDeg);
    console.log(
      slug.padEnd(15) +
        raw.angleDeg.toFixed(1).padStart(5) +
        ends.confidence.toFixed(2).padStart(8) +
        tr.gripT.toFixed(3).padStart(8) +
        tr.scale.toFixed(2).padStart(8) +
        String(Math.round((sample.indices?.length ?? 0) / 3)).padStart(9) +
        String(ms).padStart(6),
    );
  } catch (e) {
    console.log(`${slug.padEnd(15)} ERROR ${(e as Error).message}`);
  }
}

const sorted = [...angles].sort((a, b) => a - b);
const median = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : NaN;
console.log("─".repeat(64));
console.log(`median raw angle: ${median.toFixed(1)}°  →  ${median < 15 ? "TIER 0, Meshy preserves framing" : "TIER 1, PCA correction required"}\n`);
