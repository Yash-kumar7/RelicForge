import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, useGLTF } from "@react-three/drei";
import { type Group } from "three";
import { fitCharacter } from "../lib/characterFit";
import { AnimatedCharacter } from "../game/AnimatedCharacter";
import { handSocketFor } from "../game/handSockets";
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

function Model({
  url,
  riggedUrl,
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
  /** The rigged version of this character, used whenever a weapon is held. */
  riggedUrl: string;
}) {
  /*
   * A held weapon renders the rigged mesh, an empty-handed one the static mesh.
   *
   * The static model has no skeleton, so its socket had to be estimated, and
   * every estimate was wrong for the same underlying reason: Meshy's rigging
   * normalises the character into an A-pose with the arms lowered, so the hand
   * bone sits at 0.57 of height while model.glb keeps the concept's raised,
   * bent-elbow fist at roughly 0.70. A ratio read from the rig therefore
   * describes a pose the static mesh is not in, and the weapon hung a quarter of
   * a unit below the fist that was supposed to hold it.
   *
   * Asking the rig at runtime removes the estimate entirely: the bone is where
   * the fist is, by definition. It costs nothing extra, because the arena
   * already loads these files.
   *
   * The relaxed mesh stays static, and needs nothing, because a character with
   * empty hands has no socket to get wrong.
   */
  const holding = weapon !== undefined;

  if (holding) {
    return (
      <group position={[0, -height / 2, 0]}>
        <AnimatedCharacter
          url={riggedUrl}
          height={height}
          // Standing still. AnimatedCharacter crawls its walk clip when idle,
          // which reads as breathing rather than as a statue.
          speed={0}
          handBone={handSocketFor(slug).bone}
        >
          <HeldWeapon weapon={weapon} accent={accent} />
        </AnimatedCharacter>
      </group>
    );
  }

  return <RelaxedModel url={url} height={height} />;
}

/** The empty-handed pose. No skeleton needed, because nothing is being held. */
function RelaxedModel({ url, height }: { url: string; height: number }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);
  const fit = useMemo(() => fitCharacter(model as Group, height), [model, height]);

  return (
    // fitCharacter stands the model with its feet on y = 0, which is what the
    // arena wants. A preview camera aims at the origin, so the rig drops by half
    // its height to put the torso on the aim point.
    <group position={[0, -height / 2, 0]}>
      <group position={fit.offset} scale={fit.scale}>
        {/* Concepts are framed front-on, so the mesh already faces the camera. */}
        <primitive object={model} />
      </group>
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
  riggedUrl,
}: {
  url: string;
  height: number;
  accent: string;
  /** Selects which hand this character grips with. See game/handSockets.ts. */
  slug: string;
  /** The rigged mesh, rendered whenever a weapon is held. */
  riggedUrl: string;
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
              riggedUrl={riggedUrl}
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
