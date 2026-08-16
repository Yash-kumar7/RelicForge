import { useMemo } from "react";
import { BackSide, CanvasTexture, Color } from "three";
import type { ArenaTheme } from "./theme";
import { ARENA_RADIUS } from "./arenaGeometry";

/**
 * What is behind everything, which until now was nothing.
 *
 * Past the arena wall the scene ended in flat clear colour, so every rung's
 * background was one value of grey-black and the horizon was wherever the wall
 * stopped. That reads as a room with the lights off rather than as a place, and
 * it is the reason the arenas felt like the same room even after the floors and
 * the lighting changed.
 *
 * A dome costs nothing. No credits, no download, one gradient built in a canvas
 * at load: dark overhead, and the rung's own colour bleeding up from the horizon
 * as if something were burning, drowning or growing just out of sight. It gives
 * the scenery something to stand against, which is what makes a silhouette a
 * silhouette.
 */

/** How much of the dome the horizon glow climbs. Low is a distant, flat world. */
interface Sky {
  /** Where the colour fades out, 0 at the horizon and 1 overhead. */
  reach: number;
  /** How strong the horizon colour is where it meets the ground. */
  strength: number;
  /** Which of the theme's colours the horizon takes. */
  from: keyof Pick<ArenaTheme, "forge" | "rune" | "ember" | "keyLight">;
  /**
   * How much colour sits directly overhead.
   *
   * Zero everywhere but the last rung, where there is no horizon to light and
   * the glow belongs above the floor instead of around it.
   */
  overhead?: number;
}

/*
 * Far dimmer than the first pass, which filled the entire background with flat
 * orange and turned the arena into a sunset. A horizon is the last thing the eye
 * should find, not the first: it sits behind the boss, the scenery and the fight,
 * and anything bright enough to compete with those is not a background.
 *
 * Strengths are now a fifth of what they were, and the glow is kept close to the
 * ground on every rung except the two that are meant to feel open.
 */
const SKIES: Record<number, Sky> = {
  // Ashen Warden: something is burning past the edge, low down and close.
  1: { reach: 0.14, strength: 0.16, from: "forge" },
  // Drowned Choir: light coming down through water, higher and colder.
  2: { reach: 0.3, strength: 0.1, from: "ember" },
  // Gilded Husk: a hall lit for a ceremony, even and low.
  3: { reach: 0.12, strength: 0.1, from: "rune" },
  // Rootbound King: almost nothing, because the canopy is over the top of it.
  4: { reach: 0.1, strength: 0.06, from: "keyLight" },
  /*
   * Hollow Sovereign: the light is above, not around.
   *
   * Every other rung glows at the horizon, because every other rung has one:
   * something is burning or drowning or growing just out of sight. This one has
   * no horizon and nothing beyond the floor, so a band at the bottom of the dome
   * was describing scenery that is not there, and at 0.07 it was too faint to
   * describe anything at all.
   *
   * It climbs instead, so the violet sits overhead and the dark gathers at the
   * edge of the disc. The room reads as being under something rather than beside
   * it, which is the only arena in the game where that is true.
   */
  5: { reach: 0.9, strength: 0.2, from: "rune", overhead: 0.22 },
};

function skyTexture(theme: ArenaTheme, sky: Sky): CanvasTexture {
  const canvas = document.createElement("canvas");
  // One pixel wide: the gradient only varies with height, so a column is the
  // entire image and the GPU stretches it around the dome for free.
  canvas.width = 1;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  const top = new Color(theme.fog);
  const horizon = new Color(theme[sky.from]);

  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, `#${top.clone().lerp(horizon, sky.overhead ?? 0).getHexString()}`);
  gradient.addColorStop(
    Math.max(0.01, 1 - sky.reach),
    // A quarter of the way in, not a third: the falloff has to be steep or the
    // colour creeps up the dome and becomes a wash rather than a horizon.
    `#${top.clone().lerp(horizon, sky.strength * 0.25).getHexString()}`,
  );
  gradient.addColorStop(1, `#${top.clone().lerp(horizon, sky.strength).getHexString()}`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1, 256);

  return new CanvasTexture(canvas);
}

export function Backdrop({ level, theme }: { level: number; theme: ArenaTheme }) {
  const sky = SKIES[level] ?? SKIES[1]!;
  const texture = useMemo(() => skyTexture(theme, sky), [theme, sky]);

  return (
    // Well outside the fog's far plane, so it never reads as a nearby surface,
    // and open at the bottom because the floor covers that anyway.
    <mesh>
      <sphereGeometry args={[ARENA_RADIUS * 5, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
      <meshBasicMaterial map={texture} side={BackSide} fog={false} toneMapped={false} />
    </mesh>
  );
}
