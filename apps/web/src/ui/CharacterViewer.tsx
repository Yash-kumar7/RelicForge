import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrbitControls, useGLTF } from "@react-three/drei";
import { Box3, PerspectiveCamera, Vector3, type Group } from "three";
import { fitCharacter } from "../lib/characterFit";
import { type HandSocketRatios } from "../game/handSockets";
import { fistSocketFor } from "../game/fistSockets";
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
 * Frames whatever is actually on screen, rather than what was asked for.
 *
 * The distance above is computed from the character's height, which is the
 * whole subject right up until the character is holding something. A sword is
 * carried point-up above the head, so it added most of a metre the camera had
 * never been told about, and the blade was cut off by the top of the frame.
 *
 * Nothing here is estimated. The bounding box of the mounted group is the real
 * extent of the real meshes, weapon included, so a spear-carrying boss and an
 * empty-handed champion each get the framing their own silhouette needs.
 *
 * It measures across several frames because the weapon loads behind its own
 * suspense boundary and arrives after the body: a single measurement on mount
 * would fit the figure and miss the thing this exists to catch. It settles once
 * the box stops growing.
 */
function FrameSubject({
  margin,
  onFit,
  children,
}: {
  margin: number;
  onFit: (fit: { distance: number; centerY: number }) => void;
  children: React.ReactNode;
}) {
  const subject = useRef<Group>(null);
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as
    | { target: Vector3; update: () => void }
    | undefined;

  const lastHeight = useRef(-1);
  const stableFrames = useRef(0);
  const settled = useRef(false);

  useFrame(() => {
    if (settled.current || !subject.current) return;

    const box = new Box3().setFromObject(subject.current);
    if (box.isEmpty()) return;

    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());

    // Two frames at the same height means everything that is going to load has
    // loaded. Anything less and a weapon arriving one frame late settles the
    // camera at the body's height and never corrects.
    if (Math.abs(size.y - lastHeight.current) < 1e-4) stableFrames.current += 1;
    else stableFrames.current = 0;
    lastHeight.current = size.y;

    const vertical = (size.y / 2 + margin) / Math.tan((FOV / 2) * (Math.PI / 180));
    // Width matters on a spear held across the body, where the tall dimension
    // is not the one that runs out of frame first.
    const aspect = camera instanceof PerspectiveCamera ? camera.aspect : 1;
    const halfHorizontal = Math.atan(Math.tan((FOV / 2) * (Math.PI / 180)) * aspect);
    const horizontal = (size.x / 2 + margin) / Math.tan(halfHorizontal);
    const distance = Math.max(vertical, horizontal);

    camera.position.set(0, center.y, distance);
    camera.lookAt(0, center.y, 0);
    controls?.target.set(0, center.y, 0);
    controls?.update();

    if (stableFrames.current >= 2) {
      settled.current = true;
      onFit({ distance, centerY: center.y });
    }
  });

  return <group ref={subject}>{children}</group>;
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
/** ?socket in the URL: hold the turntable still and let the socket be moved. */
const SOCKET_TUNING =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("socket");

function useSocketNudge(slug: string, authored: HandSocketRatios): HandSocketRatios {
  const enabled = SOCKET_TUNING;
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

  const authored = fistSocketFor(slug);
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
  framing = 0.45,
}: {
  url: string;
  height: number;
  accent: string;
  /** Selects which hand this character grips with. See game/handSockets.ts. */
  slug: string;
  className?: string;
  caption?: string | undefined;
  autoRotate?: boolean;
  /**
   * How much room to leave around the figure.
   *
   * Lower brings the camera in, so the character fills more of the view and is
   * cropped by it. A framed portrait wants air; a figure meant to bleed off the
   * edge of the page wants none.
   */
  framing?: number;
  weapon?: HeldWeaponSpec | undefined;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [fit, setFit] = useState<{ distance: number; centerY: number } | null>(null);

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
        <Canvas camera={{ position: [0, 0.25, fitDistance(height, framing)], fov: FOV }}>
          <ambientLight intensity={0.55} />
          <directionalLight position={[3, 5, 4]} intensity={2.1} />
          <directionalLight position={[-3, 2, -2]} intensity={0.9} color={accent} />
          <Suspense fallback={null}>
            <FrameSubject
              /* Re-measures when the subject changes, since a champion swapping
                 an iron sword for a relic changes the silhouette it needs. */
              key={`${url}:${weapon?.kind ?? "none"}:${weapon?.kind === "relic" ? weapon.url : ""}`}
              margin={framing}
              onFit={setFit}
            >
              <Model
                url={url}
                height={height}
                weapon={weapon}
                accent={accent}
                slug={slug}
              />
            </FrameSubject>
            <Environment preset="night" />
          </Suspense>
          {/*
            Idle rotation lives in OrbitControls rather than a useFrame so it
            yields the instant the user takes hold. Panning stays off so the
            model cannot be dragged out of frame.
          */}
          <OrbitControls
            makeDefault
            /*
              Held still while a socket is being placed.

              The turntable makes a front-on offset project differently at every
              angle, and depth reads as horizontal error, so two screenshots of
              the same socket disagreed about which way it was wrong. Judging a
              position against a moving target is not judging it.
            */
            autoRotate={autoRotate && !SOCKET_TUNING}
            autoRotateSpeed={0.7}
            enablePan={false}
            /*
              Zoom bounded relative to the framing, not to fixed world units.

              A flat 2..9 was a range around one particular model size, so on a
              figure framed close the near stop was already behind the camera
              and the wheel appeared to do nothing at all. Scaling the stops to
              the distance the shot was composed at means every model gets the
              same amount of travel in and out: close enough to read the grip,
              far enough to see the whole silhouette.
            */
            zoomSpeed={0.8}
            minDistance={(fit?.distance ?? fitDistance(height, framing)) * 0.42}
            maxDistance={(fit?.distance ?? fitDistance(height, framing)) * 1.7}
            minPolarAngle={0.25}
            maxPolarAngle={Math.PI - 0.25}
          />
        </Canvas>
      )}

      {/*
        The wheel belongs to the model here, not to the page.

        Without this the browser scrolls the setup screen the moment a pointer
        crosses the figure, which reads as the zoom being broken rather than as
        the page doing its normal job.
      */}
      {caption && (
        /* Clear of the feet. At bottom-3 it sat directly under the boots, close
           enough to read as something attached to the figure rather than a note
           about the view. */
        <p className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 text-center font-mono text-[9px] uppercase tracking-[0.25em] text-stone-600">
          {caption}
        </p>
      )}
    </div>
  );
}
