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
 * Returns roughly -0.6 during the wind-up and up to ~2.4 through the strike.
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

  return t < windup
    ? -(t / windup) * 0.6
    : Math.sin(((t - windup) / (1 - windup)) * Math.PI) * amplitude - 0.6;
}
