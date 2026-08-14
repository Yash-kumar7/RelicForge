import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Group } from "three";
import type { WeaponClass } from "@relic/core";
import { fitCharacter } from "../lib/characterFit";
import { AnimatedCharacter } from "./AnimatedCharacter";
import { useGameStore } from "../state/useGameStore";
import { useLoadout } from "../state/useLoadout";
import { themeFor } from "./theme";
import { playerHandle } from "./Player";
import { swingProgress } from "./swing";
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

const AVATAR_HEIGHT = 1.9;

export function PlayerAvatar() {
  const [rigged, setRigged] = useState(false);
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

  // A rig may not exist for every champion, so its absence must degrade to the
  // static mesh rather than fail.
  useEffect(() => {
    let cancelled = false;
    fetch(`/assets/champions/${slug}/rig/walking.glb`, { method: "HEAD" })
      .then((res) => !cancelled && setRigged(res.ok))
      .catch(() => !cancelled && setRigged(false));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <Suspense fallback={null}>
      <AvatarBody slug={slug} accent={theme.forge} held={held} rigged={rigged} />
    </Suspense>
  );
}

function AvatarBody({
  slug,
  accent,
  held,
  rigged,
}: {
  slug: string;
  accent: string;
  held: { url: string; weaponClass: WeaponClass } | null;
  rigged: boolean;
}) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const arm = useRef<Group>(null);
  const [walkSpeed, setWalkSpeed] = useState(0);
  const { scene } = useGLTF(`/assets/champions/${slug}/model.glb`);
  const model = useMemo(() => scene.clone(true), [scene]);
  const fit = useMemo(() => fitCharacter(model as Group, AVATAR_HEIGHT), [model]);

  useFrame(({ clock }) => {
    const g = root.current;
    if (!g) return;

    // The avatar stands where the player is, on the floor rather than at eye
    // height, and faces where the camera looks.
    g.position.set(playerHandle.position.x, 0, playerHandle.position.z);
    // The mesh faces +Z at rotation zero, which is exactly what atan2 gives
    // for a direction vector. Adding PI turned the champion backwards.
    g.rotation.y = Math.atan2(playerHandle.forward.x, playerHandle.forward.z);

    if (!body.current) return;
    const t = clock.getElapsedTime();

    if (rigged) {
      // A real walk cycle replaces the bob. Throttled to state changes rather
      // than set every frame, since it crosses into React.
      const target = playerHandle.moving ? 1.35 : 0;
      setWalkSpeed((current) => (Math.abs(current - target) > 0.01 ? target : current));
    } else {
      // Fallback bob, so an unrigged character still does not look like it is
      // sliding across the floor.
      const bob = playerHandle.moving ? Math.abs(Math.sin(t * 9)) * 0.06 : Math.sin(t * 1.6) * 0.012;
      body.current.position.y = bob;
      body.current.rotation.z = playerHandle.moving ? Math.sin(t * 4.5) * 0.04 : 0;
    }

    // The body leans into it, and the weapon actually travels. A lean alone
    // reads as the character flinching while damage happens by itself.
    const swing = swingProgress(playerHandle.attacking);
    body.current.rotation.x = swing * 0.18;
    body.current.rotation.y = swing * -0.22;

    if (arm.current) {
      // A diagonal overhead arc: back and up on the wind-up, down and across
      // through the strike.
      arm.current.rotation.x = 0.2 - swing * 0.85;
      arm.current.rotation.z = -0.3 - swing * 0.75;
      arm.current.position.z = 0.12 + Math.max(0, swing) * 0.22;
    }
  });

  return (
    <group ref={root}>
      <group ref={body}>
        {rigged ? (
          <AnimatedCharacter
            url={`/assets/champions/${slug}/rig/walking.glb`}
            height={AVATAR_HEIGHT}
            speed={walkSpeed}
          >
            {/*
              Inside the hand bone, so the weapon travels with the hand through
              the walk cycle. Previously it sat at an estimated offset beside the
              body and the animated arm swung away from it, which read as the
              sword floating next to the character rather than being held.

              The rotation aligns the blade with the forearm: a bone's local axes
              are the rig's business, not the mesh's, so the canonical +Y blade
              has to be turned into the hand's frame.
            */}
            <group rotation={[Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              {held ? (
                <HeldRelicMesh url={held.url} weaponClass={held.weaponClass} />
              ) : (
                <IronSwordMesh accent={accent} />
              )}
            </group>
          </AnimatedCharacter>
        ) : (
          <group position={fit.offset} scale={fit.scale}>
            {/* Concepts face +Z out of the image; the root turns to face forward. */}
            <primitive object={model} />
          </group>
        )}

        {/* Estimated socket, for the unrigged fallback only: without a skeleton
            there is no hand bone to parent to. */}
        <group
          ref={arm}
          visible={!rigged}
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
