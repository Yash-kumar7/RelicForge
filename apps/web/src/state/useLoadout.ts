import { create } from "zustand";
import type { RelicDNA } from "@relic/core";

/**
 * Relics you keep.
 *
 * A one-of-one weapon that vanishes when you reload is not really yours, so
 * earned relics persist to localStorage and show up in the loadout on every
 * later run. This is also what makes the empty second slot meaningful: it reads
 * as something you have not earned *yet* rather than a feature that is missing.
 */

export interface OwnedRelic {
  relicId: string;
  name: string;
  dna: RelicDNA;
  modelUrl: string;
  conceptUrl: string | null;
  /** Wall-clock ms the forge took, or null when served from cache. */
  forgedMs: number | null;
  earnedAt: number;
  /** Which rung of the ladder produced it. */
  bossLevel: number;
}

const STORAGE_KEY = "relicforge.owned.v1";

function load(): OwnedRelic[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Shape-check rather than trust: a stale or hand-edited entry must not
    // break the loadout screen on boot.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is OwnedRelic =>
        typeof r === "object" && r !== null && "relicId" in r && "modelUrl" in r && "dna" in r,
    );
  } catch {
    return [];
  }
}

function save(relics: OwnedRelic[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(relics));
  } catch {
    /* private mode or quota, the collection is a nicety, never load-bearing */
  }
}

/**
 * What is in hand.
 *
 * Three states, not two: null means the player has not chosen yet, which is
 * distinct from having chosen the iron sword. Nothing appears in the champion's
 * hands until a choice is actually made, so the setup screen reads as a
 * sequence rather than as a set of defaults.
 */
export const IRON = "iron" as const;
export type Armament = typeof IRON | string | null;

interface LoadoutState {
  owned: OwnedRelic[];
  armament: Armament;
  claim: (relic: OwnedRelic) => void;
  select: (armament: Armament) => void;
  clear: () => void;
  /** The chosen relic, or null when the iron sword or nothing is selected. */
  equipped: () => OwnedRelic | null;
}

export const useLoadout = create<LoadoutState>((set, get) => ({
  owned: load(),
  armament: null,

  claim: (relic) =>
    set((state) => {
      // Same relic claimed twice (a cache hit replaying an earlier fight)
      // should not duplicate the entry.
      const owned = [relic, ...state.owned.filter((r) => r.relicId !== relic.relicId)].slice(0, 24);
      save(owned);
      // Claiming is itself a choice, so the new relic goes straight into hand.
      return { owned, armament: relic.relicId };
    }),

  select: (armament) => set({ armament }),

  clear: () => {
    save([]);
    set({ owned: [], armament: null });
  },

  equipped: () => {
    const { owned, armament } = get();
    if (!armament || armament === IRON) return null;
    return owned.find((r) => r.relicId === armament) ?? null;
  },
}));
