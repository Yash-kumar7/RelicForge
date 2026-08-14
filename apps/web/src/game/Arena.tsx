import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { PointLight } from "three";
import { useGameStore } from "../state/useGameStore";

export const ARENA_RADIUS = 14;

/**
 * The arena exists to frame two things: the boss, and the forge behind it.
 * Everything is built from primitives — a downloaded environment would add
 * megabytes and pull attention away from the one asset that matters.
 */
export function Arena() {
  const phase = useGameStore((s) => s.phase);
  const forgeLight = useRef<PointLight>(null);

  const pillars = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const angle = (i / 10) * Math.PI * 2;
        return {
          key: i,
          position: [
            Math.cos(angle) * (ARENA_RADIUS - 1.2),
            2.4,
            Math.sin(angle) * (ARENA_RADIUS - 1.2),
          ] as [number, number, number],
          height: 4.8 + ((i * 37) % 10) / 10,
        };
      }),
    [],
  );

  // The forge wakes up when the boss dies: the arena dims and the only warm
  // light left in the scene is the thing about to make your weapon.
  const forgeActive = phase !== "FIGHTING" && phase !== "TITLE" && phase !== "CHOOSE_AFFINITY";

  useFrame(({ clock }) => {
    if (!forgeLight.current) return;
    const t = clock.getElapsedTime();
    const base = forgeActive ? 26 : 6;
    forgeLight.current.intensity = base + Math.sin(t * 3.1) * 3 + Math.sin(t * 7.7) * 1.5;
  });

  return (
    <group>
      <fog attach="fog" args={["#0a0908", 12, 44]} />
      <ambientLight intensity={forgeActive ? 0.12 : 0.28} />
      <hemisphereLight args={["#3a2b22", "#0a0908", forgeActive ? 0.15 : 0.4]} />
      <directionalLight
        position={[6, 14, 4]}
        intensity={forgeActive ? 0.15 : 0.9}
        color="#ffd9b3"
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[ARENA_RADIUS, 64]} />
        <meshStandardMaterial color="#16130f" roughness={0.95} metalness={0.05} />
      </mesh>

      {/* Ring wall */}
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[ARENA_RADIUS, ARENA_RADIUS, 6, 64, 1, true]} />
        <meshStandardMaterial color="#100e0c" roughness={1} side={2} />
      </mesh>

      {pillars.map((p) => (
        <mesh key={p.key} position={p.position}>
          <boxGeometry args={[0.9, p.height, 0.9]} />
          <meshStandardMaterial color="#1a1613" roughness={0.9} />
        </mesh>
      ))}

      {/* The forge. Dormant during the fight, the focal point afterwards. */}
      <group position={[0, 0, -ARENA_RADIUS + 2.5]}>
        <mesh position={[0, 1.1, 0]}>
          <boxGeometry args={[3.4, 2.2, 1.6]} />
          <meshStandardMaterial color="#241d18" roughness={0.85} metalness={0.25} />
        </mesh>
        <mesh position={[0, 1.35, 0.85]}>
          <boxGeometry args={[1.8, 1.2, 0.2]} />
          <meshStandardMaterial
            color="#ff6b1a"
            emissive="#ff6b1a"
            emissiveIntensity={forgeActive ? 3.2 : 0.5}
            toneMapped={false}
          />
        </mesh>
        <pointLight
          ref={forgeLight}
          position={[0, 1.6, 1.6]}
          color="#ff7a2a"
          distance={30}
          decay={2}
        />
      </group>
    </group>
  );
}
