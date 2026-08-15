import { relicTraits, type RelicTraits } from "@relic/core";
import type { OwnedRelic } from "../state/useLoadout";
import { championFor } from "./champions";
import type { Affinity, RelicDNA } from "@relic/core";

/**
 * What the player is carrying, in a form the frame loop can read.
 *
 * Module-level rather than React state for the same reason playerHandle and
 * bossState are: the hit test, the swing curve and the input buffer all read it
 * every frame, and routing that through a hook would re-render the tree sixty
 * times a second to deliver a value that changes once per fight.
 *
 * Set once when a fight starts, so swapping relics between runs takes effect and
 * nothing can change the numbers mid-swing.
 */
export const equipped: { traits: RelicTraits | undefined } = { traits: undefined };

/**
 * What the player actually swings: the relic, leaned by the champion holding it.
 *
 * Exported and shared, because it was previously inlined in three places and one
 * of them was missing the champion half. The pre-fight briefing applied the
 * relic's traits alone, so it promised a 60 damage strong attack while an Ember
 * dealt 72 and a Frost 49. A briefing that misreports the fight is worse than no
 * briefing, because the player calibrates against it.
 */
export function combinedTraits(dna: RelicDNA | null | undefined, affinity: Affinity): RelicTraits {
  const base = relicTraits(dna);
  const champion = championFor(affinity).traits;
  return {
    ...base,
    lightDamage: base.lightDamage * champion.damage,
    heavyDamage: base.heavyDamage * champion.damage,
  };
}

/** Read once when a fight starts, so nothing can change mid-swing. */
export function setEquippedRelic(relic: OwnedRelic | null, affinity: Affinity): void {
  equipped.traits = combinedTraits(relic?.dna, affinity);
}
