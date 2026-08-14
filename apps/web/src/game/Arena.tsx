import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { PointLight } from "three";
import { useGameStore } from "../state/useGameStore";
import { themeFor } from "./theme";

export const ARENA_RADIUS = 14;

/**
 * The arena exists to frame two things: the boss, and the forge behind it.
 * Everything is built from primitives — a downloaded environment would add
 * megabytes and pull attention away from the one asset that matters.
 *
 * Its palette and layout both key off the player's affinity, so an ember run
 * and a frost run do not read as the same footage twice.
 */
export function Arena() {
  const phase = useGameStore((s) => s.phase);
  const affinity = useGameStore((s) => s.affinity);
  const theme = themeFor(affinity);
  const forgeLight = useRef<PointLight>(null);

  // Pillar count and jitter vary per affinity: fire is a tight brawling ring,
  // ice is open and colonnaded, storm is broken and irregular.
  const pillars = useMemo(() => {
    const config = {
      fire: { count: 10, inset: 1.2, base: 4.8, jitter: 1.0 },
      ice: { count: 16, inset: 0.9, base: 6.4, jitter: 0.4 },
      storm: { count: 7, inset: 1.8, base: 3.6, jitter: 2.6 },
    }[affinity];

    return Array.from({ length: config.count }, (_, i) => {
      const angle = (i / config.count) * Math.PI * 2;
      // Deterministic pseudo-jitter: same affinity always builds the same
      // arena, so a re-recorded run matches the previous take.
      const wobble = ((i * 37) % 11) / 11;
      return {
        key: i,
        position: [
          Math.cos(angle) * (ARENA_RADIUS - config.inset),
          2.4,
          Math.sin(angle) * (ARENA_RADIUS - config.inset),
        ] as [number, number, number],
        height: config.base + wobble * config.jitter,
        tilt: affinity === "storm" ? (wobble - 0.5) * 0.28 : 0,
      };
    });
  }, [affinity]);

  // The forge wakes when the boss dies: the arena dims and the only warm light
  // left in the scene is the thing about to make your weapon.
  const forgeActive = phase !== "FIGHTING" && phase !== "TITLE" && phase !== "CHOOSE_AFFINITY";

  useFrame(({ clock }) => {
    if (!forgeLight.current) return;
    const t = clock.getElapsedTime();
    const base = forgeActive ? 26 : 6;
    // Storm flickers rather than breathes.
    const pulse =
      affinity === "storm"
        ? Math.sin(t * 13) * 4 + Math.sin(t * 31) * 2
        : Math.sin(t * 3.1) * 3 + Math.sin(t * 7.7) * 1.5;
    forgeLight.current.intensity = base + pulse;
  });

  return (
    <group>
      <fog attach="fog" args={[theme.fog, 12, 44]} />
      <ambientLight intensity={forgeActive ? 0.12 : 0.28} color={theme.ambient} />
      <hemisphereLight args={[theme.ambient, theme.fog, forgeActive ? 0.15 : 0.4]} />
      <directionalLight
        position={[6, 14, 4]}
        intensity={forgeActive ? 0.15 : 0.9}
        color={theme.keyLight}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[ARENA_RADIUS, 64]} />
        <meshStandardMaterial color={theme.ground} roughness={0.95} metalness={0.05} />
      </mesh>

      {/* Rune ring — orients the player in a circular arena that otherwise has
          no landmarks, and carries the affinity colour at ground level. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[ARENA_RADIUS - 4.2, ARENA_RADIUS - 4, 96]} />
        <meshBasicMaterial color={theme.rune} transparent opacity={0.25} toneMapped={false} />
      </mesh>

      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[ARENA_RADIUS, ARENA_RADIUS, 6, 64, 1, true]} />
        <meshStandardMaterial color={theme.wall} roughness={1} side={2} />
      </mesh>

      {pillars.map((p) => (
        <mesh key={p.key} position={p.position} rotation={[p.tilt, 0, p.tilt]}>
          <boxGeometry args={[0.9, p.height, 0.9]} />
          <meshStandardMaterial color={theme.pillar} roughness={0.9} />
        </mesh>
      ))}

      {/* The forge. Dormant during the fight, the focal point afterwards. */}
      <group position={[0, 0, -ARENA_RADIUS + 2.5]}>
        <mesh position={[0, 1.1, 0]}>
          <boxGeometry args={[3.4, 2.2, 1.6]} />
          <meshStandardMaterial color={theme.pillar} roughness={0.85} metalness={0.25} />
        </mesh>
        <mesh position={[0, 1.35, 0.85]}>
          <boxGeometry args={[1.8, 1.2, 0.2]} />
          <meshStandardMaterial
            color={theme.forge}
            emissive={theme.forge}
            emissiveIntensity={forgeActive ? 3.2 : 0.5}
            toneMapped={false}
          />
        </mesh>
        <pointLight
          ref={forgeLight}
          position={[0, 1.6, 1.6]}
          color={theme.forge}
          distance={30}
          decay={2}
        />
      </group>
    </group>
  );
}
