import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { ARENA_RADIUS } from "./arenaGeometry";
import type { ArenaTheme } from "./theme";

/**
 * What makes each rung a different place, rather than the same place repainted.
 *
 * The arena already changed its ten colours and its pillar layout per boss, and
 * that is a reskin: the same room, five palettes. A player walking into the
 * fourth fight should be able to tell it is the fourth fight with the colour
 * stripped out, which means the geometry has to differ, not the material.
 *
 * Everything here is primitives for the same reason the arena is. A downloaded
 * environment would add megabytes and pull attention off the one asset that is
 * supposed to hold the frame, so each rung gets one strong structural idea built
 * from boxes and cylinders instead of a set dressed with props.
 *
 * Deterministic throughout. The wobble is derived from the index, never from
 * Math.random, so a re-recorded run of a level matches the previous take frame
 * for frame, which is the only way a demo can be shot twice.
 */

/** Index-derived pseudo-jitter, the same trick the pillar ring uses. */
function wobble(i: number, mod = 11): number {
  return ((i * 37) % mod) / mod;
}

/**
 * Ashen Warden: a pit that has cracked open under the heat.
 *
 * The fissures run outward from under the boss, so the light on the floor comes
 * from the thing standing on it. They are the only warm thing at ground level
 * during the fight, since the forge stays dormant until it dies.
 */
function EmberFissures({ theme }: { theme: ArenaTheme }) {
  const cracks = useMemo(
    () =>
      /*
       * Short, thin and dim, which is the whole difference between a crack and a
       * painted stripe.
       *
       * The first pass ran nine bars of length 6 to 13 out from the middle at
       * half opacity, which crossed the entire floor, met at the centre, and read
       * as a logo someone had stencilled on the arena. A fissure is a hairline
       * with light at the bottom of it: it has to be narrow enough that the floor
       * is mostly floor.
       */
      Array.from({ length: 7 }, (_, i) => {
        const angle = (i / 7) * Math.PI * 2 + wobble(i) * 0.9;
        const length = 1.8 + wobble(i, 7) * 2.6;
        const from = 3.4 + wobble(i, 5) * 4.5;
        return {
          key: i,
          position: [
            Math.cos(angle) * (from + length / 2),
            0.02,
            Math.sin(angle) * (from + length / 2),
          ] as [number, number, number],
          rotation: [-Math.PI / 2, 0, -angle] as [number, number, number],
          length,
          width: 0.045 + wobble(i, 3) * 0.05,
        };
      }),
    [],
  );

  return (
    <group>
      {cracks.map((crack) => (
        <mesh key={crack.key} position={crack.position} rotation={crack.rotation}>
          <planeGeometry args={[crack.length, crack.width]} />
          <meshBasicMaterial color={theme.forge} transparent opacity={0.34} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Drowned Choir: the room is under water, and you are fighting in it.
 *
 * A single translucent plane just above the floor does more to say where you are
 * than any amount of blue, because it sits between the eye and the ground and
 * everything below it reads as submerged. It rises and falls slowly so the
 * surface is alive without asking for attention.
 *
 * This is the whole feature. Broken columns standing in the water were the
 * obvious next thing and they were the wrong thing: scenery a player cannot
 * touch, in a game that already has a ring of it.
 */
function FloodedFloor({ theme }: { theme: ArenaTheme }) {
  const surface = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (!surface.current) return;
    // Centimetres, not a swell. Enough that the surface is alive.
    surface.current.position.y = 0.34 + Math.sin(clock.getElapsedTime() * 0.6) * 0.04;
  });

  return (
    <group>
      <mesh ref={surface} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.34, 0]}>
        <circleGeometry args={[ARENA_RADIUS - 0.2, 64]} />
        <meshStandardMaterial
          color={theme.forge}
          transparent
          opacity={0.22}
          roughness={0.12}
          metalness={0.6}
        />
      </mesh>
    </group>
  );
}

/**
 * Gilded Husk: a hall that was laid out by someone, and is still exactly as laid
 * out.
 *
 * The one rung whose room is deliberate. Radial lines struck from the centre, a
 * raised dais under the fight, and the marks all meet where they should, which
 * reads as ceremony beside the Warden's cracked floor and the Choir's flood.
 */
function GildedHall({ theme }: { theme: ArenaTheme }) {
  return (
    <group>
      {/* Struck from the centre, 24 of them, evenly. */}
      {Array.from({ length: 24 }, (_, i) => {
        const angle = (i / 24) * Math.PI * 2;
        const inner = 3.6;
        const outer = ARENA_RADIUS - 1.4;
        const mid = (inner + outer) / 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * mid, 0.02, Math.sin(angle) * mid]}
            rotation={[-Math.PI / 2, 0, -angle]}
          >
            <planeGeometry args={[outer - inner, 0.04]} />
            <meshBasicMaterial color={theme.rune} transparent opacity={0.14} toneMapped={false} />
          </mesh>
        );
      })}

      {/* The dais. Two steps, so the fight happens on a stage. */}
      <mesh position={[0, 0.09, 0]}>
        <cylinderGeometry args={[4.4, 4.5, 0.18, 48]} />
        <meshStandardMaterial color={theme.pillar} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[3.5, 3.6, 0.14, 48]} />
        <meshStandardMaterial color={theme.ground} roughness={0.5} metalness={0.5} />
      </mesh>
    </group>
  );
}

/**
 * Rootbound King: the room lost.
 *
 * Roots cross the floor at the height of a shin, which changes how the space
 * reads even though they do not block movement, and a canopy takes the ceiling
 * away so the arena feels closed over rather than open to a sky. Between them
 * this is the rung where the architecture has already been beaten.
 */
function Overgrowth({ theme }: { theme: ArenaTheme }) {
  return (
    <group>
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2 + wobble(i, 7) * 0.7;
        const length = 12 + wobble(i, 5) * 10;
        const thickness = 0.3 + wobble(i, 9) * 0.45;
        const radius = 3 + wobble(i, 11) * 5;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * radius, thickness * 0.7, Math.sin(angle) * radius]}
            /* Laid along the floor, turned to its own bearing, and rolled a
               little so no two read as the same extruded tube. */
            rotation={[Math.PI / 2, wobble(i, 13) * 0.5, -angle + wobble(i, 3) * 0.3]}
          >
            <cylinderGeometry args={[thickness, thickness * 1.4, length, 8]} />
            <meshStandardMaterial color={theme.pillar} roughness={1} />
          </mesh>
        );
      })}

      {/* Canopy. Dark, close, and it takes the top off the room. */}
      <mesh position={[0, 8.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[ARENA_RADIUS + 1, 48]} />
        <meshStandardMaterial color={theme.wall} roughness={1} />
      </mesh>
    </group>
  );
}

/**
 * Hollow Sovereign: nothing around the floor at all.
 *
 * The wall is removed for this rung, which is the largest single change any of
 * them makes: the boundary that has been there for four fights is gone, and the
 * disc reads as floating, and nothing is put back in its place: standing stones
 * out in the dark were the obvious next move and they would only be more scenery
 * to walk past.
 */
function VoidField({ theme }: { theme: ArenaTheme }) {
  return (
    <group>
      {/* A rim on the disc, so the edge of the world is a place and not a cut. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[ARENA_RADIUS - 0.18, ARENA_RADIUS, 96]} />
        <meshBasicMaterial color={theme.rune} transparent opacity={0.22} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Whether this rung stands in a walled room at all. */
export function hasWall(level: number): boolean {
  return level !== 5;
}

export function ArenaFeatures({ level, theme }: { level: number; theme: ArenaTheme }) {
  switch (level) {
    case 2:
      return <FloodedFloor theme={theme} />;
    case 3:
      return <GildedHall theme={theme} />;
    case 4:
      return <Overgrowth theme={theme} />;
    case 5:
      return <VoidField theme={theme} />;
    default:
      return <EmberFissures theme={theme} />;
  }
}
