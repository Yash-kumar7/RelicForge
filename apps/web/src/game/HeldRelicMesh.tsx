import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Quaternion, Vector3 } from "three";
import { normalizeRelic, type WeaponClass } from "@relic/core";
import { meshSampleFrom } from "../lib/meshSample";
import { relicScale } from "./weaponScale";

/**
 * A generated relic in canonical held form, geometry only.
 *
 * Shared by the third-person avatar and by the champion on the setup screen. It
 * runs the same normalizeRelic the first-person socket runs, so a weapon sits
 * the same way in every place it appears rather than being posed three times by
 * hand.
 */
export function HeldRelicMesh({
  url,
  weaponClass,
}: {
  url: string;
  weaponClass: WeaponClass;
}) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);

  const canonical = useMemo(
    () => normalizeRelic(meshSampleFrom(model), weaponClass),
    [model, weaponClass],
  );

  const quaternion = useMemo(() => {
    const [x, y, z, w] = canonical.quaternion;
    return new Quaternion(x, y, z, w);
  }, [canonical]);

  const gripOffset = useMemo(() => new Vector3(...canonical.gripOffset), [canonical]);

  // One scale for every carried weapon, relic or otherwise. See weaponScale.ts.
  const wieldScale = relicScale(weaponClass);

  return (
    <group scale={wieldScale}>
      <group position={gripOffset}>
        <group quaternion={quaternion} scale={canonical.scale}>
          <primitive object={model} />
        </group>
      </group>
    </group>
  );
}
