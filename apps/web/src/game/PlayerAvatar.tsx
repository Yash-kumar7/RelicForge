import { Suspense, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Group } from "three";
import type { WeaponClass } from "@relic/core";
import { fitCharacter } from "../lib/characterFit";
import { useGameStore } from "../state/useGameStore";
import { useLoadout } from "../state/useLoadout";
import { themeFor } from "./theme";
import { playerHandle } from "./Player";
import { attackSpec } from "./combat";
import { IronSwordMesh } from "./IronSwordMesh";
import { HeldRelicMesh } from "./HeldRelicMesh";

/**
 * Your champion, in the arena.
 *
 * First person was chosen to avoid needing a rigged character, and it still
 * costs nothing to render. But choosing a champion and then never seeing it
 * makes the choice pointless, so third person exists and shows the real
 * generated model swinging the real generated weapon.
 *
 * The model has no skeleton, so the "animation" is whole-body: a walk bob, a
 * lean into the swing, and a dodge roll tilt. Crude, but it reads at third
 * person distance, and it is the same constraint the boss works under.
 */

const AVATAR_HEIGHT = 1.75;

export function PlayerAvatar() {
  const affinity = useGameStore((s) => s.affinity);
  const phase = useGameStore((s) => s.phase);
  const theme = themeFor(affinity);
  const slug = affinity === "fire" ? "ember" : affinity === "ice" ? "frost" : "storm";

  const carried = useLoadout((s) => s.equipped());
  const forgeRelic = useGameStore((s) => s.forge);

  // After claiming, the freshly forged relic is what the avatar holds.
  const held = useMemo(() => {
    if (phase === "EQUIPPED" && forgeRelic.modelUrl && forgeRelic.dna) {
      return { url: forgeRelic.modelUrl, weaponClass: forgeRelic.dna.weaponClass };
    }
    if (carried) return { url: carried.modelUrl, weaponClass: carried.dna.weaponClass };
    return null;
  }, [phase, forgeRelic, carried]);

  return (
    <Suspense fallback={null}>
      <AvatarBody slug={slug} accent={theme.forge} held={held} />
    </Suspense>
  );
}

function AvatarBody({
  slug,
  accent,
  held,
}: {
  slug: string;
  accent: string;
  held: { url: string; weaponClass: WeaponClass } | null;
}) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const { scene } = useGLTF(`/assets/champions/${slug}/model.glb`);
  const model = useMemo(() => scene.clone(true), [scene]);
  const fit = useMemo(() => fitCharacter(model as Group, AVATAR_HEIGHT), [model]);

  useFrame(({ clock }) => {
    const g = root.current;
    if (!g) return;

    // The avatar stands where the player is, on the floor rather than at eye
    // height, and faces where the camera looks.
    g.position.set(playerHandle.position.x, 0, playerHandle.position.z);
    g.rotation.y = Math.atan2(playerHandle.forward.x, playerHandle.forward.z) + Math.PI;

    if (!body.current) return;
    const t = clock.getElapsedTime();

    // Walk bob, so movement does not look like sliding.
    const bob = playerHandle.moving ? Math.abs(Math.sin(t * 9)) * 0.06 : Math.sin(t * 1.6) * 0.012;
    body.current.position.y = bob;
    body.current.rotation.z = playerHandle.moving ? Math.sin(t * 4.5) * 0.04 : 0;

    // Lean into the swing. Same timing the hit test uses, so what you see is
    // what actually connects.
    let swing = 0;
    const attack = playerHandle.attacking;
    if (attack) {
      const spec = attackSpec(attack.kind);
      const total = spec.windupMs + spec.activeMs + spec.recoveryMs;
      const p = Math.min(1, (performance.now() - attack.startedAt) / total);
      const windup = spec.windupMs / total;
      swing =
        p < windup
          ? -(p / windup) * 0.35
          : Math.sin(((p - windup) / (1 - windup)) * Math.PI) * 0.75 - 0.35;
    }
    body.current.rotation.x = swing * 0.5;
  });

  return (
    <group ref={root}>
      <group ref={body}>
        <group position={fit.offset} scale={fit.scale}>
          {/* Concepts face +Z out of the image; the root turns to face forward. */}
          <primitive object={model} />
        </group>

        {/* The weapon, socketed at the estimated right hand. */}
        <group
          position={[AVATAR_HEIGHT * 0.28, AVATAR_HEIGHT * 0.46, 0.12]}
          rotation={[0.2, 0, -0.3]}
          scale={0.9}
        >
          {held ? (
            <HeldRelicMesh url={held.url} weaponClass={held.weaponClass} />
          ) : (
            <IronSwordMesh accent={accent} />
          )}
        </group>
      </group>
    </group>
  );
}
