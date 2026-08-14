import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Group, Quaternion, Vector3 } from "three";
import { attachRelic, normalizeRelic, weaponSway, type WeaponClass } from "@relic/core";
import { meshSampleFrom } from "../lib/meshSample";
import { playerHandle } from "./Player";
import { swingProgress } from "./swing";

/**
 * Mounts a generated relic in the player's hand.
 *
 * This is the payoff of the whole pipeline: a GLB that did not exist ten
 * minutes ago, loaded at runtime, oriented and gripped automatically, held in
 * first person with no manual asset editing anywhere in the chain.
 */

interface WeaponSocketProps {
  modelUrl: string;
  weaponClass: WeaponClass;
}

/**
 * Persisting the canonical transform used to happen here as a side effect, which
 * tied it to the first-person camera. It lives in PersistRelicTransform now, so
 * this component only draws.
 */
export function WeaponSocket({ modelUrl, weaponClass }: WeaponSocketProps) {
  const { camera } = useThree();
  const socket = useRef<Group>(null);
  const { scene } = useGLTF(modelUrl);

  const model = useMemo(() => scene.clone(true), [scene]);

  // Canonicalize once. The same function runs in Node against synthetic
  // geometry in the test suite, one implementation, two runtimes.
  const canonical = useMemo(() => normalizeRelic(meshSampleFrom(model), weaponClass), [
    model,
    weaponClass,
  ]);

  const pose = useMemo(() => attachRelic(canonical, weaponClass), [canonical, weaponClass]);

  const canonicalQuat = useMemo(() => {
    const [x, y, z, w] = canonical.quaternion;
    return new Quaternion(x, y, z, w);
  }, [canonical]);

  const gripOffset = useMemo(() => new Vector3(...canonical.gripOffset), [canonical]);

  useFrame(({ clock }) => {
    const group = socket.current;
    if (!group) return;

    // The socket rides the camera, so the weapon is welded to the view.
    group.position.copy(camera.position);
    group.quaternion.copy(camera.quaternion);

    const sway = weaponSway(clock.getElapsedTime(), playerHandle.moving);

    // Swing: a short arc driven by the same timing the hit test uses, so what
    // you see matches what actually landed.
    const swing = swingProgress(playerHandle.attacking);

    group.translateX(pose.position[0] + sway.x);
    group.translateY(pose.position[1] + sway.y);
    group.translateZ(pose.position[2]);
    group.rotateX(pose.rotation[0] - swing * 0.55);
    group.rotateY(pose.rotation[1]);
    group.rotateZ(pose.rotation[2] - swing);
  });

  return (
    <group ref={socket}>
      <group position={gripOffset} scale={pose.scale}>
        <group quaternion={canonicalQuat} scale={canonical.scale}>
          <primitive object={model} />
        </group>
      </group>
    </group>
  );
}
