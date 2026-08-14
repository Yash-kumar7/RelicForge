import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Quaternion, Vector3 } from "three";
import { normalizeRelic, type WeaponClass } from "@relic/core";
import { meshSampleFrom } from "../lib/meshSample";

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
  url,
  weaponClass,
  socket,
}: {
  url: string;
  weaponClass: WeaponClass;
  socket: HandSocket;
}) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);

  // Canonicalized exactly as the game does it, so the grip really is the grip.
  const canonical = useMemo(
    () => normalizeRelic(meshSampleFrom(model), weaponClass),
    [model, weaponClass],
  );

  const quaternion = useMemo(() => {
    const [x, y, z, w] = canonical.quaternion;
    return new Quaternion(x, y, z, w);
  }, [canonical]);

  const gripOffset = useMemo(() => new Vector3(...canonical.gripOffset), [canonical]);

  // Right hand, from the character's own proportions rather than magic numbers.
  const hand: [number, number, number] = [socket.width * 0.4, socket.height * 0.46, 0.1];

  // Held slightly out and angled back, the way a fighter rests a blade at ease.
  const tilt: [number, number, number] = [12 * DEG, 0, -18 * DEG];

  // Spears are long enough that the canonical length would tower over the
  // champion, so held weapons are scaled to the wielder.
  const wieldScale = weaponClass === "spear" ? 0.72 : 0.85;

  return (
    <group position={hand} rotation={tilt} scale={wieldScale}>
      <group position={gripOffset}>
        <group quaternion={quaternion} scale={canonical.scale}>
          <primitive object={model} />
        </group>
      </group>
    </group>
  );
}
