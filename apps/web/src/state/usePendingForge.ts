import { create } from "zustand";

/**
 * A relic still being forged after the player has walked away.
 *
 * Level one is fully cached, so its relic appears instantly. Every other rung
 * generates for real, which is 90 to 120 seconds, and holding someone inside a
 * cinematic for two minutes is the wrong trade for a fight they may want to
 * move on from.
 *
 * The generation itself does not care. It runs server side, keyed by relic id,
 * and the client is only ever a spectator: leaving closes an event stream, it
 * does not cancel anything. Coming back is a matter of asking the record what
 * happened.
 *
 * Persisted, because the wait outlives a reload far more easily than it outlives
 * a player's patience, and a relic that vanished because someone refreshed would
 * be worse than making them wait in the first place.
 */

export interface PendingForge {
  relicId: string;
  /** Known as soon as the DNA is built, so the strip can name it while it works. */
  name: string;
  bossLevel: number;
  startedAt: number;
}

const STORAGE_KEY = "relicforge.pending.v1";

function load(): PendingForge | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    // Shape-checked rather than trusted: a stale entry from an older build must
    // not break the setup screen on boot.
    if (typeof parsed !== "object" || parsed === null) return null;
    const value = parsed as Partial<PendingForge>;
    if (typeof value.relicId !== "string" || typeof value.name !== "string") return null;
    return {
      relicId: value.relicId,
      name: value.name,
      bossLevel: typeof value.bossLevel === "number" ? value.bossLevel : 1,
      startedAt: typeof value.startedAt === "number" ? value.startedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function save(pending: PendingForge | null): void {
  try {
    if (pending) localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode or quota: the wait is a convenience, never load-bearing */
  }
}

interface PendingForgeState {
  pending: PendingForge | null;
  /** Called when the player leaves a forge that has not finished. */
  leave: (pending: PendingForge) => void;
  /** Called once the relic has been collected, or given up on. */
  settle: () => void;
}

export const usePendingForge = create<PendingForgeState>((set) => ({
  pending: load(),

  leave: (pending) => {
    save(pending);
    set({ pending });
  },

  settle: () => {
    save(null);
    set({ pending: null });
  },
}));
