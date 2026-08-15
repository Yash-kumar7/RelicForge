import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { PointLight } from "three";
import { useGameStore } from "../state/useGameStore";
import { themeForBoss } from "./theme";
import { ARENA_RADIUS } from "./arenaGeometry";
import { ArenaFeatures, hasWall } from "./arenaFeatures";

export { ARENA_RADIUS } from "./arenaGeometry";

/**
 * The arena exists to frame two things: the boss, and the forge behind it.
 * Everything is built from primitives, a downloaded environment would add
 * megabytes and pull attention away from the one asset that matters.
 *
 * Its palette and layout both key off the player's affinity, so an ember run
 * and a frost run do not read as the same footage twice.
 */
export function Arena() {
  const phase = useGameStore((s) => s.phase);
  const bossLevel = useGameStore((s) => s.bossLevel) ?? 1;
  // The arena is the boss's domain, so it wears the boss's colours.
  const theme = themeForBoss(bossLevel);
  const forgeLight = useRef<PointLight>(null);

  // Pillar count and jitter vary per affinity: fire is a tight brawling ring,
  // ice is open and colonnaded, storm is broken and irregular.
  const pillars = useMemo(() => {
    const config = {
      1: { count: 10, inset: 1.2, base: 4.8, jitter: 1.0 },
      2: { count: 16, inset: 0.9, base: 6.4, jitter: 0.4 },
      3: { count: 12, inset: 1.0, base: 7.2, jitter: 0.6 },
      4: { count: 8, inset: 1.6, base: 5.4, jitter: 2.2 },
      5: { count: 6, inset: 2.0, base: 3.4, jitter: 2.8 },
    }[bossLevel] ?? { count: 10, inset: 1.2, base: 4.8, jitter: 1.0 };

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
        tilt: bossLevel >= 4 ? (wobble - 0.5) * 0.28 : 0,
      };
    });
  }, [bossLevel]);

  /*
   * One floor pattern per rung, in the same spirit as the pillars above.
   *
   * Read as: how close the fight is drawn, how many marks, and whether the
   * marking is whole. A pit tightens toward the Warden and opens out for the
   * Sovereign, where the far ring is a horizon rather than a boundary.
   */
  const rings = useMemo<
    { radius: number; width: number; opacity: number; arcs?: number; fill?: number }[]
  >(() => {
    switch (bossLevel) {
      // Ashen Warden: one heavy circle drawn close, a brawling pit.
      case 2:
        // Drowned Choir: three thin rings, the way water answers a stone.
        return [
          { radius: ARENA_RADIUS - 9.5, width: 0.12, opacity: 0.16 },
          { radius: ARENA_RADIUS - 6.6, width: 0.14, opacity: 0.2 },
          { radius: ARENA_RADIUS - 3.6, width: 0.16, opacity: 0.24 },
        ];
      case 3:
        // Gilded Husk: two exact rings, close together. Ceremonial, laid out.
        return [
          { radius: ARENA_RADIUS - 5.4, width: 0.1, opacity: 0.3 },
          { radius: ARENA_RADIUS - 4.9, width: 0.3, opacity: 0.34 },
        ];
      case 4:
        // Rootbound King: the circle is broken, torn open in five places.
        return [
          { radius: ARENA_RADIUS - 4.4, width: 0.32, opacity: 0.3, arcs: 5, fill: 0.62 },
          { radius: ARENA_RADIUS - 8.2, width: 0.16, opacity: 0.14, arcs: 3, fill: 0.4 },
        ];
      case 5:
        // Hollow Sovereign: a tight ring underfoot and a faint one far out, so
        // the room reads as bigger than the fight in it.
        return [
          { radius: ARENA_RADIUS - 11.2, width: 0.22, opacity: 0.34 },
          { radius: ARENA_RADIUS - 1.6, width: 0.1, opacity: 0.12 },
        ];
      default:
        return [{ radius: ARENA_RADIUS - 4.4, width: 0.42, opacity: 0.32 }];
    }
  }, [bossLevel]);

  // The forge wakes when the boss dies: the arena dims and the only warm light
  // left in the scene is the thing about to make your weapon.
  const forgeActive = phase !== "FIGHTING" && phase !== "TITLE" && phase !== "CHOOSE_AFFINITY";

  useFrame(({ clock }) => {
    if (!forgeLight.current) return;
    const t = clock.getElapsedTime();
    const base = forgeActive ? 26 : 6;
    // Storm flickers rather than breathes.
    const pulse =
      bossLevel === 5
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

      {/*
          The ring on the floor, which is the boss's and not just its colour.

          Every rung drew one thin circle at the same radius and recoloured it,
          so the floor was the one part of the arena that did not change with the
          thing standing on it, while the palette and the pillars both did. These
          are ground markings, the oldest way a place says which place it is, and
          they read at a glance because the player spends the fight looking down
          at them.
      */}
      {rings.map((ring, index) =>
        ring.arcs === undefined ? (
          <mesh key={index} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <ringGeometry args={[ring.radius, ring.radius + ring.width, 96]} />
            <meshBasicMaterial
              color={theme.rune}
              transparent
              opacity={ring.opacity}
              toneMapped={false}
            />
          </mesh>
        ) : (
          /* Broken into arcs, for the rungs whose floor has been torn up. */
          Array.from({ length: ring.arcs }, (_, arc) => {
            const step = (Math.PI * 2) / ring.arcs!;
            return (
              <mesh
                key={`${index}-${arc}`}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.01, 0]}
              >
                <ringGeometry
                  args={[
                    ring.radius,
                    ring.radius + ring.width,
                    24,
                    1,
                    arc * step,
                    step * ring.fill!,
                  ]}
                />
                <meshBasicMaterial
                  color={theme.rune}
                  transparent
                  opacity={ring.opacity}
                  toneMapped={false}
                />
              </mesh>
            );
          })
        ),
      )}

      {/*
        Not every rung stands in a room.

        Dropping the wall is the largest single change any level makes, because
        the boundary has been there for four fights by then, and its absence is
        felt before it is noticed.
      */}
      {hasWall(bossLevel) && (
        <mesh position={[0, 3, 0]}>
          <cylinderGeometry args={[ARENA_RADIUS, ARENA_RADIUS, 6, 64, 1, true]} />
          <meshStandardMaterial color={theme.wall} roughness={1} side={2} />
        </mesh>
      )}

      {/*
        What actually makes this rung a different place.

        Ten colours and a pillar count is a reskin, and it read as one room five
        times over. Each level now has one structural idea: a cracked floor, a
        flood, a laid-out hall, roots and a canopy, or no walls at all.
      */}
      <ArenaFeatures level={bossLevel} theme={theme} />

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
