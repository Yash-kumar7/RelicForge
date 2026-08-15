import { attackSpec, type AttackKind } from "./combat";
import { equipped } from "./equipped";

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
