import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, RepeatWrapping, type Group, type Mesh } from "three";
import { useGameStore } from "../state/useGameStore";
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

export function glowTexture(): CanvasTexture {
  if (cachedGlow) return cachedGlow;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  /*
   * Falls off fast and then trails, which is how light on a floor behaves.
   *
   * The first version held 0.42 alpha out to a third of the radius, and measured
   * on the floor that is not a falloff at all: it renders as a flat disc of
   * colour with a soft rim, which is the painted look this texture exists to
   * avoid. The hot part is now a fifth of the radius and everything past it is
   * tail.
   */
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, "rgba(255,255,255,0.5)");
  gradient.addColorStop(0.42, "rgba(255,255,255,0.16)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.04)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  cachedGlow = new CanvasTexture(canvas);
  return cachedGlow;
}

/**
 * Grain for the arena floor, as a roughness map.
 *
 * The floor was one flat value across twenty-eight metres. A large area of a
 * single colour reads as paint no matter how it is lit, because every patch of it
 * takes the light identically — so there is no material to read and no scale to
 * measure a stride against.
 *
 * Built here rather than shipped, since it is only noise, and it drives roughness
 * rather than colour: the tint stays exactly the theme's and what varies is how
 * each patch catches light. Two frequencies, because one is a pattern and two is
 * a surface, and tiled far enough that the repeat never lands inside a glance.
 */
let cachedGrain: CanvasTexture | null = null;

export function grainTexture(): CanvasTexture {
  if (cachedGrain) return cachedGrain;

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Mid grey, so the map neither polishes nor roughens the material on average.
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, size, size);

  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      /* Coarse patches for wear, fine speckle for tooth. Deterministic on
         position rather than random per pixel, so the coarse band is actually
         coarse instead of dissolving into the fine one. */
      const coarse = Math.sin(x * 0.09) * Math.cos(y * 0.11) * 26;
      const fine = (Math.sin(x * 1.7 + y * 2.3) + Math.sin(x * 2.9 - y * 1.3)) * 12;
      const value = Math.max(0, Math.min(255, 128 + coarse + fine));
      const i = (y * size + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(9, 9);
  cachedGrain = texture;
  return texture;
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
/*
 * Down by a third across the board.
 *
 * These were set against a floor that rendered pale grey, because the night
 * environment map was washing it: the pools had to be half opaque to be seen at
 * all, and at half opaque a soft gradient is a solid ellipse. With the wash gone
 * the floor is the dark stone it was always meant to be, so the light can be
 * light again.
 */
const WARDEN_POOLS: Pool[] = [
  { radius: 5.2, turn: 0.06, size: 7, strength: 0.34, lit: true },
  { radius: 8.4, turn: 0.31, size: 9, strength: 0.24 },
  { radius: 6.1, turn: 0.58, size: 6, strength: 0.3, lit: true },
  { radius: 9.6, turn: 0.79, size: 8, strength: 0.2 },
  { radius: 3.4, turn: 0.93, size: 5, strength: 0.22 },
];

/**
 * Ashen Warden, continued: the coals the pools are coming from.
 *
 * The pools were the whole rung, and a pool of light with nothing making it is a
 * bright patch on a dark floor. Every other rung on the ladder has something
 * built in it; this one is the first fight in the game and had the least in it,
 * which is the wrong way round for the arena most people will ever see.
 *
 * A clinker rim and a hot core under each pool give the light a source. Kept
 * ankle-low and clear of the middle, because anything that stands up inside the
 * fight ring is the scenery-nobody-touches problem that deleted the pillars and
 * the roots.
 */
function CoalBeds({ theme }: { theme: ArenaTheme }) {
  /* Clinker, placed off the bed's own bearing so no two beds are ringed the
     same way, and never a full ring: coals burn through where the floor is
     weakest, not in a circle. */
  const beds = useMemo(
    () =>
      WARDEN_POOLS.map((pool, i) => {
        const angle = pool.turn * Math.PI * 2;
        const lumps = 5 + (i % 3);
        return {
          key: i,
          position: [Math.cos(angle) * pool.radius, 0, Math.sin(angle) * pool.radius] as [
            number,
            number,
            number,
          ],
          core: pool.size * 0.11,
          lumps: Array.from({ length: lumps }, (_, j) => {
            const spread = ((i * 7 + j * 29) % 13) / 13;
            const bearing = (j / lumps) * Math.PI * 2 + spread * 0.9;
            const reach = pool.size * (0.13 + spread * 0.1);
            return {
              key: j,
              position: [Math.cos(bearing) * reach, 0.04, Math.sin(bearing) * reach] as [
                number,
                number,
                number,
              ],
              size: 0.16 + spread * 0.22,
              rotation: spread * Math.PI,
            };
          }),
        };
      }),
    [],
  );

  return (
    <group>
      {beds.map((bed) => (
        <group key={bed.key} position={bed.position}>
          {/*
            The hot part, and it took a measurement to get right.

            It started as a flat disc of pale ember at 85% opacity, on the theory
            that a coal is allowed a hard edge where a pool of light is not. In
            frame it was the worst thing on the screen: a solid orange ellipse
            filling a third of the width when the camera came near one, which is
            exactly the painted-marking look the rest of this file was written to
            avoid. Sampled at 201,108,49 against a floor at 16,11,8.

            The same falloff as the spill, at a fraction of the size, so the
            middle of a bed is hotter than its edge and nothing in it has an
            outline.
          */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <planeGeometry args={[bed.core * 2.6, bed.core * 2.6]} />
            <meshBasicMaterial
              map={glowTexture()}
              color={theme.ember}
              transparent
              opacity={0.55}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>

          {bed.lumps.map((lump) => (
            <mesh
              key={lump.key}
              position={lump.position}
              rotation={[lump.rotation * 0.3, lump.rotation, lump.rotation * 0.2]}
              castShadow
            >
              {/* Burnt through and fallen in, so the pieces are slabs of floor
                  rather than rocks. Low enough to step over: a shin-height
                  version of this is furniture in the middle of a fight.

                  Chunkier and a shade lighter than the first pass, which used
                  the wall colour at half height: flat and near-black inside a
                  pool of warm light is the one combination that reads as litter
                  lying on the floor rather than as floor that has broken. */}
              <boxGeometry args={[lump.size, lump.size * 0.8, lump.size * 0.85]} />
              <meshStandardMaterial color={theme.pillar} roughness={0.95} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/**
 * Ash coming down, to go with the embers going up.
 *
 * The air in this arena already carries embers rising toward the forge, and they
 * all travel the same way at the same speed, so the space between the floor and
 * the top of the frame moves as one sheet. Ash falling through them crosses it,
 * and two directions at two speeds is the difference between a particle effect
 * and weather.
 *
 * Sparse and dim on purpose: this sits behind a fight and must never be the
 * thing the eye finds.
 */
function AshFall({ theme }: { theme: ArenaTheme }) {
  const flakes = useRef<Group>(null);

  const ash = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => {
        const a = ((i * 53) % 17) / 17;
        const b = ((i * 29) % 23) / 23;
        const angle = (i / 34) * Math.PI * 2 + a;
        const radius = 1.5 + b * (ARENA_RADIUS + 4);
        return {
          key: i,
          position: [Math.cos(angle) * radius, 0.4 + a * 11, Math.sin(angle) * radius] as [
            number,
            number,
            number,
          ],
          size: 0.02 + b * 0.035,
          fall: 0.22 + a * 0.3,
        };
      }),
    [],
  );

  useFrame((_, delta) => {
    if (!flakes.current) return;
    flakes.current.children.forEach((flake, i) => {
      flake.position.y -= delta * ash[i]!.fall;
      if (flake.position.y < 0.15) flake.position.y = 11.5;
    });
  });

  return (
    <group ref={flakes}>
      {ash.map((flake) => (
        <mesh key={flake.key} position={flake.position}>
          <sphereGeometry args={[flake.size, 5, 5]} />
          <meshBasicMaterial color={theme.ember} transparent opacity={0.3} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Ground that keeps going, and rubble standing on it.
 *
 * The floor is a disc fourteen metres across and the world ended at its edge:
 * past it the sky dome showed straight through, so the arena was a lit plate
 * floating in front of a gradient with four arches somehow standing on nothing.
 * Fog cannot fix that, because there was no surface for the fog to sit on.
 *
 * A wider plain under the disc, and broken ground between the two, so the fight
 * floor reads as the cleared middle of somewhere larger. It also gives the
 * arches a base and the scenery something to cast against, which is the whole
 * reason those arches were generated.
 */
function ScorchedPlain({ theme }: { theme: ArenaTheme }) {
  /*
   * Fourteen pieces, standing up, in clumps.
   *
   * The first pass laid twenty-six low slabs in an even ring starting at fifteen
   * and a half metres, and measured in frame they read as scattered black tiles
   * lying on the floor — dropped cards, not broken ground. Two things were wrong:
   * they were wide and flat, so from a camera at eye height there was no lit face
   * to see, and they were evenly spread, so they read as a pattern.
   *
   * Taller than wide now, pushed out past seventeen metres where the fight never
   * goes, and grouped: rubble collects where something fell over, and a gap
   * between two heaps says more about a ruin than an even scatter ever does.
   */
  const rubble = useMemo(
    () =>
      Array.from({ length: 15 }, (_, i) => {
        const a = ((i * 41) % 19) / 19;
        const b = ((i * 67) % 23) / 23;
        /*
         * Sunk, and three to a heap.
         *
         * Standing them on the ground was the mistake. A box resting exactly on a
         * dark plane at twenty metres has its base against ground the eye cannot
         * see, and measured in frame the whole ring read as cubes hanging at the
         * horizon — worse than the flat slabs it replaced, because now they were
         * obviously boxes.
         *
         * Buried to a third of their height and overlapped in threes, no piece
         * shows a full silhouette: what reads is a broken mass with corners
         * coming out of it, which is what a collapsed wall looks like.
         */
        const heap = [0.07, 0.31, 0.58, 0.86, 0.44][i % 5]!;
        const inHeap = Math.floor(i / 5);
        const angle = (heap + inHeap * 0.012 + a * 0.008) * Math.PI * 2;
        const radius = 17.4 + inHeap * 0.9 + b * 3.4;
        const height = 0.9 + a * 2.2;
        return {
          key: i,
          // A third of it is below the plain, so the base is never a straight
          // line sitting on top of a surface.
          position: [Math.cos(angle) * radius, height * 0.16, Math.sin(angle) * radius] as [
            number,
            number,
            number,
          ],
          rotation: [a * 0.34 - 0.17, angle + b * 1.4, b * 0.3 - 0.15] as [number, number, number],
          size: [1.1 + b * 1.9, height, 0.9 + a * 1.4] as [number, number, number],
        };
      }),
    [],
  );

  return (
    <group>
      {/*
        Set a touch below the fight floor, so the disc keeps its own edge: the
        arena still reads as swept and the ground around it as not.
      */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} receiveShadow>
        <circleGeometry args={[46, 64]} />
        <meshStandardMaterial color={theme.wall} roughnessMap={grainTexture()} roughness={1} />
      </mesh>

      {/*
        Lit stone, not silhouettes.

        At theme.pillar these came out as black boxes hanging on the horizon line:
        the colour is near-black by design, the ground behind them at that distance
        is near-black too, and there was no light out there to separate the two. So
        they read as floating. The ambient tint is the lightest colour this rung
        has, and it is what the vents below are throwing at them.
      */}
      {rubble.map((slab) => (
        <mesh key={slab.key} position={slab.position} rotation={slab.rotation} castShadow>
          <boxGeometry args={slab.size} />
          <meshStandardMaterial color={theme.ambient} roughness={0.95} />
        </mesh>
      ))}

      {/*
        Two vents burning out past the edge.

        They are the reason the horizon glows on this rung, and they underlight
        the arches, which is the only light in the scene coming from behind the
        player's shoulder rather than in front of it.
      */}
      {[
        { turn: 0.19, radius: 18.5 },
        { turn: 0.66, radius: 21 },
      ].map((vent) => {
        const angle = vent.turn * Math.PI * 2;
        return (
          <group
            key={vent.turn}
            position={[Math.cos(angle) * vent.radius, 0, Math.sin(angle) * vent.radius]}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
              <planeGeometry args={[9, 9]} />
              <meshBasicMaterial
                map={glowTexture()}
                color={theme.forge}
                transparent
                opacity={0.4}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            <pointLight
              position={[0, 0.8, 0]}
              color={theme.forge}
              intensity={7}
              distance={16}
              decay={2}
            />
          </group>
        );
      })}
    </group>
  );
}

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
  /*
   * The roots are gone from the floor.
   *
   * Eight cylinders lay across the arena at radius three to eight, which is
   * inside the ring the fight happens in, so the boss walked through them and so
   * did the player: the same untouchable scenery that got the pillars deleted,
   * except in the way rather than around the edge. Untextured and twenty metres
   * long, they read as pipes on a green floor rather than as anything that grew.
   *
   * What made this rung work was never the roots. It is the canopy: a ceiling
   * where every other arena has open dark, with light through two gaps, which is
   * the only rung in the game that feels covered. The generated trees stand
   * outside the floor and carry the overgrowth, where they can be looked at
   * without being walked through.
   */
  return (
    <group>
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
 * Hollow Sovereign: the room has come apart.
 *
 * This rung was defined by not having a wall, which stopped meaning anything the
 * moment every arena lost its wall: the last fight in the game became the others
 * with the features removed, which is the emptiest a room can be without being a
 * mistake.
 *
 * It gets the thing the boss is: a crown of floating shards above an empty helm.
 * The floor is ringed by pieces of something that used to be a room, hanging
 * where they broke and turning too slowly to be watched. Nothing is holding them
 * up, which is the point, and it is the only rung where the architecture is in
 * the air rather than on the ground.
 */
function VoidField({ theme }: { theme: ArenaTheme }) {
  const shards = useRef<Group>(null);

  /*
   * The room answers when the boss turns.
   *
   * Below half health the Sovereign gives a third less warning, and a fight that
   * silently gets harder reads as a fight that is cheating. The debris is the
   * tell: it stops drifting and starts moving, over two seconds, so the change
   * is announced by the place rather than by a message.
   */
  const bossHp = useGameStore((s) => s.bossHp);
  const bossMaxHp = useGameStore((s) => s.bossMaxHp);
  const enraged = bossHp > 0 && bossHp <= bossMaxHp * 0.5;
  const spin = useRef(0.026);

  /*
   * One rotation every four minutes.
   *
   * Fast enough that a player who looks twice sees it has moved, slow enough
   * that nothing appears to be spinning. A ring of debris that visibly turns
   * reads as a machine; one that has drifted a little reads as a place.
   */
  useFrame((_, delta) => {
    // Eased rather than switched, so the room accelerates into it.
    const target = enraged ? 0.34 : 0.026;
    spin.current += (target - spin.current) * Math.min(1, delta * 0.5);
    if (shards.current) shards.current.rotation.y += delta * spin.current;
  });

  const motes = useRef<Group>(null);

  /*
   * Drifting down and wrapping, which is a falling snow trick: forty spheres
   * moved slowly downward and reset to the top read as continuous fall without
   * anything being created or destroyed.
   */
  const dust = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => {
        const a = ((i * 47) % 19) / 19;
        const b = ((i * 83) % 23) / 23;
        const angle = (i / 40) * Math.PI * 2 + a;
        const radius = 2 + b * (ARENA_RADIUS + 6);
        return {
          key: i,
          position: [Math.cos(angle) * radius, 0.5 + a * 14, Math.sin(angle) * radius] as [
            number,
            number,
            number,
          ],
          size: 0.03 + b * 0.05,
        };
      }),
    [],
  );

  useFrame((_, delta) => {
    if (!motes.current) return;
    for (const mote of motes.current.children) {
      mote.position.y -= delta * 0.35;
      if (mote.position.y < 0.2) mote.position.y = 15;
    }
  });

  const pieces = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const wobble = ((i * 37) % 13) / 13;
        const drift = ((i * 61) % 17) / 17;
        const angle = (i / 22) * Math.PI * 2 + wobble * 0.5;
        const radius = ARENA_RADIUS - 2 + drift * 12;
        return {
          key: i,
          position: [
            Math.cos(angle) * radius,
            2.5 + wobble * 11,
            Math.sin(angle) * radius,
          ] as [number, number, number],
          rotation: [wobble * 3, drift * 3, wobble * 2] as [number, number, number],
          size: 0.5 + drift * 2.4,
        };
      }),
    [],
  );

  return (
    <group>
      <group ref={shards}>
        {pieces.map((piece) => (
          <mesh key={piece.key} position={piece.position} rotation={piece.rotation}>
            {/* Slabs rather than rocks: this was built and then broken. */}
            <boxGeometry args={[piece.size, piece.size * 0.22, piece.size * 0.75]} />
            <meshStandardMaterial color={theme.pillar} roughness={0.85} metalness={0.3} />
          </mesh>
        ))}
      </group>

      {/*
        A lit edge, so the floor is an object rather than where the dark stops.

        Every other arena ends at a wall or a treeline. This one ends, and without
        something marking it the disc read as the point the renderer gave up. A
        rim turns the same emptiness into a platform hanging in it, which is the
        difference between a void and a missing background.
      */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[ARENA_RADIUS - 0.5, ARENA_RADIUS, 96]} />
        <meshBasicMaterial
          color={theme.rune}
          transparent
          opacity={0.28}
          toneMapped={false}
          side={2}
        />
      </mesh>

      {/*
        Dust, falling forever.

        The shards say the room came apart; these say it is still coming apart.
        Small, slow and everywhere, they give the empty air between the floor and
        the debris something in it, which is what stops a wide shot of this arena
        reading as a black rectangle.
      */}
      <group ref={motes}>
        {dust.map((mote) => (
          <mesh key={mote.key} position={mote.position}>
            <sphereGeometry args={[mote.size, 5, 5]} />
            <meshBasicMaterial color={theme.rune} transparent opacity={0.5} toneMapped={false} />
          </mesh>
        ))}
      </group>

      <Pools
        pools={[
          { radius: 0, turn: 0, size: 13, strength: 0.34, lit: true },
          { radius: 10.5, turn: 0.5, size: 7, strength: 0.14 },
          { radius: 9.2, turn: 0.17, size: 6, strength: 0.12 },
        ]}
        colour={theme.rune}
      />
    </group>
  );
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
      return (
        <group>
          <ScorchedPlain theme={theme} />
          <Pools pools={WARDEN_POOLS} colour={theme.forge} />
          <CoalBeds theme={theme} />
          <AshFall theme={theme} />
        </group>
      );
  }
}
