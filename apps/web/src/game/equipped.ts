import { relicTraits, type RelicTraits } from "@relic/core";
import type { OwnedRelic } from "../state/useLoadout";

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

export function setEquippedRelic(relic: OwnedRelic | null): void {
  equipped.traits = relic ? relicTraits(relic.dna) : undefined;
}
