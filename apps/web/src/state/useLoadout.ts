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

interface LoadoutState {
  owned: OwnedRelic[];
  /** relicId of the weapon carried into the next fight, if any. */
  equippedId: string | null;
  claim: (relic: OwnedRelic) => void;
  equip: (relicId: string | null) => void;
  clear: () => void;
  equipped: () => OwnedRelic | null;
}

export const useLoadout = create<LoadoutState>((set, get) => ({
  owned: load(),
  equippedId: null,

  claim: (relic) =>
    set((state) => {
      // Same relic claimed twice (a cache hit replaying an earlier fight)
      // should not duplicate the entry.
      const owned = [relic, ...state.owned.filter((r) => r.relicId !== relic.relicId)].slice(0, 24);
      save(owned);
      return { owned, equippedId: relic.relicId };
    }),

  equip: (equippedId) => set({ equippedId }),

  clear: () => {
    save([]);
    set({ owned: [], equippedId: null });
  },

  equipped: () => {
    const { owned, equippedId } = get();
    return owned.find((r) => r.relicId === equippedId) ?? owned[0] ?? null;
  },
}));
