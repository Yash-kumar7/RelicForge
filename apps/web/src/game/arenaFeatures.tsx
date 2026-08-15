import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, type Mesh } from "three";
import { ARENA_RADIUS } from "./arenaGeometry";
import type { ArenaTheme } from "./theme";

/**
 * What makes each rung a different place, rather than the same place repainted.
 *
 * Two earlier attempts failed the same way. Ten colours and a pillar count is a
 * reskin, and the pillars turned out to be scenery nothing ever touched. Rings
 * and fissures drawn on the floor read as road markings, because flat unlit
 * geometry lying on a dark surface has nothing lighting it and nothing casting
 * onto it, so thinning it out never stops it looking like paint.
 *
 * What is left is the two things that read in a dark 3D scene: light, and
 * geometry the fight happens on top of. Every rung gets pools of its own light
 * on the floor, and one structural idea beyond that.
 *
 * Deterministic throughout, so a re-recorded run matches the previous take.
 */

/**
 * A soft round falloff, drawn once and shared.
 *
 * This is the whole difference between light and paint. A circle mesh has an
 * edge, and the edge is what makes it read as painted on; a radial gradient has
 * no edge at all, so it reads as the floor being lit. Cheap enough to build in a
 * canvas at load and reuse for every pool in the game.
 */
let cachedGlow: CanvasTexture | null = null;

function glowTexture(): CanvasTexture {
  if (cachedGlow) return cachedGlow;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  // Falls off fast and then trails, which is how light on a floor behaves.
  gradient.addColorStop(0.35, "rgba(255,255,255,0.42)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  cachedGlow = new CanvasTexture(canvas);
  return cachedGlow;
}

interface Pool {
  /** Distance from the middle of the arena, in metres. */
  radius: number;
  /** Bearing, in turns, so a layout reads as a fraction of a circle. */
  turn: number;
  /** How wide the pool of light is. */
  size: number;
  strength: number;
  /** Whether it also casts real light. Only a few can afford to. */
  lit?: boolean;
}

/** Light on the floor, and for a couple of them, light in the room. */
function Pools({ pools, colour }: { pools: Pool[]; colour: string }) {
  const texture = useMemo(() => glowTexture(), []);

  return (
    <group>
      {pools.map((pool, i) => {
        const angle = pool.turn * Math.PI * 2;
        return (
          <group
            key={i}
            position={[Math.cos(angle) * pool.radius, 0, Math.sin(angle) * pool.radius]}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <planeGeometry args={[pool.size, pool.size]} />
              <meshBasicMaterial
                map={texture}
                color={colour}
                transparent
                opacity={pool.strength}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            {/*
              A real light over a few of them, so a pool also picks out the boss's
              legs and the player's as they walk through it. Point lights are the
              expensive thing in this scene, so most pools are the cheap half of
              the effect and only some carry the other half.
            */}
            {pool.lit && (
              <pointLight
                position={[0, 1.2, 0]}
                color={colour}
                intensity={5}
                distance={9}
                decay={2}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

/**
 * Ashen Warden: coals burning up through the floor.
 *
 * Uneven and close in, so the fight is lit from underneath and from one side
 * more than the other. The only rung where the light at ground level is warmer
 * than the light from above.
 */
const WARDEN_POOLS: Pool[] = [
  { radius: 5.2, turn: 0.06, size: 7, strength: 0.5, lit: true },
  { radius: 8.4, turn: 0.31, size: 9, strength: 0.36 },
  { radius: 6.1, turn: 0.58, size: 6, strength: 0.44, lit: true },
  { radius: 9.6, turn: 0.79, size: 8, strength: 0.3 },
  { radius: 3.4, turn: 0.93, size: 5, strength: 0.34 },
];

/**
 * Drowned Choir: the room is under water.
 *
 * A translucent plane just above the floor does more than any amount of blue,
 * because it sits between the eye and the ground and everything below it reads
 * as submerged. It rises and falls a few centimetres so the surface is alive
 * without asking for attention.
 */
function FloodedFloor({ theme }: { theme: ArenaTheme }) {
  const surface = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (!surface.current) return;
    surface.current.position.y = 0.34 + Math.sin(clock.getElapsedTime() * 0.6) * 0.04;
  });

  return (
    <group>
      <mesh ref={surface} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.34, 0]}>
        <circleGeometry args={[ARENA_RADIUS - 0.2, 64]} />
        <meshStandardMaterial
          color={theme.forge}
          transparent
          opacity={0.2}
          roughness={0.1}
          metalness={0.65}
        />
      </mesh>
      {/* Lit from under the surface, which is what makes it read as water rather
          than as a sheet of glass. */}
      <Pools
        pools={[
          { radius: 0, turn: 0, size: 16, strength: 0.22, lit: true },
          { radius: 9.2, turn: 0.42, size: 10, strength: 0.16 },
          { radius: 8.1, turn: 0.88, size: 10, strength: 0.16 },
        ]}
        colour={theme.forge}
      />
    </group>
  );
}

/**
 * Gilded Husk: a hall someone laid out, still exactly as laid out.
 *
 * The fight happens on a two-step dais, lit evenly from four sides. The evenness
 * is the point: every other arena on the ladder is lit unevenly, so symmetry
 * reads as ceremony here.
 */
function GildedHall({ theme }: { theme: ArenaTheme }) {
  return (
    <group>
      <mesh position={[0, 0.09, 0]} receiveShadow>
        <cylinderGeometry args={[4.6, 4.9, 0.18, 48]} />
        <meshStandardMaterial color={theme.pillar} roughness={0.45} metalness={0.55} />
      </mesh>
      <mesh position={[0, 0.24, 0]} receiveShadow>
        <cylinderGeometry args={[3.7, 3.9, 0.14, 48]} />
        <meshStandardMaterial color={theme.ground} roughness={0.4} metalness={0.6} />
      </mesh>

      <Pools
        pools={[
          { radius: 7.5, turn: 0, size: 8, strength: 0.26, lit: true },
          { radius: 7.5, turn: 0.25, size: 8, strength: 0.26 },
          { radius: 7.5, turn: 0.5, size: 8, strength: 0.26, lit: true },
          { radius: 7.5, turn: 0.75, size: 8, strength: 0.26 },
        ]}
        colour={theme.rune}
      />
    </group>
  );
}

/**
 * Rootbound King: the room lost.
 *
 * Roots cross the floor at the height of a shin and a canopy takes the ceiling
 * away, so the arena is closed over rather than open. Light comes through two
 * gaps only, which is what a canopy does, and it is the darkest rung for it.
 */
function Overgrowth({ theme }: { theme: ArenaTheme }) {
  return (
    <group>
      {Array.from({ length: 8 }, (_, i) => {
        const wobble = ((i * 37) % 11) / 11;
        const angle = (i / 8) * Math.PI * 2 + wobble * 0.7;
        const length = 12 + wobble * 10;
        const thickness = 0.3 + wobble * 0.45;
        const radius = 3 + wobble * 5;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * radius, thickness * 0.7, Math.sin(angle) * radius]}
            /* Laid along the floor, turned to its own bearing, and rolled a
               little so no two read as the same extruded tube. */
            rotation={[Math.PI / 2, wobble * 0.5, -angle + wobble * 0.3]}
          >
            <cylinderGeometry args={[thickness, thickness * 1.4, length, 8]} />
            <meshStandardMaterial color={theme.pillar} roughness={1} />
          </mesh>
        );
      })}

      <mesh position={[0, 8.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[ARENA_RADIUS + 1, 48]} />
        <meshStandardMaterial color={theme.wall} roughness={1} />
      </mesh>

      {/* Two shafts through the canopy, and nothing else. */}
      <Pools
        pools={[
          { radius: 4.2, turn: 0.15, size: 9, strength: 0.4, lit: true },
          { radius: 8.8, turn: 0.66, size: 7, strength: 0.28, lit: true },
        ]}
        colour={theme.keyLight}
      />
    </group>
  );
}

/**
 * Hollow Sovereign: nothing around the floor at all.
 *
 * The wall is removed for this rung, the largest single change any of them
 * makes: the boundary that has been there for four fights is gone and the disc
 * reads as floating. One pool under the fight and almost nothing beyond it, so
 * the dark past the edge has no depth to it.
 */
function VoidField({ theme }: { theme: ArenaTheme }) {
  return (
    <Pools
      pools={[
        { radius: 0, turn: 0, size: 13, strength: 0.34, lit: true },
        { radius: 10.5, turn: 0.5, size: 7, strength: 0.14 },
      ]}
      colour={theme.rune}
    />
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
      return <Pools pools={WARDEN_POOLS} colour={theme.forge} />;
  }
}
