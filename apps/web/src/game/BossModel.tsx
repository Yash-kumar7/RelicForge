import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import type { Group } from "three";
import { handSocketFor } from "./handSockets";
import { fitCharacter } from "../lib/characterFit";
import { AnimatedCharacter } from "./AnimatedCharacter";
import { asset as assetUrl } from "../lib/backend";

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

/** Exported so anything sized against the boss uses the same number. */
export const BOSS_HEIGHT = 2.75;

function StaticBoss({ slug, onLoaded }: { slug: string; onLoaded: () => void }) {
  const { scene } = useGLTF(assetUrl(`/assets/bosses/${slug}/model.glb`));
  const model = useMemo(() => scene.clone(true), [scene]);
  const fit = useMemo(() => fitCharacter(model as Group, BOSS_HEIGHT), [model]);

  useEffect(() => onLoaded(), [onLoaded]);

  return (
    /**
     * No facing correction.
     *
     * Object3D.lookAt on a non-camera already points the object's +Z at its
     * target, and a front-on concept produces a mesh whose front IS +Z. The half
     * turn that used to be here therefore turned the boss away from the player,
     * so it advanced and attacked with its back to them. Exactly the same
     * mistake was in the champion's facing and was fixed there.
     */
    <group position={fit.offset} scale={fit.scale}>
      <primitive object={model} />
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
      const rigged = await head(assetUrl(`/assets/bosses/${slug}/rig/walking.glb`));
      if (cancelled) return;
      if (rigged) {
        setAsset("rig");
        onLoaded(true);
        return;
      }
      const staticMesh = await head(assetUrl(`/assets/bosses/${slug}/model.glb`));
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
        // Same reasoning as the static case: the parent's lookAt already aims
        // the model's front at the player, so a half turn would face it away.
        <AnimatedCharacter
          handBone={handSocketFor(slug).bone}
          url={assetUrl(`/assets/bosses/${slug}/rig/walking.glb`)}
          idleUrl={assetUrl(`/assets/bosses/${slug}/rig/idle.glb`)}
          height={BOSS_HEIGHT}
          speed={walking}
        >
          {children}
        </AnimatedCharacter>
      ) : (
        <StaticBoss slug={slug} onLoaded={() => onLoaded(true)} />
      )}
    </Suspense>
  );
}
