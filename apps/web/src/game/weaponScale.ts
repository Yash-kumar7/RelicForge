import { CANONICAL_LENGTH, type WeaponClass } from "@relic/core";

/**
 * How long a weapon is when someone is holding it.
 *
 * There were two unrelated scales before this, and it showed: the iron arming
 * sword came out at 1.59 world units while a legendary greatsword came out at
 * 1.08, so the starter blade was visibly larger than the relic it exists to be
 * replaced by. The preview also scaled the iron sword by 1.15 while the arena
 * scaled it by 1, so the same weapon changed size between screens.
 *
 * CANONICAL_LENGTH is not this. It exists so the normalizer can compare one
 * generated mesh against another, and using it as a carry size is what made
 * relics tower over their wielder.
 *
 * Everything here is expressed against a champion of AVATAR_HEIGHT, so the
 * proportions read the way they would on a person: an arming sword a little
 * over half their height, a greatsword clearly longer, a spear taller than the
 * wielder because that is what makes it a spear.
 */

/** Champion height these proportions are chosen against. */
export const REFERENCE_HEIGHT = 1.8;

/** Carried length in world units, by weapon. */
export const HELD_LENGTH: Record<WeaponClass | "iron", number> = {
  iron: 1.02,
  greatsword: 1.32,
  spear: 1.9,
  warhammer: 1.18,
};

/**
 * Length of IronSwordMesh as modelled: pommel at about -0.2, tip at about 1.18,
 * grip on the origin. Hand-authored, so it has no bounding box to measure at
 * runtime and this has to be kept in step with that file.
 */
export const IRON_SWORD_LENGTH = 1.38;

/** Uniform scale that brings the hand-built iron sword to its carried length. */
export const IRON_SCALE = HELD_LENGTH.iron / IRON_SWORD_LENGTH;

/**
 * Uniform scale that brings a normalized relic to its carried length.
 *
 * normalizeRelic has already scaled the mesh to CANONICAL_LENGTH, so this is
 * the ratio between that and the size a person should be carrying.
 */
export function relicScale(weaponClass: WeaponClass): number {
  return HELD_LENGTH[weaponClass] / CANONICAL_LENGTH[weaponClass];
}
