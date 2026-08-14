import { Box3, Vector3, type Object3D } from "three";

/**
 * Fits a generated character mesh into the arena.
 *
 * Deliberately not normalizeRelic. A weapon needs its principal axis found and
 * its grip inferred; a character needs something simpler and stricter — stand
 * on the floor, face the player, and be exactly as tall as the design says.
 * Running PCA on a humanoid would work (height dominates) but would also be
 * free to flip it, and a boss standing on its head is a worse failure than a
 * boss that is slightly the wrong height.
 */
export interface CharacterFit {
  /** Uniform scale so the mesh matches the intended height. */
  scale: number;
  /** Offset placing the feet on y = 0 and centring on x/z. */
  offset: [number, number, number];
}

export function fitCharacter(root: Object3D, targetHeight: number): CharacterFit {
  root.updateWorldMatrix(true, true);

  const box = new Box3().setFromObject(root);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());

  // Guard against a degenerate mesh rather than dividing by zero and sending
  // the boss to infinity.
  const height = size.y > 1e-4 ? size.y : 1;
  const scale = targetHeight / height;

  return {
    scale,
    offset: [-center.x * scale, -box.min.y * scale, -center.z * scale],
  };
}
