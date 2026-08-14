import type { RelicTransform, WeaponClass } from "./types.js";

/**
 * Presentation transform: how a correctly-oriented weapon should sit in a
 * first-person hand.
 *
 * Deliberately separate from normalizeRelic(). "Which way does this mesh point"
 * and "where should a greatsword rest on screen" are different questions with
 * different failure modes, conflating them makes both harder to debug, because
 * a weapon that looks wrong could be either a bad axis or a bad pose.
 *
 * normalizeRelic knows geometry and nothing about the game.
 * attachRelic knows the game and nothing about geometry.
 */

export interface AttachTransform {
  /** Position relative to the camera, in world units. */
  position: [number, number, number];
  /** Euler XYZ in radians, applied after the canonical rotation. */
  rotation: [number, number, number];
  /** Extra scale on top of the canonical class scale. */
  scale: number;
}

const DEG = Math.PI / 180;

/**
 * Poses tuned for a right-handed first-person view. The weapon is held low and
 * angled across frame so the blade reads without covering the boss.
 */
const CLASS_POSE: Record<WeaponClass, AttachTransform> = {
  greatsword: {
    position: [0.34, -0.46, -0.62],
    rotation: [12 * DEG, -18 * DEG, -22 * DEG],
    scale: 0.62,
  },
  spear: {
    // Longer reach, so it sits further back and closer to vertical or it fills
    // the whole frame.
    position: [0.3, -0.5, -0.78],
    rotation: [8 * DEG, -12 * DEG, -14 * DEG],
    scale: 0.5,
  },
  warhammer: {
    position: [0.36, -0.44, -0.6],
    rotation: [14 * DEG, -20 * DEG, -26 * DEG],
    scale: 0.66,
  },
};

/**
 * The transform argument is intentionally unused today: normalizeRelic has
 * already reduced every weapon of a class to the same canonical length and
 * grip, which is precisely what lets the pose be a constant. It stays in the
 * signature because that guarantee is the contract between the two functions -
 * if canonicalization ever stops normalizing scale, the pose has to react, and
 * the call site should not need to change.
 */
export function attachRelic(
  _transform: RelicTransform,
  weaponClass: WeaponClass,
): AttachTransform {
  const pose = CLASS_POSE[weaponClass];
  return {
    position: [...pose.position],
    rotation: [...pose.rotation],
    scale: pose.scale,
  };
}

/** Idle bob and swing offsets, so the weapon feels attached to a body. */
export function weaponSway(elapsed: number, moving: boolean): { x: number; y: number } {
  const amplitude = moving ? 0.018 : 0.006;
  const speed = moving ? 7 : 1.6;
  return {
    x: Math.sin(elapsed * speed) * amplitude,
    y: Math.abs(Math.cos(elapsed * speed)) * amplitude,
  };
}
