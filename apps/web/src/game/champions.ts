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
  /**
   * What kind of relic this champion tends to produce.
   *
   * The real reason to pick a different champion, and the screen never said it.
   * Stats answer which is stronger, which is a question about winning; this
   * answers what you walk away with, which is the question this game is about.
   *
   * It is a tendency rather than a rule. The element is fixed by the choice, but
   * condition and silhouette come from how the fight actually goes, and an Ember
   * played carefully still earns a pristine weapon. Saying "tends to" keeps that
   * true: playstyle decides, the champion leans.
   */
  forges: string;
  traits: ChampionTraits;
}

export const CHAMPIONS: Record<Affinity, Champion> = {
  fire: {
    slug: "ember",
    name: "Ember",
    blurb: "Hits hardest, breaks soonest. Fewer mistakes allowed.",
    forges: "Molten weapons. Fragile enough that fights go to the wire, so its relics tend to come out cracked and oversized.",
    traits: { damage: 1.2, maxHp: 0.8, dodgeCooldown: 1 },
  },
  ice: {
    slug: "frost",
    name: "Frost",
    blurb: "Absorbs the most punishment, gives up the power to end it quickly.",
    forges: "Crystalline weapons. Survives fights with health to spare, so its relics tend to come out flawless and ceremonial.",
    traits: { damage: 0.82, maxHp: 1.3, dodgeCooldown: 1.12 },
  },
  storm: {
    slug: "storm",
    name: "Storm",
    blurb: "Dodges again long before the others can. Fragile if you stand still.",
    forges: "Storm-etched weapons. Dodging is what the forge reads as elegant, so its relics tend to come out narrow and long.",
    traits: { damage: 1, maxHp: 0.85, dodgeCooldown: 0.75 },
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
  /**
   * How many dodges fit into ten seconds.
   *
   * A count rather than a cooldown. "Dodge every 1.2s" is a timer, and a timer
   * sitting among damage figures reads as something to be added up. A count of
   * dodges is the same fact in the units the player experiences it in, and it
   * compares across champions at a glance.
   */
  dodgesPerTenSeconds: number;
}

export function championStats(champion: Champion): ChampionStats {
  const { traits } = champion;
  return {
    health: Math.round(COMBAT.player.maxHp * traits.maxHp),
    lightDamage: Math.round(COMBAT.lightAttack.damage * traits.damage),
    heavyDamage: Math.round(COMBAT.heavyAttack.damage * traits.damage),
    dodgesPerTenSeconds: Math.round(
      10_000 / (COMBAT.player.dodgeCooldownMs * traits.dodgeCooldown),
    ),
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
  /*
   * Deliberately no damage rows.
   *
   * Damage belongs to the weapon, and putting it on the character card asked
   * the player to hold two sources of the same number in their head: if the
   * sword does the damage, what were the numbers on the character? Several
   * rounds of relabelling went into making those rows readable when the real
   * problem was that they should not have been there.
   *
   * Dodging is back, as a count rather than a cooldown.
   *
   * It was removed as a seconds figure, correctly: a timer among damage numbers
   * reads as something to add up. But removing it entirely left health as the
   * only stat, and then Storm showed 90 health against Frost's 125 while their
   * damage differed by one point. Storm was strictly worse on the card and its
   * entire reason to exist, dodging twice as often, was invisible.
   *
   * And then removed again, with the count this time. One number per card reads
   * cleanest, and the blurbs carry the difference in words: Storm's says it
   * dodges again long before the others can, which is the same fact without a
   * figure to weigh against health.
   *
   * The cost is real and worth naming. Health alone shows 130 for Frost against
   * 85 for Storm, so on the card Storm looks like a worse Frost, and the thing
   * that makes it worth playing is now only readable in prose. The stat is still
   * tuned and still applies.
   */
  return [{ label: "health", value: `${stats.health}` }];
  /*
   * Dodge cooldown is deliberately not a row.
   *
   * Every champion's blurb already states its dodging in words, and a seconds
   * figure next to three other numbers invited the reader to add them up rather
   * than read them. The number is still real and still tuned; it is just not
   * something a player needs on a card to make this choice.
   */
}
