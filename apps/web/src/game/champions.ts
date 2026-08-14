import type { Affinity } from "@relic/core";
import { COMBAT } from "./combat";

/**
 * What each champion actually is, beyond a different model.
 *
 * The three champions looked different and played identically, which made the
 * first choice in the game a cosmetic one dressed up as a decision.
 *
 * Giving them stats is safe in a way that giving the relic's element stats is
 * not, and the difference is worth stating because it looks like the same
 * question. A champion is a tool you pick before you know anything, so trading
 * one strength for another is a fair choice. A relic is a reward for how a fight
 * went, so anything that made one element stronger would turn the outcome into
 * a tier list and make some fights feel wasted.
 *
 * Every champion is therefore a trade, never a tier: each gives up as much as it
 * gains, and the totals are close enough that no rung of the ladder is easier
 * with one than another.
 *
 * They also lean toward the relic their element implies, without forcing it.
 * Storm dodges more easily, and dodging is what the forge reads as elegant, so
 * playing Storm naturally tends toward a narrow, precise weapon. It only tends:
 * play Storm aggressively and you will still earn a brutal one, which is what
 * keeps playstyle the thing that decides the relic.
 */

export interface ChampionTraits {
  /** Multiplier on attack damage. */
  damage: number;
  /** Multiplier on starting and maximum health. */
  maxHp: number;
  /** Multiplier on the dodge cooldown. Below 1 means dodge returns sooner. */
  dodgeCooldown: number;
}

/*
 * Movement speed was a trait here and has been removed.
 *
 * At the sizes that kept the three balanced, roughly ten percent either way, it
 * was invisible: nobody can feel 5.2 units per second against 5.7 while a boss
 * is winding up. A stat the player cannot perceive is not a difference, it is a
 * number on a setup screen, and it made the champions look distinguishable in a
 * table while playing identically. What remains is what can actually be felt:
 * how hard you hit, how much you can absorb, how often you can dodge, and the
 * signature move.
 */

export interface Champion {
  slug: string;
  name: string;
  /** One line, shown on the affinity screen so the trade is visible up front. */
  blurb: string;
  traits: ChampionTraits;
}

export const CHAMPIONS: Record<Affinity, Champion> = {
  fire: {
    slug: "ember",
    name: "Ember",
    blurb: "Hits hardest, breaks soonest. Fewer mistakes allowed.",
    traits: { damage: 1.18, maxHp: 0.85, dodgeCooldown: 1 },
  },
  ice: {
    slug: "frost",
    name: "Frost",
    blurb: "Absorbs the most punishment, gives up the power to end it quickly.",
    traits: { damage: 0.88, maxHp: 1.25, dodgeCooldown: 1.12 },
  },
  storm: {
    slug: "storm",
    name: "Storm",
    blurb: "Dodges again long before the others can. Fragile if you stand still.",
    traits: { damage: 0.9, maxHp: 0.85, dodgeCooldown: 0.72 },
  },
};

export function championFor(affinity: Affinity): Champion {
  return CHAMPIONS[affinity] ?? CHAMPIONS.fire;
}

/**
 * Read once when a fight starts, for the same reason the relic's traits are:
 * these feed the hit test and the movement loop every frame, and they cannot
 * change mid-fight.
 */
export const activeChampion: { traits: ChampionTraits } = {
  traits: CHAMPIONS.fire.traits,
};

export function setActiveChampion(affinity: Affinity): void {
  activeChampion.traits = championFor(affinity).traits;
}

/**
 * What a champion actually is, in the units the fight uses.
 *
 * Percentages were the wrong thing to show here. Plus eighteen percent damage
 * is a comparison, and on the setup screen there is nothing to compare against
 * yet: a player choosing for the first time has no idea what the baseline is,
 * so every figure was relative to a number they had never seen. Worse, health
 * was only ever shown as a percentage, which meant it was impossible to learn
 * before the fight that Frost carries 125 and Ember carries 85.
 *
 * These come from COMBAT and the champion's own traits rather than being typed
 * out, so a tuning change cannot leave the setup screen quoting numbers the
 * fight stopped using.
 */
export interface ChampionStats {
  health: number;
  lightDamage: number;
  heavyDamage: number;
  /** Seconds between dodges, which is how a player counts them. */
  dodgeSeconds: number;
}

export function championStats(champion: Champion): ChampionStats {
  const { traits } = champion;
  return {
    health: Math.round(COMBAT.player.maxHp * traits.maxHp),
    lightDamage: Math.round(COMBAT.lightAttack.damage * traits.damage),
    heavyDamage: Math.round(COMBAT.heavyAttack.damage * traits.damage),
    dodgeSeconds:
      Math.round((COMBAT.player.dodgeCooldownMs * traits.dodgeCooldown) / 100) / 10,
  };
}

/**
 * Labelled stat rows for the affinity screen.
 *
 * Returned as label and value pairs rather than a joined string because the
 * string version read "38/71 dmg", which requires the player to already know
 * that light comes before heavy. A stat nobody can decode is no better than no
 * stat, and the point of showing absolute numbers was to let a first-time
 * player choose without guessing.
 */
export function describeChampion(champion: Champion): { label: string; value: string }[] {
  const stats = championStats(champion);
  return [
    { label: "health", value: `${stats.health}` },
    { label: "light hit", value: `${stats.lightDamage}` },
    { label: "heavy hit", value: `${stats.heavyDamage}` },
    { label: "dodge every", value: `${stats.dodgeSeconds}s` },
  ];
}
