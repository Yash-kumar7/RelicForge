import { Suspense, useEffect, useMemo, useState } from "react";
import { useGLTF } from "@react-three/drei";
import type { Group } from "three";
import { fitCharacter } from "../lib/characterFit";

/**
 * A Meshy-generated boss, if one has been produced for this level.
 *
 * Static mesh moved by code, approach, telegraph and strike are whole-body
 * transforms applied by the parent, exactly as they were for the primitive
 * boss, so a generated model drops in without needing a rig or clips.
 *
 * Falls back silently when no model exists for a level: the primitive Warden is
 * always there underneath, so a missing or failed generation degrades the look
 * without breaking the fight.
 */

const BOSS_HEIGHT = 3.9;

function LoadedBoss({ slug, onLoaded }: { slug: string; onLoaded: () => void }) {
  const { scene } = useGLTF(`/assets/bosses/${slug}/model.glb`);
  const model = useMemo(() => scene.clone(true), [scene]);
  const fit = useMemo(() => fitCharacter(model as Group, BOSS_HEIGHT), [model]);

  useEffect(() => onLoaded(), [onLoaded]);

  return (
    <group position={fit.offset} scale={fit.scale}>
      {/* Concepts are framed front-on, so the mesh faces +Z out of the image.
          The parent turns to face the player, so this only needs to undo the
          model's own facing. */}
      <group rotation={[0, Math.PI, 0]}>
        <primitive object={model} />
      </group>
    </group>
  );
}

export function BossModel({
  slug,
  onLoaded,
}: {
  slug: string;
  onLoaded: (loaded: boolean) => void;
}) {
  const [failed, setFailed] = useState(false);

  // A 404 for a level that has not been generated yet is expected, not an
  // error worth surfacing to the player.
  useEffect(() => {
    let cancelled = false;
    fetch(`/assets/bosses/${slug}/model.glb`, { method: "HEAD" })
      .then((res) => {
        if (!cancelled && !res.ok) {
          setFailed(true);
          onLoaded(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          onLoaded(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, onLoaded]);

  if (failed) return null;

  return (
    <Suspense fallback={null}>
      <LoadedBoss slug={slug} onLoaded={() => onLoaded(true)} />
    </Suspense>
  );
}
