/**
 * Combat tuning.
 *
 * Deliberately shallow. The fight exists to produce meaningful telemetry, not
 * to be a good action game — every minute spent on combat depth is a minute not
 * spent on the forge, which is the actual product.
 */
export const COMBAT = {
  player: {
    maxHp: 100,
    moveSpeed: 5.2,
    dodgeSpeed: 15,
    dodgeDurationMs: 300,
    dodgeCooldownMs: 1200,
    healAmount: 30,
    healCharges: 2,
  },
  lightAttack: {
    damage: 25,
    windupMs: 120,
    activeMs: 140,
    recoveryMs: 180,
    reach: 3.2,
    arcDeg: 110,
  },
  heavyAttack: {
    damage: 60,
    windupMs: 420,
    activeMs: 180,
    recoveryMs: 380,
    reach: 3.8,
    arcDeg: 140,
  },
  boss: {
    maxHp: 1000,
    telegraphMs: 1000,
    activeMs: 260,
    recoveryMs: 900,
    damage: 22,
    reach: 4.2,
    moveSpeed: 2.3,
    /** Keeps the boss from standing inside the player. */
    preferredRange: 3.4,
  },
} as const;

export type AttackKind = "light" | "heavy";

export interface AttackSpec {
  damage: number;
  windupMs: number;
  activeMs: number;
  recoveryMs: number;
  reach: number;
  arcDeg: number;
}

export function attackSpec(kind: AttackKind): AttackSpec {
  return kind === "heavy" ? COMBAT.heavyAttack : COMBAT.lightAttack;
}

/**
 * Hit test: within reach, and within the swing arc in front of the attacker.
 * A physics engine would answer this too, and cost a day of tuning to do it.
 */
export function isWithinArc(
  attackerPos: { x: number; z: number },
  attackerForward: { x: number; z: number },
  targetPos: { x: number; z: number },
  reach: number,
  arcDeg: number,
): boolean {
  const dx = targetPos.x - attackerPos.x;
  const dz = targetPos.z - attackerPos.z;
  const distance = Math.hypot(dx, dz);
  if (distance > reach || distance < 1e-4) return false;

  const nx = dx / distance;
  const nz = dz / distance;
  const dot = nx * attackerForward.x + nz * attackerForward.z;
  return dot >= Math.cos((arcDeg / 2) * (Math.PI / 180));
}
