import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { AdditiveBlending, Group, Quaternion, Vector3 } from "three";
import { normalizeRelic, type WeaponClass } from "@relic/core";
import { meshSampleFrom } from "../lib/meshSample";
import { ARENA_RADIUS } from "./Arena";
import { sfx } from "../audio/sfx";

/**
 * The reveal.
 *
 * The relic materializes above the forge, canonicalized and slowly rotating,
 * before the player claims it. Showing it in world space first, rather than
 * cutting straight to a first-person hand, is what sells that this is a real
 * object in the scene and not a UI illustration.
 */
export function RelicPedestal({
  modelUrl,
  weaponClass,
}: {
  modelUrl: string;
  weaponClass: WeaponClass;
}) {
  const group = useRef<Group>(null);
  const burst = useRef<Group>(null);
  const { scene } = useGLTF(modelUrl);
  const [bornAt, setBornAt] = useState(0);

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

  useEffect(() => {
    setBornAt(performance.now());
    sfx.relicReveal();
  }, [modelUrl]);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g || bornAt === 0) return;

    const age = (performance.now() - bornAt) / 1000;

    // Rise, settle, then hover.
    const rise = Math.min(1, age / 1.6);
    const eased = 1 - Math.pow(1 - rise, 3);
    g.position.y = 1.4 + eased * 1.5 + Math.sin(clock.getElapsedTime() * 0.9) * 0.06;
    g.rotation.y = clock.getElapsedTime() * 0.45;
    g.scale.setScalar(0.4 + eased * 0.6);

    if (burst.current) {
      const t = Math.min(1, age / 0.9);
      burst.current.scale.setScalar(0.4 + t * 6);
      const material = (burst.current.children[0] as { material?: { opacity: number } } | undefined)
        ?.material;
      if (material) material.opacity = Math.max(0, 0.7 * (1 - t));
    }
  });

  return (
    <group position={[0, 0, -ARENA_RADIUS + 2.5]}>
      {/* Expanding shell at the instant of materialization. */}
      <group ref={burst} position={[0, 2.6, 1.4]}>
        <mesh>
          <sphereGeometry args={[0.4, 24, 24]} />
          <meshBasicMaterial
            color="#ff8c42"
            transparent
            opacity={0.7}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>

      <group ref={group} position={[0, 1.4, 1.4]}>
        <group position={gripOffset}>
          <group quaternion={quaternion} scale={canonical.scale}>
            <primitive object={model} />
          </group>
        </group>
        <pointLight color="#ffb066" intensity={14} distance={12} decay={2} />
      </group>
    </group>
  );
}
