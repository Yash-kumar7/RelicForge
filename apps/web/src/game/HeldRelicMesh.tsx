import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Quaternion, Vector3 } from "three";
import { normalizeRelic, type OrientationHint, type WeaponClass } from "@relic/core";
import { meshSampleFrom } from "../lib/meshSample";
import { relicScale } from "./weaponScale";
import { relicHintForUrl } from "./orientationHints";

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
  hint,
}: {
  url: string;
  weaponClass: WeaponClass;
  /**
   * Overrides for a mesh the heuristic cannot resolve confidently. Passed
   * straight through, so a hinted weapon still goes through exactly the same
   * normalization as an unhinted one.
   */
  hint?: OrientationHint;
}) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);

  /*
   * A hint the caller gave, or the one that belongs to this relic.
   *
   * Looked up from the url rather than threaded through six call sites. The boss
   * weapons already taught this: an orientation fixed in one place stayed wrong
   * everywhere else it was drawn, so what decides it has to travel with the
   * asset.
   */
  const resolved = useMemo(() => hint ?? relicHintForUrl(url), [hint, url]);

  const canonical = useMemo(
    () => normalizeRelic(meshSampleFrom(model), weaponClass, resolved),
    [model, weaponClass, resolved],
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
