import type { RelicTraits } from "@relic/core";

/**
 * Combat tuning.
 *
 * Deliberately shallow. The fight exists to produce meaningful telemetry, not
 * to be a good action game, every minute spent on combat depth is a minute not
 * spent on the forge, which is the actual product.
 */
export const COMBAT = {
  player: {
    maxHp: 100,
    moveSpeed: 5.2,
    dodgeSpeed: 15,
    jumpSpeed: 6.2,
    gravity: 18,
    dodgeDurationMs: 300,
    dodgeCooldownMs: 1200,
    healAmount: 30,
    healCharges: 2,
  },
  // Reach must exceed the boss's standoff distance or attacks cannot land.
  lightAttack: {
    damage: 25,
    windupMs: 120,
    activeMs: 140,
    recoveryMs: 180,
    reach: 4.2,
    arcDeg: 130,
  },
  /**
   * Heavy is a burst, not a better light.
   *
   * It used to be strictly superior: more damage per hit and higher sustained
   * damage per second, which left no reason to ever throw a light attack. That
   * is not only a dull fight, it quietly breaks the product. Temperament is
   * decided by the ratio of heavy to light attacks, so an attack nobody uses
   * means every player is read as brutal and every player walks away with the
   * same kind of weapon.
   *
   * The recovery is what fixes it. At 1220ms of total commitment the swing
   * outlasts the boss's 1000ms telegraph, so starting one as the boss winds up
   * means wearing the hit. Heavy keeps its burst and its stagger; it now costs
   * something to use.
   */
  heavyAttack: {
    damage: 60,
    windupMs: 420,
    activeMs: 180,
    recoveryMs: 620,
    reach: 4.8,
    arcDeg: 160,
  },
  boss: {
    maxHp: 1000,
    telegraphMs: 1000,
    activeMs: 260,
    recoveryMs: 900,
    damage: 22,
    reach: 4.2,
    moveSpeed: 2.3,
    /**
     * Close enough that a light attack reaches it, far enough that it is not
     * standing inside the player. Must stay below lightAttack.reach.
     */
    preferredRange: 3.1,
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

/**
 * The base attack, leaned by whatever the player is carrying.
 *
 * Traits are applied here rather than at each call site so the swing animation,
 * the hit test and the input buffer cannot disagree about how long an attack
 * lasts. They all ask this function, so they all get the same answer.
 *
 * Damage is rounded because the player reads it in the damage popups, and 31.2
 * where the briefing promised 31 is the kind of detail that reads as a bug.
 */
export function attackSpec(kind: AttackKind, traits?: RelicTraits): AttackSpec {
  const base = kind === "heavy" ? COMBAT.heavyAttack : COMBAT.lightAttack;
  if (!traits) return base;

  const damage = kind === "heavy" ? traits.heavyDamage : traits.lightDamage;
  const speed = kind === "heavy" ? traits.heavySpeed : traits.lightSpeed;

  return {
    damage: Math.round(base.damage * damage),
    // Active frames are untouched: they are the window a hit can land, and
    // stretching them would change how forgiving the game is rather than how
    // heavy the weapon feels.
    windupMs: Math.round(base.windupMs * speed),
    activeMs: base.activeMs,
    recoveryMs: Math.round(base.recoveryMs * speed),
    reach: base.reach * traits.reach,
    arcDeg: base.arcDeg,
  };
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
