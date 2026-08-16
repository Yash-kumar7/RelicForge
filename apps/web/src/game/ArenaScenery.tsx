import { Suspense, useEffect, useMemo, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { Box3, Vector3, type Group } from "three";
import { asset } from "../lib/backend";

/**
 * The thing standing around the arena, which is different for every boss.
 *
 * The ring of grey box pillars was deleted because it was the same object ten
 * times and said nothing about which fight you were in. This is the opposite: one
 * generated set piece per rung, placed a handful of times at different sizes and
 * bearings so a few copies build a skyline rather than a fence. A ruined arch, a
 * wrecked ship, an altarpiece, a dead tree and a shattered spire are still
 * distinguishable from each other as black shapes with the colour pulled out,
 * which is the test the palette-and-pillars version failed.
 *
 * They stand outside the wall's old radius and outside where a player can walk,
 * so nothing here has to be collided with. That is the difference between this
 * and the pillars: the pillars were inside the room pretending to be part of it.
 * These are the horizon.
 */

interface Placement {
  /** Bearing in turns, so a layout reads as a fraction of a circle. */
  turn: number;
  /** Distance from the middle. Beyond PLAYER_LIMIT, so it is never walked into. */
  radius: number;
  /** Multiplier on the piece's real height. */
  scale: number;
  /** A little lean, so repeats of one mesh do not read as repeats. */
  tilt?: number;
}

interface Scenery {
  slug: string;
  /** How tall one copy stands at scale 1, in metres. */
  metres: number;
  placements: Placement[];
}

/*
 * Deliberately uneven. Four evenly spaced copies read as a fence, which is what
 * the pillars were; clustering some and leaving one side almost open gives the
 * arena a front and a back.
 */
const SCENERY: Record<number, Scenery> = {
  1: {
    slug: "warden-arch",
    metres: 9,
    placements: [
      { turn: 0.08, radius: 19, scale: 1.25 },
      { turn: 0.24, radius: 23, scale: 0.85, tilt: 0.05 },
      { turn: 0.52, radius: 18, scale: 1.05, tilt: -0.04 },
      { turn: 0.71, radius: 26, scale: 1.5 },
    ],
  },
  2: {
    slug: "choir-wreck",
    metres: 10,
    placements: [
      { turn: 0.14, radius: 20, scale: 1.15, tilt: 0.12 },
      { turn: 0.46, radius: 25, scale: 1.45, tilt: -0.08 },
      { turn: 0.83, radius: 18, scale: 0.9, tilt: 0.16 },
    ],
  },
  3: {
    slug: "husk-screen",
    metres: 8.5,
    /* The ceremonial rung, so this is the one layout that is exactly regular.
       Everywhere else the unevenness is the character; here the symmetry is. */
    placements: [
      { turn: 0, radius: 19, scale: 1.2 },
      { turn: 0.25, radius: 19, scale: 1.2 },
      { turn: 0.5, radius: 19, scale: 1.2 },
      { turn: 0.75, radius: 19, scale: 1.2 },
    ],
  },
  4: {
    slug: "king-tree",
    metres: 12,
    placements: [
      { turn: 0.05, radius: 17, scale: 1.1, tilt: 0.06 },
      { turn: 0.29, radius: 21, scale: 1.35, tilt: -0.05 },
      { turn: 0.44, radius: 16.5, scale: 0.8, tilt: 0.1 },
      { turn: 0.63, radius: 24, scale: 1.6 },
      { turn: 0.88, radius: 19, scale: 1.0, tilt: -0.09 },
    ],
  },
  5: {
    slug: "sovereign-spire",
    metres: 14,
    /* Far out and few. This rung has no wall and one pool of light, and the
       spires are there to give the emptiness a scale rather than to fill it. */
    placements: [
      { turn: 0.18, radius: 30, scale: 1.4 },
      { turn: 0.57, radius: 38, scale: 1.9 },
      { turn: 0.86, radius: 27, scale: 1.1 },
    ],
  },
};

/**
 * One copy, fitted to a known height.
 *
 * Measured rather than assumed, exactly as the forge is: Meshy returns whatever
 * scale the concept implied, so a tree can arrive forty units tall or half a unit
 * tall and neither is a tree. The bounding box is solved for the height the
 * placement asked for, and the piece is sat on the floor by its own base.
 */
function Piece({
  url,
  metres,
  placement,
}: {
  url: string;
  metres: number;
  placement: Placement;
}) {
  const { scene } = useGLTF(url);
  // Cloned per copy, because the same scene object cannot be in two places.
  const model = useMemo(() => scene.clone(true), [scene]);

  const fit = useMemo(() => {
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    const scale = (size.y > 0 ? metres / size.y : 1) * placement.scale;
    return { scale, y: -box.min.y * scale };
  }, [model, metres, placement.scale]);

  const angle = placement.turn * Math.PI * 2;

  return (
    <group
      position={[Math.cos(angle) * placement.radius, fit.y, Math.sin(angle) * placement.radius]}
      /* Turned to face the middle, since every one of these was generated
         front-on and would otherwise show the arena its side. */
      rotation={[placement.tilt ?? 0, -angle + Math.PI / 2, 0]}
      scale={fit.scale}
    >
      <primitive object={model as unknown as Group} />
    </group>
  );
}

export function ArenaScenery({ level }: { level: number }) {
  const scenery = SCENERY[level];
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!scenery) return undefined;
    let cancelled = false;
    // A fresh clone has no generated assets, and an arena with no horizon is
    // better than an arena that throws.
    fetch(asset(`/assets/arena/${scenery.slug}/model.glb`), { method: "HEAD" })
      .then((res) => !cancelled && setAvailable(res.ok))
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, [scenery]);

  if (!scenery || !available) return null;
  const url = asset(`/assets/arena/${scenery.slug}/model.glb`);

  return (
    <Suspense fallback={null}>
      {scenery.placements.map((placement, i) => (
        <Piece key={i} url={url} metres={scenery.metres} placement={placement} />
      ))}
    </Suspense>
  );
}
