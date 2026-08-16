import type { RelicDNA } from "./types.js";

/**
 * How a relic fights.
 *
 * Without this a one-of-one weapon is a skin: the fight decides what it looks
 * like and nothing else, so carrying it into the next fight changes nothing.
 * Deriving the numbers from the same DNA that shaped the geometry closes that
 * loop, and it closes it honestly, because the trait and the silhouette come
 * from the same decision rather than being rolled separately.
 *
 * Everything here is a multiplier on the base attack, never a replacement. The
 * base numbers stay the single source of the fight's pacing, and a relic can
 * only lean it, which is what keeps a run with a fresh iron sword playable.
 */

export interface RelicTraits {
  /** Multipliers on base attack damage. */
  lightDamage: number;
  heavyDamage: number;
  /**
   * Multipliers on windup and recovery. Below 1 is faster, so these read the
   * opposite way to the damage numbers on purpose: they scale a duration.
   */
  lightSpeed: number;
  heavySpeed: number;
  /** Multiplier on reach, so a spear genuinely outranges a greatsword. */
  reach: number;
}

const NEUTRAL: RelicTraits = {
  lightDamage: 1,
  heavyDamage: 1,
  lightSpeed: 1,
  heavySpeed: 1,
  reach: 1,
};

/**
 * Silhouette decides the trade.
 *
 * These match what the prompt vocabularies actually draw, so the weapon plays
 * the way it looks. A brutal relic is described to Meshy as oversized, thick and
 * heavy, and it swings like it. An elegant one is narrow and tapered, and it is
 * quick and long rather than punishing.
 */
const BY_TEMPERAMENT: Record<RelicDNA["temperament"], Partial<RelicTraits>> = {
  brutal: { heavyDamage: 1.3, lightDamage: 0.9, heavySpeed: 1.15, lightSpeed: 1.05 },
  balanced: { heavyDamage: 1.08, lightDamage: 1.08 },
  elegant: { lightDamage: 1.25, heavyDamage: 0.85, lightSpeed: 0.82, heavySpeed: 0.9 },
};

/**
 * Class decides range.
 *
 * A spear that does not outrange a greatsword is a greatsword with a different
 * silhouette, and the player picked their way into it by dodging.
 */
const BY_CLASS: Record<RelicDNA["weaponClass"], Partial<RelicTraits>> = {
  greatsword: {},
  spear: { reach: 1.18, heavyDamage: 0.95 },
  warhammer: { heavyDamage: 1.15, heavySpeed: 1.1, reach: 0.95 },
};

/**
 * Condition is a trade, never a penalty.
 *
 * A shattered relic is the one earned by winning at eight percent health, so
 * making it strictly the weakest would punish the best story the game can tell.
 * Instead it is what it looks like: a jagged wreck that hits far harder and is
 * slower and clumsier for it.
 */
const BY_CONDITION: Record<RelicDNA["condition"], Partial<RelicTraits>> = {
  pristine: { lightDamage: 1.1, heavyDamage: 1.1 },
  "battle-worn": { lightDamage: 1.05, heavyDamage: 1.05, lightSpeed: 0.95, heavySpeed: 0.95 },
  shattered: { lightDamage: 1.2, heavyDamage: 1.2, lightSpeed: 1.15, heavySpeed: 1.15 },
};

/**
 * Hard bounds on the compounded result.
 *
 * Three independent layers multiply, so the extremes stack: brutal, warhammer
 * and shattered together reached 1.79x heavy damage, well past anything the
 * fight was tuned against. Clamping here rather than hand-tuning each layer down
 * means the invariant survives someone adding a fourth axis later, which is
 * exactly when this would otherwise break quietly.
 */
const MIN_MULTIPLIER = 0.65;
const MAX_MULTIPLIER = 1.65;

function combine(...layers: Partial<RelicTraits>[]): RelicTraits {
  const out = { ...NEUTRAL };
  for (const layer of layers) {
    for (const key of Object.keys(out) as (keyof RelicTraits)[]) {
      if (layer[key] !== undefined) out[key] *= layer[key];
    }
  }
  for (const key of Object.keys(out) as (keyof RelicTraits)[]) {
    out[key] = Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, out[key]));
  }
  return out;
}

/**
 * Element leans the weapon, on axes nothing else touches.
 *
 * This used to be empty, and the comment explaining why said that element comes
 * from the affinity picked before any fighting, so giving it power would turn
 * that screen into a choice about which element is strongest. That was true when
 * it was written and stopped being true when champions gained their own
 * multipliers: the affinity screen already decides damage, health and how often
 * you can dodge. Element was the only thing left pretending otherwise.
 *
 * What it left behind was worse than an inconsistency. Element is a third of the
 * DNA, so two relics won the same way against different bosses were the same
 * weapon in different colours, and a loadout full of them offered no reason to
 * choose one. A player asking why they would ever swap is describing a screen
 * with nothing on it.
 *
 * Each element takes a different axis, so none of them is simply better: fire
 * trades reliability for a heavier blow, ice trades speed for reach, lightning
 * trades weight for pace. They are also a real decision because relics are
 * portable: a Frost champion carrying a fire relic is durable and hits hard, and
 * that combination cannot be reached any other way.
 */
const BY_ELEMENT: Record<RelicDNA["element"], Partial<RelicTraits>> = {
  fire: { heavyDamage: 1.14, lightDamage: 0.94 },
  ice: { reach: 1.12, lightDamage: 1.06, heavySpeed: 1.08 },
  lightning: { lightSpeed: 0.88, heavySpeed: 0.92, lightDamage: 0.96 },
};
/**
 * What the boss was worth, in the weapon it left behind.
 *
 * The ladder asks a player to fight something with 2.4 times the health of the
 * first rung, and the relic that fell out of it was identical to one from the
 * Warden if the two fights went the same way. Nothing about a harder fight
 * reached the weapon, so climbing bought a different colour and a different name
 * and no reason to bother.
 *
 * Matched on the name because that is what the DNA carries, and what the prompt
 * already puts in front of Meshy. Anything unrecognised leans nothing, so a relic
 * forged before this existed, or against a boss added later, is never made worse
 * by a lookup that missed.
 *
 * Deliberately small. At the top it is a fifth more damage, which is felt across
 * a fight without making the first four rungs pointless to own, and the ladder
 * stays a choice about what you can survive rather than a queue to the only relic
 * worth having.
 */
const BY_BOSS: Record<string, Partial<RelicTraits>> = {
  "the Ashen Warden": {},
  "the Drowned Choir": { lightDamage: 1.05, heavyDamage: 1.05 },
  "the Gilded Husk": { lightDamage: 1.1, heavyDamage: 1.1 },
  "the Rootbound King": { lightDamage: 1.15, heavyDamage: 1.15, reach: 1.04 },
  "the Hollow Sovereign": { lightDamage: 1.2, heavyDamage: 1.2, reach: 1.06 },
};

export function relicTraits(dna: RelicDNA | null | undefined): RelicTraits {
  if (!dna) return { ...NEUTRAL };
  return combine(
    BY_TEMPERAMENT[dna.temperament] ?? {},
    BY_CLASS[dna.weaponClass] ?? {},
    BY_CONDITION[dna.condition] ?? {},
    BY_ELEMENT[dna.element] ?? {},
    BY_BOSS[dna.bossInfluence] ?? {},
  );
}

/**
 * What a boss alone is worth, with nothing else folded in.
 *
 * The ladder pays more for a harder rung, and until now that was invisible: a
 * player could see two relics differing by twenty percent and have no way to
 * learn the difference was which boss died. Exported so the enemy list can say
 * what clearing each one leans, rather than leaving it to be discovered by
 * owning two weapons and comparing them.
 */
export function bossTraits(bossInfluence: string): RelicTraits {
  return combine(BY_BOSS[bossInfluence] ?? {});
}

/** Compact summary for the loadout screen, so the trade is visible before the fight. */
export function describeTraits(traits: RelicTraits): string[] {
  const notes: string[] = [];
  const pct = (value: number) => `${value > 1 ? "+" : ""}${Math.round((value - 1) * 100)}%`;

  if (Math.abs(traits.lightDamage - 1) >= 0.02) notes.push(`light damage ${pct(traits.lightDamage)}`);
  if (Math.abs(traits.heavyDamage - 1) >= 0.02) notes.push(`heavy damage ${pct(traits.heavyDamage)}`);
  // Inverted on purpose: a speed multiplier below 1 is a shorter swing, which
  // the player should read as faster rather than as minus eighteen percent.
  if (Math.abs(traits.lightSpeed - 1) >= 0.02) notes.push(`light speed ${pct(1 / traits.lightSpeed)}`);
  if (Math.abs(traits.heavySpeed - 1) >= 0.02) notes.push(`heavy speed ${pct(1 / traits.heavySpeed)}`);
  if (Math.abs(traits.reach - 1) >= 0.02) notes.push(`reach ${pct(traits.reach)}`);

  return notes;
}
