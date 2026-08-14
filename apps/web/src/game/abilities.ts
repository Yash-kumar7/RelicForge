import type { Affinity } from "@relic/core";

/**
 * One signature move per champion.
 *
 * Stats alone do not answer "why would I pick this one". A player reads plus
 * eighteen percent damage and shrugs; they remember that Ember can burn its own
 * health to delete a quarter of a boss bar. A move is legible in a way a
 * multiplier is not, and it is the difference between three skins with different
 * numbers and three characters.
 *
 * CombatTelemetry has always declared finishingAttack as light, heavy or
 * ability, and precache-relics.ts even generates a relic for an ability finish.
 * The type has been promising something the game could not do since the first
 * commit. This is that promise being kept, which also means an ability kill now
 * produces the relic the data model always said it would.
 *
 * Each one is built from what its champion already is, so the ability explains
 * the stats rather than sitting beside them:
 *
 *   Ember has the damage and not the health, so its move spends health for
 *   damage. Frost has the health and not the damage, so its move spends time
 *   instead of dying. Storm has the movement, so its move is movement turned
 *   into a weapon.
 */

export type AbilityKind = "immolate" | "bulwark" | "surge";

export interface Ability {
  kind: AbilityKind;
  name: string;
  /** Shown in the briefing and the HUD. Says what it does, not what it costs. */
  blurb: string;
  cooldownMs: number;
}

/**
 * Bound to E rather than Q: Q already heals, and moving a control a player may
 * have learned is worse than using a free key.
 */
export const ABILITY_KEY = "KeyE";

export const ABILITIES: Record<Affinity, Ability> = {
  fire: {
    kind: "immolate",
    name: "Immolate",
    blurb: "Burn everything nearby. Costs your own health, hits from any angle.",
    cooldownMs: 11_000,
  },
  ice: {
    kind: "bulwark",
    name: "Bulwark",
    blurb: "Two seconds of nothing touching you, and some health back.",
    cooldownMs: 12_000,
  },
  storm: {
    kind: "surge",
    name: "Surge",
    blurb: "Blink forward through the boss, damaging it, and dodge again at once.",
    cooldownMs: 9_000,
  },
};

export function abilityFor(affinity: Affinity): Ability {
  return ABILITIES[affinity] ?? ABILITIES.fire;
}

/**
 * Tuning, kept beside the abilities rather than in COMBAT.
 *
 * COMBAT is the shared baseline every champion swings against; these numbers
 * belong to one champion each and would read as global tuning if they sat there.
 */
export const ABILITY = {
  immolate: {
    damage: 85,
    /** Lands in every direction, unlike a swing, so positioning matters less. */
    radius: 5.5,
    /** Fraction of maximum health spent. The cost is the character. */
    healthCost: 0.12,
  },
  bulwark: {
    invulnerableMs: 2000,
    heal: 15,
  },
  surge: {
    damage: 50,
    /** How far the blink travels, in world units. */
    distance: 7,
    durationMs: 260,
    /** How close the boss must be to the path to be caught by it. */
    catchRadius: 3.4,
  },
} as const;

/** Live cooldown, read by the HUD. Module-level for the same reason playerHandle is. */
export const abilityState = { readyAt: 0, lastUsedAt: 0 };

export function resetAbility(): void {
  abilityState.readyAt = 0;
  abilityState.lastUsedAt = 0;
}
