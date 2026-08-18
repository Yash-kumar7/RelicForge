import { attackSpec, type AttackKind } from "./combat";
import { equipped } from "./equipped";
import { frozenAt } from "./feedback";

/**
 * Swing progress as a single curve, shared by every view.
 *
 * The first-person blade animated but the third-person avatar only leaned, so
 * from behind the weapon appeared to stay rigid while damage happened anyway.
 * One curve, driven by the same timings the hit test reads, means what you see
 * is what actually connects in every camera mode.
 *
 * Returns a small forward lead during the wind-up and up to ~2.65 through the
 * strike. Never negative: nothing in a swing travels away from the target.
 */
export function swingProgress(
  attack: { kind: AttackKind; startedAt: number } | null,
  now = performance.now(),
): number {
  if (!attack) return 0;

  /*
   * Held on the frame of impact while a hitstop is running.
   *
   * Only the pose is frozen. Hit detection keeps its own clock, so nothing here
   * can change what a swing reaches or when damage applies — the blade simply
   * stops inside what it struck for sixty-odd milliseconds and then continues
   * from where it was, which is the oldest impact trick in action games and the
   * one this fight was missing.
   */
  const held = frozenAt(now);
  if (held !== null) now = held;

  // Same traits the hit test uses, so a faster relic also animates faster.
  const spec = attackSpec(attack.kind, equipped.traits);
  const total = spec.windupMs + spec.activeMs + spec.recoveryMs;
  const t = Math.min(1, (now - attack.startedAt) / total);
  const windup = spec.windupMs / total;
  const amplitude = attack.kind === "heavy" ? 2.9 : 2.1;

  /*
   * No backswing.
   *
   * The wind-up used to travel to -0.6, pulling the blade away from the target
   * before driving it through. That is how a swing is animated, and it read
   * wrong here: at 120ms for a light attack the eye catches the reversal and not
   * much else, so the weapon appeared to move backwards when the player pressed
   * attack.
   *
   * The wind-up now leads forward instead. There is still motion during it, so
   * a heavy attack does not sit frozen for 420ms, but every frame of a swing now
   * travels toward the thing being hit.
   */
  if (t < windup) return (t / windup) * 0.25;

  const struck = (t - windup) / (1 - windup);
  return 0.25 + Math.sin(struck * Math.PI) * amplitude;
}

/**
 * How high the blade is carried through a swing, 0 at rest and 1 fully raised.
 *
 * A cut is two beats and this is the first of them. swingProgress has no
 * backswing by design — every frame of it travels toward the target — which is
 * right for the horizontal part of a cut and leaves the vertical part with
 * nowhere to come from. Driving the blade's height off it made the whole motion
 * travel one way: the sword scooped up off the floor and into the boss, which is
 * not a sword stroke, it is a shovel.
 *
 * So height gets its own curve. It rises through the wind-up, which is what a
 * wind-up is for, and falls through the strike, so the blade is above the target
 * before it comes down through it. The recovery leaves it where it landed and
 * the carry pose takes it back.
 */
export function swingLift(
  attack: { kind: AttackKind; startedAt: number } | null,
  now = performance.now(),
): number {
  if (!attack) return 0;

  const held = frozenAt(now);
  if (held !== null) now = held;

  const spec = attackSpec(attack.kind, equipped.traits);
  const total = spec.windupMs + spec.activeMs + spec.recoveryMs;
  const t = Math.min(1, (now - attack.startedAt) / total);
  const windup = spec.windupMs / total;
  const strike = windup + spec.activeMs / total;

  // Raising. Eased, so it settles at the top rather than snapping to it.
  if (t < windup) return Math.sin((t / windup) * (Math.PI / 2));
  // Cutting down through the target, which is the fast half.
  if (t < strike) return 1 - (t - windup) / (strike - windup);
  // Recovered, and the carry pose brings it home.
  return 0;
}

/**
 * How a first-person swing turns, as one set of numbers.
 *
 * Three things carry this pose and have to agree exactly or the blade drifts out
 * of the gauntlets mid-swing: the hands, the starter sword and the relic socket.
 * They were three copies of the same literals, already disagreeing by 0.05 on
 * pitch, which is the kind of drift nobody notices until the hands and the sword
 * are visibly two objects.
 *
 * The direction was also wrong in all three. The blade is carried out to the
 * right, and rolling further negative takes it clockwise on screen, so the tip
 * swept further right and down, out of the frame and away from whatever was in
 * front of it. That is a sword leaving to the right and coming back rather than
 * cutting through anything.
 *
 * Rolling positive is counter-clockwise on screen and yawing positive turns the
 * blade across the view, so together they carry the tip from the right shoulder
 * down across the body, which is the way a right hand cuts.
 */
export function firstPersonSwingPose(swing: number, mirrored = false): [number, number, number] {
  /*
   * Mirrored swings come back the other way.
   *
   * Yaw and roll are what carry the tip across the view, so negating both
   * reverses the cut: right shoulder down across the body, then left shoulder
   * back across it. Pitch is untouched, because a swing drops on both sides and
   * flipping it would send the blade upward on every second blow.
   */
  const side = mirrored ? -1 : 1;
  return [-swing * 0.5, swing * 0.55 * side, swing * 0.85 * side];
}
