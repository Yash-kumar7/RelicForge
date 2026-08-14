import type { MeshSample } from "@relic/core";
import { Mesh, type Object3D } from "three";

/**
 * Flattens every mesh under an object into one world-space sample.
 *
 * Merging first is not optional: Meshy GLBs are not guaranteed single-node, and
 * running PCA per node produces garbage on anything with a separate guard,
 * pommel, or decorative element.
 */
export function meshSampleFrom(root: Object3D): MeshSample {
  const positions: number[] = [];
  const indices: number[] = [];

  root.updateWorldMatrix(true, true);

  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const geo = child.geometry;
    const pos = geo?.getAttribute("position");
    if (!pos) return;

    const base = positions.length / 3;
    const m = child.matrixWorld.elements;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      positions.push(
        m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
        m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
        m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
      );
    }

    const idx = geo.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices.push(base + idx.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) indices.push(base + i);
    }
  });

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}
