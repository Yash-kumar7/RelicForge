import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, useGLTF } from "@react-three/drei";
import type { Group } from "three";
import { fitCharacter } from "../lib/characterFit";

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

function Model({ url, height }: { url: string; height: number }) {
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
}: {
  url: string;
  height: number;
  accent: string;
  className?: string;
  caption?: string;
  autoRotate?: boolean;
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
            <Model url={url} height={height} />
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
