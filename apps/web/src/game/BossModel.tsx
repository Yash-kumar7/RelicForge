import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import type { Group } from "three";
import { handSocketFor } from "./handSockets";
import { fitCharacter } from "../lib/characterFit";
import { AnimatedCharacter } from "./AnimatedCharacter";
import { asset as assetUrl } from "../lib/backend";
import { bossLift } from "./bossState";

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
          /*
           * A hint of lift, not a raise.
           *
           * The boss already had a complete swing before any of this: its curve
           * winds back to -0.8, drives through to 3.1, and applySwing scales it
           * by 1.35 because a boss is watched from further away. That is roughly
           * fifty degrees of blade travel and it read correctly.
           *
           * Giving it the player's full lift added another hundred and thirty on
           * top, and the two together came to most of a revolution — the weapon
           * tumbling rather than swinging. The player needs that lift because a
           * champion's arc alone is small and starts from a hanging carry; the
           * boss never did.
           *
           * A quarter of it, so the weapon rises a little as it winds and the
           * telegraph reads slightly better, and the swing stays the boss's own.
           */
          swing={() => bossLift() * 0.25}
        >
          {children}
        </AnimatedCharacter>
      ) : (
        <StaticBoss slug={slug} onLoaded={() => onLoaded(true)} />
      )}
    </Suspense>
  );
}
