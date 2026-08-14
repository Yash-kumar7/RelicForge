import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import type { Group } from "three";
import { fitCharacter } from "../lib/characterFit";
import { AnimatedCharacter } from "./AnimatedCharacter";

/**
 * A Meshy-generated boss, rigged and walking when a rig exists.
 *
 * Three levels of graceful degradation, because a fight must never depend on an
 * asset being present: the rigged walk if it was generated, the static mesh if
 * only that exists, and the primitive Warden underneath if neither does.
 *
 * Approach, telegraph and strike remain whole-body transforms applied by the
 * parent either way, so behaviour does not change with the asset.
 */

const BOSS_HEIGHT = 2.75;

function StaticBoss({ slug, onLoaded }: { slug: string; onLoaded: () => void }) {
  const { scene } = useGLTF(`/assets/bosses/${slug}/model.glb`);
  const model = useMemo(() => scene.clone(true), [scene]);
  const fit = useMemo(() => fitCharacter(model as Group, BOSS_HEIGHT), [model]);

  useEffect(() => onLoaded(), [onLoaded]);

  return (
    <group position={fit.offset} scale={fit.scale}>
      {/* Concepts are framed front-on, so the mesh faces +Z out of the image.
          The parent turns to face the player, so this only undoes the model's
          own facing. */}
      <group rotation={[0, Math.PI, 0]}>
        <primitive object={model} />
      </group>
    </group>
  );
}

export function BossModel({
  slug,
  walking,
  onLoaded,
  children,
}: {
  slug: string;
  /** 0 while it holds position, 1 while it advances on the player. */
  walking: number;
  onLoaded: (loaded: boolean) => void;
  /** Placed in the hand bone when rigged, beside the body when not. */
  children?: ReactNode;
}) {
  const [asset, setAsset] = useState<"rig" | "static" | "none" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAsset(null);

    const head = (url: string) =>
      fetch(url, { method: "HEAD" })
        .then((res) => res.ok)
        .catch(() => false);

    void (async () => {
      const rigged = await head(`/assets/bosses/${slug}/rig/walking.glb`);
      if (cancelled) return;
      if (rigged) {
        setAsset("rig");
        onLoaded(true);
        return;
      }
      const staticMesh = await head(`/assets/bosses/${slug}/model.glb`);
      if (cancelled) return;
      setAsset(staticMesh ? "static" : "none");
      onLoaded(staticMesh);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, onLoaded]);

  if (asset === null || asset === "none") return null;

  return (
    <Suspense fallback={null}>
      {asset === "rig" ? (
        // Rigged bosses face the camera in their own space too, so the same
        // half turn applies.
        <group rotation={[0, Math.PI, 0]}>
          <AnimatedCharacter
            url={`/assets/bosses/${slug}/rig/walking.glb`}
            height={BOSS_HEIGHT}
            speed={walking}
          >
            {children}
          </AnimatedCharacter>
        </group>
      ) : (
        <StaticBoss slug={slug} onLoaded={() => onLoaded(true)} />
      )}
    </Suspense>
  );
}
