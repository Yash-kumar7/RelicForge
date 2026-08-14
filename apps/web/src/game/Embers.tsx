import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, InstancedMesh, Object3D } from "three";
import { ARENA_RADIUS } from "./Arena";

/**
 * Instanced embers drifting toward the forge.
 *
 * One draw call for 400 particles. A VFX framework would do this too, and
 * would cost more than it returns for a single effect.
 */
const COUNT = 400;

export function Embers({ active }: { active: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  const particles = useMemo(
    () =>
      Array.from({ length: COUNT }, () => ({
        x: (Math.random() - 0.5) * ARENA_RADIUS * 2,
        y: Math.random() * 6,
        z: (Math.random() - 0.5) * ARENA_RADIUS * 2,
        speed: 0.35 + Math.random() * 0.9,
        drift: 0.2 + Math.random() * 0.6,
        scale: 0.012 + Math.random() * 0.03,
        phase: Math.random() * Math.PI * 2,
      })),
    [],
  );

  useFrame((_, delta) => {
    const instanced = mesh.current;
    if (!instanced) return;

    // Embers stream toward the forge once it wakes; before that they just hang
    // in the air as ambient ash.
    const pull = active ? 1 : 0.08;
    const forgeZ = -ARENA_RADIUS + 2.5;

    for (let i = 0; i < COUNT; i++) {
      const p = particles[i]!;
      p.y += p.speed * delta * (active ? 1.6 : 0.5);
      p.x += Math.sin(p.phase + p.y) * p.drift * delta;
      p.z += (forgeZ - p.z) * 0.06 * pull * delta * 10;

      if (p.y > 7.5) {
        p.y = -0.2;
        p.x = (Math.random() - 0.5) * ARENA_RADIUS * 2;
        p.z = (Math.random() - 0.5) * ARENA_RADIUS * 2;
      }

      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(p.scale * (active ? 1.6 : 1));
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial
        color={new Color("#ff8c42")}
        blending={AdditiveBlending}
        transparent
        opacity={active ? 0.9 : 0.35}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
