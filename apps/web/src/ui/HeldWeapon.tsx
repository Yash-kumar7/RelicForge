import type { OrientationHint, WeaponClass } from "@relic/core";
import { IronSwordMesh } from "../game/IronSwordMesh";
import { IRON_SCALE } from "../game/weaponScale";
import { HeldRelicMesh } from "../game/HeldRelicMesh";
import type { HeldWeaponSpec } from "./CharacterViewer";

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
   * Height and depth are measured, the side is not, and the difference matters.
   *
   * RightHand in ember/rig/walking.glb, fitted to a 1.8 unit champion, sits at
   * [-0.484, 1.029, 0.065] against a body 1.142 wide, 1.8 tall and 0.459 deep.
   * The height and depth carried over directly: 0.572 and 0.14. The old 0.46 of
   * height was mid-thigh, which hung the grip about a third of a world unit
   * below the hand so the fingers closed on the blade above the guard.
   *
   * The sign did not carry over. Meshy's rigging reorients the character, so the
   * rigged GLB and the raw model.glb do not share a facing and the rig's
   * negative x is the other side of this mesh. Taking the measurement literally
   * put the weapon in the left hand. The side is therefore set from the model
   * itself rather than from its rig.
   *
   * Slightly outboard of the hand's centre, so the shaft rides the palm instead
   * of running through the middle of it.
   */
  const hand: [number, number, number] = [
    socket.width * 0.47,
    socket.height * 0.572,
    socket.depth * 0.14,
  ];
  /*
   * Leaned out and forward rather than stood upright.
   *
   * The lean is what actually keeps the blade off the body: the shaft is a line
   * through the grip, so a vertical weapon tracks the torso for its whole length
   * no matter where the socket is, while a leaned one departs immediately above
   * the hand. It also reads as a fighter resting a blade rather than presenting
   * it.
   */
  /*
   * Negative roll, matching the positive side. A rotation about z maps the
   * blade's +Y toward +x when the angle is negative, which leans the weapon away
   * from a body whose hand is on positive x.
   */
  const tilt: [number, number, number] = [20 * DEG, 0, -30 * DEG];

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
