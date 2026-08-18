import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BackSide, CanvasTexture, type Mesh, type MeshBasicMaterial } from "three";
import { ARENA_RADIUS, PLAYER_LIMIT } from "./arenaGeometry";
import { playerHandle } from "./Player";
import type { ArenaTheme } from "./theme";

/**
 * Where the arena stops, said out loud only when it matters.
 *
 * There is a hard wall at thirteen metres — the player's position is scaled back
 * onto that circle every frame — and nothing but the last rung drew it. So the way
 * you learned the shape of the room was by walking into an invisible surface and
 * sliding along it, which reads as the game being broken rather than as the room
 * being bounded.
 *
 * It answers rather than announcing: nothing is visible while the fight is where
 * fights happen, and it rises as the player nears it. A permanent marker would sit
 * in frame during every second of every fight, competing with the boss, describing
 * a rule that only applies to the last metre.
 *
 * It is a wall, not a ring — and that distinction is the whole design.
 *
 * The first version drew a lit band on the floor, which was wrong for a reason that
 * only shows up in play: the boss telegraph is *also* a ring on the ground, in
 * #ff2f21, meaning get out of this circle. Two ground rings in nearly the same
 * colour, one saying leave and one saying you cannot, is a player being asked to
 * read two opposite instructions out of one symbol — in the half second before
 * something with a two-handed sword commits to a swing.
 *
 * So the ground belongs to the boss, and the edge of the room stands up. A vertical
 * curtain cannot be confused with a floor marking, because nothing else in the game
 * is vertical, and it says what it means: there is something here you cannot walk
 * through.
 *
 * It darkens rather than glows, which took a second attempt to get right. The first
 * curtain was pale and additive, and on a screen where every arena is near-black and
 * light is the accent, adding light to say "stop" both washed the frame and used the
 * vocabulary reserved for things worth walking toward — coals, vents, the forge. The
 * edge of the world is the opposite of those: it is where the light runs out. Drawn
 * as the rung's own fog colour thickening upward, it occludes the horizon glow, so
 * what the player sees is the room going dark ahead of them.
 */

/** Metres from the wall at which the curtain starts to show. */
const NOTICE = 6;

/** How high the curtain stands. Chest height on the champion, and no higher. */
const HEIGHT = 2.6;

/**
 * Alpha down the curtain: solid at the floor, gone at the top.
 *
 * A hard-edged wall would read as a fence. What is wanted is the impression of
 * something thickening in the air as you get close to it, which is a gradient with
 * no top edge in it at all.
 */
let cached: CanvasTexture | null = null;

function curtainTexture(): CanvasTexture {
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 128);
  // Canvas y runs downward and the texture is applied up the cylinder, so the top
  // of this image is the top of the wall.
  /* Densest at the top of the wall, thinning to nothing at the floor: the dark
     gathers overhead and the ground stays readable, which is the way round that
     keeps a player's footing visible while they are being told to stop. */
  gradient.addColorStop(0, "rgba(255,255,255,0.9)");
  gradient.addColorStop(0.6, "rgba(255,255,255,0.45)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1, 128);

  cached = new CanvasTexture(canvas);
  return cached;
}

export function ArenaBound({ theme }: { theme: ArenaTheme }) {
  const curtain = useRef<Mesh>(null);
  const shown = useRef(0);
  const texture = useMemo(() => curtainTexture(), []);

  useFrame((_, delta) => {
    if (!curtain.current) return;

    const radial = Math.hypot(playerHandle.position.x, playerHandle.position.z);
    /*
     * 0 well inside the room, 1 against the wall — cubed.
     *
     * The zone has to be a dodge deep, and a dodge is 4.5 metres (15 m/s for 300ms),
     * so it reaches seven metres out on a floor of radius thirteen: about 70% of the
     * disc. Squared, that left the wall faintly up through most of an ordinary
     * fight. Cubed, entering the zone is a whisper and the last two metres carry
     * nearly all of it, so brightness tracks commitment rather than position.
     */
    const nearness = Math.min(1, Math.max(0, (radial - (PLAYER_LIMIT - NOTICE)) / NOTICE));
    const target = nearness * nearness * nearness;

    /*
     * Quick to arrive, slow to leave.
     *
     * Fast enough to catch a dodge — the case the warning exists for — and slow
     * enough on the way out that dancing along the edge does not strobe it.
     */
    const rate = target > shown.current ? 22 : 4;
    shown.current += (target - shown.current) * Math.min(1, delta * rate);

    const material = curtain.current.material as MeshBasicMaterial;
    material.opacity = shown.current * 0.85;
    curtain.current.visible = shown.current > 0.01;
  });

  return (
    /*
      Just outside where the player is stopped, so the wall is something they come up
      against rather than something they stand inside.
    */
    <mesh ref={curtain} position={[0, HEIGHT / 2, 0]} visible={false}>
      <cylinderGeometry args={[ARENA_RADIUS - 0.4, ARENA_RADIUS - 0.4, HEIGHT, 96, 1, true]} />
      {/*
        The rung's own fog colour, blended normally rather than added.

        Never the telegraph's red — this is the room, not a threat — and never a
        light: measured against a build with a pale additive curtain, adding
        brightness at the edge lifted the whole frame and read as fog rolling in.
        Darkness is the one signal this palette has spare.
      */}
      <meshBasicMaterial
        map={texture}
        color={theme.fog}
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
        side={BackSide}
      />
    </mesh>
  );
}
