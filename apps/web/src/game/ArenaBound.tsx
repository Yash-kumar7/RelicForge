import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, type Mesh, type MeshBasicMaterial } from "three";
import { ARENA_RADIUS, PLAYER_LIMIT } from "./arenaGeometry";
import { playerHandle } from "./Player";
import type { ArenaTheme } from "./theme";

/**
 * Where the arena stops, said out loud only when it matters.
 *
 * There is a hard wall at thirteen metres — the player's position is scaled back
 * onto that circle every frame — and nothing on any rung but the last one drew it.
 * So the way you learned the shape of the room was by walking into an invisible
 * surface and sliding along it, which reads as the game being broken rather than
 * as the room being bounded. The Hollow Sovereign's floor has a lit rim and is the
 * only arena in the game you can find the edge of by looking.
 *
 * Drawing that rim on every rung permanently was the obvious fix and the wrong
 * one. A bright circle painted around the fight is the road-marking problem this
 * codebase keeps deleting: it sits in frame during every second of every fight,
 * competing with the boss, describing a rule that only applies to the last metre.
 *
 * So it answers instead. Nothing is visible while the fight is where fights
 * happen, and the rim comes up as the player nears it — full strength only when
 * they are against it. The information arrives exactly when it is needed and is
 * gone the moment it is not, which is the same reason the boss telegraph is a ring
 * that appears rather than a ring that is always there.
 */

/**
 * Metres from the wall at which the rim starts to show.
 *
 * Sized against a dodge, not against a walk. A dodge is 15 m/s for 300ms, so it
 * covers 4.5 metres in one press — the first version noticed at 3.2, which means a
 * player rolling away from a telegraph could begin the dodge outside the zone and
 * finish it pinned against a wall that had not yet said anything. Being cornered is
 * the most expensive thing that can happen in this fight, so the warning has to
 * outrun the fastest way of arriving there: one full dodge, plus a stride and a
 * half of reaction.
 */
const NOTICE = 6;

export function ArenaBound({ theme }: { theme: ArenaTheme }) {
  const rim = useRef<Mesh>(null);
  const shown = useRef(0);

  useFrame((_, delta) => {
    if (!rim.current) return;

    const radial = Math.hypot(playerHandle.position.x, playerHandle.position.z);
    /*
     * 0 well inside the room, 1 against the wall — cubed, not squared.
     *
     * The zone has to be a dodge deep, and a dodge is 4.5 metres, so it reaches
     * seven metres out on a floor with a radius of thirteen: something like 70% of
     * the disc. Squared, that left the rim faintly lit through most of an ordinary
     * fight, which is the always-on ring this was written to avoid, arrived at from
     * the other direction.
     *
     * Cubed, entering the zone is a whisper and the last two metres carry almost
     * all of it. The brightness tracks how committed the player is to the wall
     * rather than how close they happen to be standing.
     */
    const nearness = Math.min(1, Math.max(0, (radial - (PLAYER_LIMIT - NOTICE)) / NOTICE));
    const target = nearness * nearness * nearness;

    /*
     * Quick to arrive, slow to leave.
     *
     * A single easing rate cannot serve both halves of this. Fast enough to catch a
     * dodge and it strobes while a player dances along the edge; slow enough to sit
     * still and it is still ramping up when the dodge has already ended, which is
     * the moment the warning existed for.
     *
     * So it is asymmetric: up in about a twentieth of a second, down over half a
     * second. Weapons and telegraphs behave the same way, for the same reason —
     * information should land immediately and clear gently.
     */
    const rate = target > shown.current ? 22 : 4;
    shown.current += (target - shown.current) * Math.min(1, delta * rate);

    const material = rim.current.material as MeshBasicMaterial;
    material.opacity = shown.current * 0.5;
    rim.current.visible = shown.current > 0.01;
  });

  return (
    /*
      Sat on the floor just inside the wall, so what lights up is the ground the
      player is about to run out of rather than a line in the air in front of them.
    */
    <mesh ref={rim} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} visible={false}>
      <ringGeometry args={[PLAYER_LIMIT - 0.9, ARENA_RADIUS, 96]} />
      <meshBasicMaterial
        color={theme.rune}
        transparent
        opacity={0}
        depthWrite={false}
        /* Added rather than blended: this is the floor being lit, and on the two
           rungs with a polished floor a blended ring reads as paint on the shine. */
        blending={AdditiveBlending}
        toneMapped={false}
        side={2}
      />
    </mesh>
  );
}
