import { create } from "zustand";

/**
 * Rank and experience.
 *
 * Deliberately cosmetic: XP buys no damage and unlocks no perks, because the
 * moment progression starts gating power, the relic stops being a record of a
 * single fight and starts being a reward for grinding. What it does is give a
 * player a reason to come back and forge a second weapon, and a way to read
 * their own history at a glance.
 */

export interface ProgressState {
  xp: number;
  fightsWon: number;
  fightsLost: number;
  relicsForged: number;
  award: (event: XpEvent) => void;
  recordLoss: () => void;
  reset: () => void;
}

export interface XpEvent {
  bossLevel: number;
  healthRemaining: number;
  dodges: number;
  healingUsed: number;
  forgedRelic: boolean;
}

const STORAGE_KEY = "relicforge.progress.xp.v1";

/*
 * Rank thresholds. Widening gaps so early ranks arrive quickly.
 *
 * Scaled by ten from where they started. Every ratio is identical, so the ladder
 * paces exactly as it did; the difference is that a boss is worth 900 rather
 * than 90, and ninety reads as loose change rather than as the reward for
 * killing something. Games use large figures for that reason and no other.
 */
export const RANKS = [
  { at: 0, name: "Unproven" },
  { at: 1500, name: "Ashbearer" },
  { at: 4000, name: "Warden-Slayer" },
  { at: 8000, name: "Relic-Bound" },
  { at: 14000, name: "Forgesworn" },
  { at: 22000, name: "Legend-Made" },
] as const;

export function rankFor(xp: number): { name: string; index: number; next: number | null; into: number; span: number } {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i]!.at) index = i;
  }
  const current = RANKS[index]!;
  const next = RANKS[index + 1] ?? null;
  return {
    name: current.name,
    index,
    next: next ? next.at : null,
    into: xp - current.at,
    span: next ? next.at - current.at : 1,
  };
}

/**
 * XP mirrors the same signals the relic reads, so what earns rank and what
 * shapes your weapon never pull in opposite directions.
 */
export function xpFor(event: XpEvent): number {
  let xp = 600 * event.bossLevel;
  // Finishing near death is the hardest and most interesting outcome, and it
  // is also what produces a shattered relic.
  if (event.healthRemaining <= 20) xp += 800;
  else if (event.healthRemaining >= 71) xp += 300;
  if (event.healingUsed === 0) xp += 400;
  if (event.dodges >= 6) xp += 300;
  if (event.forgedRelic) xp += 500;
  return xp;
}

interface Stored {
  xp: number;
  fightsWon: number;
  fightsLost: number;
  relicsForged: number;
}

function load(): Stored {
  const empty: Stored = { xp: 0, fightsWon: 0, fightsLost: 0, relicsForged: 0 };
  if (typeof localStorage === "undefined") return empty;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return empty;
    const p = parsed as Partial<Stored>;
    return {
      xp: Number(p.xp) || 0,
      fightsWon: Number(p.fightsWon) || 0,
      fightsLost: Number(p.fightsLost) || 0,
      relicsForged: Number(p.relicsForged) || 0,
    };
  } catch {
    return empty;
  }
}

function save(state: Stored): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode; progression is a nicety, never load-bearing */
  }
}

export const useProgress = create<ProgressState>((set, get) => ({
  ...load(),

  award: (event) =>
    set((state) => {
      const next = {
        xp: state.xp + xpFor(event),
        fightsWon: state.fightsWon + 1,
        fightsLost: state.fightsLost,
        relicsForged: state.relicsForged + (event.forgedRelic ? 1 : 0),
      };
      save(next);
      return next;
    }),

  recordLoss: () =>
    set((state) => {
      const next = { ...get(), fightsLost: state.fightsLost + 1 };
      const stored: Stored = {
        xp: next.xp,
        fightsWon: next.fightsWon,
        fightsLost: next.fightsLost,
        relicsForged: next.relicsForged,
      };
      save(stored);
      return stored;
    }),

  reset: () => {
    const empty = { xp: 0, fightsWon: 0, fightsLost: 0, relicsForged: 0 };
    save(empty);
    set(empty);
  },
}));
