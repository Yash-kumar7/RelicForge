import { IronSwordMesh } from "../game/IronSwordMesh";
import { IRON_SCALE } from "../game/weaponScale";
import { HeldRelicMesh } from "../game/HeldRelicMesh";
import type { HeldWeaponSpec } from "./CharacterViewer";

/**
 * A weapon in a character's hand, on the setup screen.
 *
 * Deliberately has no socket of its own. It renders at its parent's origin,
 * and its parent is the hand bone of the rigged mesh, so there is nothing here
 * to get wrong.
 *
 * This replaced an estimated socket, and the estimate was wrong four separate
 * times: at mid-thigh, on the wrong side, too far in front, and finally a
 * quarter of a unit below the fist. That last one was not a tuning error and no
 * amount of adjustment would have fixed it. Meshy's rigging normalises the
 * character into an A-pose with the arms lowered, so the hand bone sits at 0.57
 * of height while the static mesh keeps the concept's raised, bent-elbow fist at
 * roughly 0.70. Any ratio taken from the rig describes a pose the static mesh is
 * not in.
 *
 * The rig knows where the hand is because the bone is the hand. Asking it costs
 * nothing, since the arena loads these files anyway.
 */

const DEG = Math.PI / 180;

/**
 * Rest pose relative to the hand.
 *
 * A weapon at rest is roughly upright and a hanging arm is roughly vertical, so
 * an unrotated blade runs parallel to the forearm and reads as passing through
 * it. The lean is what makes the shaft leave the body immediately above the
 * hand.
 */
const TILT: [number, number, number] = [20 * DEG, 0, -22 * DEG];

export function HeldWeapon({ weapon, accent }: { weapon: HeldWeaponSpec; accent: string }) {
  if (weapon.kind === "iron") {
    return (
      <group rotation={TILT} scale={IRON_SCALE}>
        <IronSwordMesh accent={accent} />
      </group>
    );
  }

  return (
    <group rotation={TILT} scale={weapon.scale ?? 1}>
      <HeldRelicMesh
        url={weapon.url}
        weaponClass={weapon.weaponClass}
        {...(weapon.hint ? { hint: weapon.hint } : {})}
      />
    </group>
  );
}
