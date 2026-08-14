import { relicTraits, type RelicTraits } from "@relic/core";
import type { OwnedRelic } from "../state/useLoadout";
import { championFor } from "./champions";
import type { Affinity } from "@relic/core";

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
 * Champion damage folds in here rather than being applied at the hit test.
 *
 * The briefing, the swing curve and the damage popups all read attackSpec, so
 * anything applied outside it would show one number and deal another.
 */
export function setEquippedRelic(relic: OwnedRelic | null, affinity: Affinity): void {
  const base = relic ? relicTraits(relic.dna) : relicTraits(null);
  const champion = championFor(affinity).traits;
  equipped.traits = {
    ...base,
    lightDamage: base.lightDamage * champion.damage,
    heavyDamage: base.heavyDamage * champion.damage,
  };
}
