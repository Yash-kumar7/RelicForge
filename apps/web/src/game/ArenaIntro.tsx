import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { useGameStore } from "../state/useGameStore";
import { BOSS_SPAWN } from "./bossState";
import { SPAWN } from "./Player";

/**
 * The four seconds before the first swing — and four is the whole budget.
 *
 * The first cut of this ran five and a half and felt every bit of it. An intro is
 * spending the player's patience before they have been given anything, so the rule
 * is that no shot may outlast the information in it: the boss reads in under a
 * second, the pair reads in one, and the move back into the fight is travel rather
 * than content.
 *
 * The fight used to open on the handover pose: briefing dismissed, pointer
 * locked, and the player standing twelve metres from a boss they had only seen as
 * a portrait on a menu. Everything the arena had — the coals, the arches, the
 * horizon, the thing itself at three metres tall — arrived at once, behind a HUD,
 * while the player was working out which key dodges.
 *
 * So the fight introduces itself first: the boss alone, then the two of them
 * broadside with the arena between, then an arc round behind the champion that
 * settles into exactly the pose the player is about to inherit. The last keyframe is
 * not a compromise — it is the third-person camera's own position at spawn, computed
 * the same way Player computes it, so the handover has no cut in it at all.
 *
 * Nothing about the fight is running underneath this. Combat is unarmed, the boss
 * is standing at its spawn, and the clock has not started, so a player who watches
 * the whole thing is not being punished for watching it.
 */

/** The boss's chest. */
const SUBJECT = new Vector3(BOSS_SPAWN.x, 1.7, BOSS_SPAWN.z);

/**
 * The point between the two of them, which is what the two-shot is pointed at.
 *
 * Halfway along the line from the champion's spawn to the boss's, and a little
 * below eye height so both figures sit in the upper half of the frame with the lit
 * floor beneath them.
 */
const BETWEEN = new Vector3(
  (SPAWN.x + BOSS_SPAWN.x) / 2,
  1.55,
  (SPAWN.z + BOSS_SPAWN.z) / 2,
);

/**
 * How far to the side the two-shot stands.
 *
 * The pair are twelve metres apart and the camera is broadside to that line, so
 * this is the one shot in the sequence whose distance is a framing constraint
 * rather than a taste call: at a 75 degree vertical field on a wide viewport the
 * horizontal half-angle is about 50 degrees, so twelve metres of subject needs
 * roughly five metres of standoff to fit at all.
 *
 * Eleven fitted them and wasted the frame — measured, both figures came out small
 * against a lower half of empty floor, which is an establishing wide, not a duel.
 * Seven and a half is as close as the geometry allows while keeping both whole, and
 * it makes each of them about half again the size they were.
 */
const BROADSIDE = 7.5;

/*
 * The handover pose, derived rather than typed.
 *
 * Player puts the third-person camera one boom-length behind the eye at spawn and
 * 1.15 above it. Writing those numbers again here would mean the intro ends a
 * little off wherever the fight begins, and a jump on the last frame of a
 * cinematic is the one frame everybody sees.
 */
const HANDOVER_BOOM = 4.2;
const HANDOVER = new Vector3(SPAWN.x, SPAWN.y + 1.15, SPAWN.z + HANDOVER_BOOM);
/* Level, because the fight camera starts with no pitch. Looking at the boss's
   chest from here would tilt down and then snap flat on handover. */
const HANDOVER_LOOK = new Vector3(BOSS_SPAWN.x, SPAWN.y + 1.15, BOSS_SPAWN.z);

interface Shot {
  /** Seconds from the start of the move. */
  at: number;
  position: [number, number, number];
  look: Vector3;
}

/*
 * Four shots, and the middle two are the reason this exists.
 *
 * The first pass pointed every shot at the boss, which introduced the enemy and the
 * room and never once said who was fighting it: the champion appeared as a
 * thirty-pixel figure in the distance of the opening frame and was not seen again
 * until the player was already inside its head.
 *
 * Every fighting game opens on the pair, broadside, both whole in frame — it is the
 * shot that says this is a duel and states the mismatch in the same beat. A
 * three-metre boss against a two-and-a-half-metre champion is the argument for the
 * fight, and it can only be made in a frame with both of them in it.
 *
 * So: the boss alone, the two of them together, a hold on that, then an arc round
 * behind the champion's shoulder that keeps both in frame all the way into the
 * handover.
 */
const SHOTS: Shot[] = [
  /* Low and behind it, so the first thing in frame is three metres of boss with
     the horizon behind it rather than a wide shot of a floor. */
  { at: 0, position: [-6.5, 0.9, -8.5], look: SUBJECT },
  /* Broadside: champion on one side of the frame, boss on the other, the twelve
     metres between them doing the talking. */
  { at: 1, position: [BROADSIDE, 1.5, BETWEEN.z], look: BETWEEN },
  /* A hold, barely drifting. Every fighting game lets this frame sit — it is the
     one the player is meant to read, and a camera still moving through it reads as
     a transition rather than a statement. */
  { at: 2, position: [BROADSIDE - 0.5, 1.7, BETWEEN.z + 1], look: BETWEEN },
  /* Arcing round behind the champion, both still in frame, rising into the pose the
     fight begins in. */
  { at: 2.9, position: [5, 2.6, 9], look: BETWEEN },
  { at: 3.9, position: [HANDOVER.x, HANDOVER.y, HANDOVER.z], look: HANDOVER_LOOK },
];

const DURATION = SHOTS[SHOTS.length - 1]!.at;

/** Smooth at both ends, so no shot starts or stops with a jolt. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function ArenaIntro() {
  const { camera } = useThree();
  const startCountdown = useGameStore((s) => s.startCountdown);
  const elapsed = useRef(0);
  const finished = useRef(false);

  const positions = useMemo(() => SHOTS.map((shot) => new Vector3(...shot.position)), []);

  /*
   * Skippable by any input at all.
   *
   * A player who has seen it once must not have to sit through it again, and the
   * instinct on a cinematic is to press something rather than to hunt for a skip
   * button. It skips to the countdown rather than into the fight, so nobody is
   * dropped in front of a live boss by their own impatience.
   */
  useEffect(() => {
    const skip = () => startCountdown();
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [startCountdown]);

  useFrame((_, delta) => {
    if (finished.current) return;
    elapsed.current += delta;

    const t = Math.min(DURATION, elapsed.current);

    // Which pair of shots we are between.
    let index = 0;
    while (index < SHOTS.length - 2 && t >= SHOTS[index + 1]!.at) index += 1;

    const from = SHOTS[index]!;
    const to = SHOTS[index + 1]!;
    const span = to.at - from.at;
    const progress = span > 0 ? smoothstep(Math.min(1, (t - from.at) / span)) : 1;

    camera.position.lerpVectors(positions[index]!, positions[index + 1]!, progress);
    camera.lookAt(new Vector3().lerpVectors(from.look, to.look, progress));

    if (elapsed.current >= DURATION) {
      finished.current = true;
      startCountdown();
    }
  });

  return null;
}
