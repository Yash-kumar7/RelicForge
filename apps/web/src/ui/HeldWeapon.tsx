import type { OrientationHint, WeaponClass } from "@relic/core";
import { IronSwordMesh } from "../game/IronSwordMesh";
import { IRON_SCALE } from "../game/weaponScale";
import { HeldRelicMesh } from "../game/HeldRelicMesh";
import type { HeldWeaponSpec } from "./CharacterViewer";
import { handSocketFor } from "../game/handSockets";

/**
 * A weapon placed in a static champion's hand.
 *
 * The champions have no skeleton, so there is no hand bone to parent to. The
 * socket is estimated from the fitted bounding box instead: in the A-pose the
 * concepts are generated in, the hands sit near the extremes of the width at
 * roughly mid-thigh height, which is stable enough across all three champions
 * to look deliberate.
 *
 * This is exactly the limitation rigging would remove. Until then, an estimated
 * socket beats showing an empty-handed warrior on a screen about weapons.
 */

export interface HandSocket {
  /** Character height in world units, as fitted. */
  height: number;
  /** Character width in world units, as fitted. */
  width: number;
  /** Character depth in world units, as fitted. */
  depth: number;
  /** Which character this is, so its measured socket can be looked up. */
  slug: string;
}

const DEG = Math.PI / 180;

export function HeldWeapon({
  weapon,
  accent,
  socket,
}: {
  weapon: HeldWeaponSpec;
  accent: string;
  socket: HandSocket;
}) {
  /*
   * Right hand, from the character's own proportions rather than magic numbers,
   * and pushed just clear of the arm: normalizeRelic puts the grip at the
   * origin, so the shaft runs straight through whatever the socket sits inside.
   * Sitting it dead centre in the hand ran the blade through the forearm.
   */
  /*
   * The measured socket for this specific character, not an estimate.
   *
   * Read out of its own rig by scripts/derive-sockets.ts and stored as fractions
   * of the fitted body. Every socket bug this project has had came from guessing
   * this: 0.46 of height is mid-thigh and hung relics at the leg, and a fixed
   * sign put the weapon in the left hand. The values also genuinely differ per
   * character, from 0.531 to 0.597 of height, so no single constant was ever
   * going to be right for all of them.
   */
  const ratios = handSocketFor(socket.slug);
  const hand: [number, number, number] = [
    socket.width * ratios.x,
    socket.height * ratios.y,
    socket.depth * ratios.z,
  ];

  /*
   * Leaned away from the body, mirrored with the hand.
   *
   * A rotation about z maps the blade's +Y toward +x when the angle is negative,
   * so the roll has to follow which side the hand is on or the weapon leans
   * across the torso. Ember holds in its left hand at positive x; the rest hold
   * at negative x.
   */
  const outward = ratios.x >= 0 ? -1 : 1;
  const tilt: [number, number, number] = [20 * DEG, 0, outward * 30 * DEG];

  if (weapon.kind === "iron") {
    return (
      <group position={hand} rotation={tilt} scale={IRON_SCALE}>
        <IronSwordMesh accent={accent} />
      </group>
    );
  }

  return (
    <HeldRelic
      url={weapon.url}
      weaponClass={weapon.weaponClass}
      hand={hand}
      tilt={tilt}
      scale={weapon.scale ?? 1}
      {...(weapon.hint ? { hint: weapon.hint } : {})}
    />
  );
}

function HeldRelic({
  url,
  weaponClass,
  hand,
  tilt,
  scale,
  hint,
}: {
  url: string;
  weaponClass: WeaponClass;
  hand: [number, number, number];
  tilt: [number, number, number];
  scale: number;
  hint?: OrientationHint;
}) {
  return (
    <group position={hand} rotation={tilt} scale={scale}>
      <HeldRelicMesh url={url} weaponClass={weaponClass} {...(hint ? { hint } : {})} />
    </group>
  );
}
