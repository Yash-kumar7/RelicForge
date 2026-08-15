import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, useGLTF } from "@react-three/drei";
import { Box3, Vector3, type Group } from "three";
import { fitCharacter } from "../lib/characterFit";
import { handSocketFor, type HandSocketRatios } from "../game/handSockets";
import { HeldWeapon } from "./HeldWeapon";
import type { OrientationHint, WeaponClass } from "@relic/core";

/**
 * Either the primitive starter blade or a generated relic. The iron sword has
 * no GLB by design, so it cannot be expressed as a url.
 */
export type HeldWeaponSpec =
  | { kind: "iron" }
  | {
      kind: "relic";
      url: string;
      weaponClass: WeaponClass;
      scale?: number;
      /**
       * Orientation override for a mesh whose ends the heuristic cannot resolve.
       *
       * Carried on the spec rather than looked up inside HeldWeapon, because the
       * viewer is shared by champions and bosses and only the caller knows which
       * asset it is showing.
       */
      hint?: OrientationHint;
    };

/**
 * Interactive viewer for a generated character.
 *
 * Shared by the champion and by the boss on the ladder, because a boss shown as
 * a flat image next to a champion you can orbit reads as the boss being a
 * placeholder. Both are real generated meshes, so both should behave that way.
 *
 * Renders nothing when the model is absent, so a fresh clone with an empty
 * storage directory still lays out correctly.
 */

const FOV = 38;

/**
 * Camera distance that actually fits the subject.
 *
 * Derived from the frustum rather than picked by eye: guessing is how the
 * champion ended up clipped top and bottom, since a camera 3.7 units back at
 * fov 38 only sees 2.55 units of height.
 */
function fitDistance(height: number, margin = 0.45): number {
  return (height / 2 + margin) / Math.tan((FOV / 2) * (Math.PI / 180));
}

/**
 * Lets the socket be nudged live, with ?socket in the URL.
 *
 * The socket for a static mesh cannot be derived, only judged against the
 * screen, and the loop of me guessing a number and someone else looking at it
 * is slow and was not converging. Arrow keys move the hand, the current value
 * prints to the console in the exact shape handSockets.ts wants, and whoever is
 * looking at the character can settle it in a few seconds.
 *
 * Off unless asked for, so it costs a player nothing.
 */
function useSocketNudge(slug: string, authored: HandSocketRatios): HandSocketRatios {
  const enabled =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("socket");
  const [ratios, setRatios] = useState(authored);

  useEffect(() => setRatios(authored), [authored]);

  useEffect(() => {
    if (!enabled) return undefined;

    const STEP = 0.01;
    const onKey = (e: KeyboardEvent) => {
      const moves: Record<string, [number, number, number]> = {
        ArrowUp: [0, STEP, 0],
        ArrowDown: [0, -STEP, 0],
        ArrowLeft: [-STEP, 0, 0],
        ArrowRight: [STEP, 0, 0],
        // Depth, since a keyboard has no third axis.
        BracketRight: [0, 0, STEP],
        BracketLeft: [0, 0, -STEP],
      };
      const move = moves[e.code];
      if (!move) return;
      e.preventDefault();

      setRatios((current) => {
        const next = {
          ...current,
          x: Number((current.x + move[0]).toFixed(3)),
          y: Number((current.y + move[1]).toFixed(3)),
          z: Number((current.z + move[2]).toFixed(3)),
        };
        console.log(
          `  "${slug}": { x: ${next.x}, y: ${next.y}, z: ${next.z}, bone: "${next.bone}" },`,
        );
        return next;
      });
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, slug]);

  return enabled ? ratios : authored;
}

function Model({
  url,
  height,
  weapon,
  accent,
  slug,
}: {
  url: string;
  height: number;
  /** Identifies which character's measured hand socket to use. */
  slug: string;
  weapon?: HeldWeaponSpec | undefined;
  accent: string;
}) {
  /*
   * Always the static mesh, never the rig.
   *
   * The rig was tried, because a bone is exact where an estimate is not. It
   * cannot be used: Meshy's rigging re-poses the character into a neutral A-pose
   * and opens the hands, so the rigged mesh has the bone but not the fist, while
   * the static mesh has the fist and no bone. A closed hand is the entire reason
   * these characters were regenerated, so the static mesh wins and its socket is
   * authored by hand in handSockets.ts.
   */
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);
  const fit = useMemo(() => fitCharacter(model as Group, height), [model, height]);

  const { width, depth } = useMemo(() => {
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    return { width: size.x * fit.scale, depth: size.z * fit.scale };
  }, [model, fit.scale]);

  const authored = handSocketFor(slug);
  const ratios = useSocketNudge(slug, authored);

  return (
    <group position={[0, -height / 2, 0]}>
      <group position={fit.offset} scale={fit.scale}>
        {/* Concepts are framed front-on, so the mesh already faces the camera. */}
        <primitive object={model} />
      </group>

      {weapon && (
        <Suspense fallback={null}>
          <group
            position={[width * ratios.x, height * ratios.y, depth * ratios.z]}
            rotation={[0, 0, (ratios.x >= 0 ? -1 : 1) * 0.38]}
          >
            <HeldWeapon weapon={weapon} accent={accent} />
          </group>
        </Suspense>
      )}
    </group>
  );
}

export function CharacterViewer({
  url,
  height,
  accent,
  className = "",
  caption,
  autoRotate = true,
  weapon,
  slug,
}: {
  url: string;
  height: number;
  accent: string;
  /** Selects which hand this character grips with. See game/handSockets.ts. */
  slug: string;
  className?: string;
  caption?: string;
  autoRotate?: boolean;
  weapon?: HeldWeaponSpec | undefined;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAvailable(null);
    fetch(url, { method: "HEAD" })
      .then((res) => !cancelled && setAvailable(res.ok))
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (available === false) return null;

  return (
    <div className={`relative cursor-grab active:cursor-grabbing ${className}`}>
      {available && (
        <Canvas camera={{ position: [0, 0.25, fitDistance(height)], fov: FOV }}>
          <ambientLight intensity={0.55} />
          <directionalLight position={[3, 5, 4]} intensity={2.1} />
          <directionalLight position={[-3, 2, -2]} intensity={0.9} color={accent} />
          <Suspense fallback={null}>
            <Model
              url={url}
              height={height}
              weapon={weapon}
              accent={accent}
              slug={slug}
            />
            <Environment preset="night" />
          </Suspense>
          {/*
            Idle rotation lives in OrbitControls rather than a useFrame so it
            yields the instant the user takes hold. Panning stays off so the
            model cannot be dragged out of frame.
          */}
          <OrbitControls
            makeDefault
            autoRotate={autoRotate}
            autoRotateSpeed={0.7}
            enablePan={false}
            minDistance={2}
            maxDistance={9}
            minPolarAngle={0.25}
            maxPolarAngle={Math.PI - 0.25}
          />
        </Canvas>
      )}

      {caption && (
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-center font-mono text-[9px] uppercase tracking-[0.25em] text-stone-600">
          {caption}
        </p>
      )}
    </div>
  );
}
