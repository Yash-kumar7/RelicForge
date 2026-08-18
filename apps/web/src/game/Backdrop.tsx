import { useMemo } from "react";
import { BackSide, CanvasTexture, Color, SRGBColorSpace } from "three";
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

  /*
   * A curve, not two straight segments.
   *
   * Three stops meant the colour climbed the dome in a straight line from the
   * horizon to the zenith, and a straight line is the one shape a glow never
   * has: measured on the first rung, a stated strength of 0.16 was still clearly
   * orange thirty degrees up, because half that value is still orange and half
   * the dome is what a 75 degree camera is looking at.
   *
   * `reach` now sets how fast it dies instead of where it stops. The tail is what
   * matters and it has to fall off like light does, so the same nine stops draw a
   * tight band on the rungs that want a horizon and a broad wash on the one that
   * wants to be lit from above.
   */
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  const falloff = 2 + (1 - sky.reach) * 9;
  const overhead = sky.overhead ?? 0;

  for (let i = 0; i <= 8; i++) {
    // 0 at the zenith, 1 at the horizon.
    const t = i / 8;
    const amount = overhead + (sky.strength - overhead) * Math.pow(t, falloff);
    gradient.addColorStop(t, `#${top.clone().lerp(horizon, Math.max(0, amount)).getHexString()}`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1, 256);

  const texture = new CanvasTexture(canvas);
  /*
   * Tagged as sRGB, which is what a canvas holds.
   *
   * Untagged textures are treated as linear, so every colour in this gradient was
   * being handed to the renderer as though it were already light-linear and then
   * encoded a second time on the way out. A near-black ember tint came out as
   * strong orange, which is why a stated strength of 0.16 filled half the frame
   * and why dimming the numbers never fixed it — the numbers were never the
   * problem. Measured against a build with the dome removed, this is the change
   * that puts the horizon back behind the fight.
   */
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function Backdrop({ level, theme }: { level: number; theme: ArenaTheme }) {
  const sky = SKIES[level] ?? SKIES[1]!;
  const texture = useMemo(() => skyTexture(theme, sky), [theme, sky]);

  return (
    // Well outside the fog's far plane, so it never reads as a nearby surface,
    // and open at the bottom because the floor covers that anyway.
    <mesh>
      <sphereGeometry args={[ARENA_RADIUS * 5, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
      {/*
        Tone mapped, like everything else in the frame.

        Opting out was the reason this read as a sunset. The strengths here are
        small and the comment above them says so, but an unmapped material hands
        its colour straight to the screen while the boss, the floor and the
        scenery all come through ACES — so the one surface that was meant to sit
        behind everything was the only one rendering at full value, and it filled
        the upper half of the frame with flat orange. Measured against a build
        with the dome removed: the arches went from shapes on a bright ground to
        silhouettes, and the embers went from specks to sparks.
      */}
      <meshBasicMaterial map={texture} side={BackSide} fog={false} />
    </mesh>
  );
}
