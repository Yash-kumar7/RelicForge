import type { Affinity } from "@relic/core";

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

/** Compact stat line for the affinity screen, so the trade is legible at a glance. */
export function describeChampion(champion: Champion): string {
  const { traits } = champion;
  const pct = (value: number) => `${value > 1 ? "+" : ""}${Math.round((value - 1) * 100)}%`;
  const notes: string[] = [];

  if (traits.damage !== 1) notes.push(`dmg ${pct(traits.damage)}`);
  if (traits.maxHp !== 1) notes.push(`hp ${pct(traits.maxHp)}`);
  // Inverted, because a shorter cooldown should read as more dodging, not less.
  if (traits.dodgeCooldown !== 1) notes.push(`dodge ${pct(1 / traits.dodgeCooldown)}`);

  return notes.join(" · ");
}
