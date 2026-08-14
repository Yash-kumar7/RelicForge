import type { WeaponClass } from "@relic/core";
import { IronSwordMesh } from "../game/IronSwordMesh";
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
  // Right hand, from the character's own proportions rather than magic numbers.
  const hand: [number, number, number] = [socket.width * 0.4, socket.height * 0.46, 0.1];
  // Held slightly out and angled back, the way a fighter rests a blade at ease.
  const tilt: [number, number, number] = [12 * DEG, 0, -18 * DEG];

  if (weapon.kind === "iron") {
    return (
      <group position={hand} rotation={tilt} scale={1.15}>
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
    />
  );
}

function HeldRelic({
  url,
  weaponClass,
  hand,
  tilt,
  scale,
}: {
  url: string;
  weaponClass: WeaponClass;
  hand: [number, number, number];
  tilt: [number, number, number];
  scale: number;
}) {
  return (
    <group position={hand} rotation={tilt} scale={scale}>
      <HeldRelicMesh url={url} weaponClass={weaponClass} />
    </group>
  );
}
