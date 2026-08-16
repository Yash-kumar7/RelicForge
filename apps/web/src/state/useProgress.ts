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

/** One line of the award, so a player can see what they were paid for. */
export interface XpLine {
  label: string;
  amount: number;
}

/**
 * The last award, kept so the reveal can show it being earned.
 *
 * Experience was added silently and only ever seen later, as a larger number on
 * a setup screen. That is the whole feature missing its point: the bar sitting
 * on a menu is not the content, the moment it fills is, and a player who is never
 * shown what they were paid for has no reason to care what the total says.
 */
export interface XpAward {
  gained: number;
  lines: XpLine[];
  before: number;
  after: number;
  /** Set when the award crossed a threshold, which is the only rank that matters. */
  rankUp: string | null;
}

export interface ProgressState {
  xp: number;
  fightsWon: number;
  fightsLost: number;
  relicsForged: number;
  lastAward: XpAward | null;
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

/**
 * The boss's name, for the award line.
 *
 * Held here rather than imported, because bosses.ts already imports this module
 * for xpRangeFor and the cycle would be real. Five strings against one import is
 * the cheaper of the two, and a test asserts they match the ladder.
 */
function bossNameFor(level: number): string {
  return (
    ["The Ashen Warden", "The Drowned Choir", "The Gilded Husk", "The Rootbound King", "The Hollow Sovereign"][
      level - 1
    ] ?? "The boss"
  );
}

/**
 * Rank thresholds: one per rung, and then one that is not.
 *
 * These were picked to feel like a curve and never checked against the ladder,
 * so the top rank asked for more than a perfect run could pay and was reachable
 * only by luck of arithmetic. Deriving them from the ladder fixed that and
 * overshot: every rank became one boss cleared well, and beating the game
 * perfectly landed exactly on the last rank with nothing left to do. Finishing
 * and mastering became the same act, which makes the final rank an attendance
 * record.
 *
 * Five of the six are the ladder, so each says one sentence: you reach it by
 * clearing the next boss well. Best-case cumulative totals are 260, 580, 960,
 * 1400 and 1900, and each threshold sits just under one of them.
 *
 * Legend-Made is not on that scale. It sits at 2400, past the 1900 a flawless
 * single clear pays, so it is the only rank that cannot be reached by finishing:
 * it asks for a few more fights fought well, which is a fair thing to ask of the
 * word legend and costs nothing to ignore, because rank buys nothing.
 */
export const RANKS = [
  { at: 0, name: "Unproven" },
  { at: 240, name: "Ashbearer" },
  { at: 560, name: "Warden-Slayer" },
  { at: 940, name: "Relic-Bound" },
  { at: 1380, name: "Forgesworn" },
  { at: 2400, name: "Legend-Made" },
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
  let xp = 60 * event.bossLevel;
  // Finishing near death is the hardest and most interesting outcome, and it
  // is also what produces a shattered relic.
  if (event.healthRemaining <= 20) xp += 80;
  else if (event.healthRemaining >= 71) xp += 30;
  if (event.healingUsed === 0) xp += 40;
  if (event.dodges >= 6) xp += 30;
  if (event.forgedRelic) xp += 50;
  return xp;
}

/**
 * What a rung can pay, from the worst win to the best one.
 *
 * The ladder advertised the base award and called it "you earn", which reads as
 * the total. It is not: a clean, unhurried, unhealed win that forges a relic pays
 * 260 on the first rung against the 60 on the card, so the game looked like it
 * was miscounting in the player's favour, which is the kind of wrong that makes
 * every other number suspect.
 *
 * Derived by running the real award both ways rather than by adding the bonuses
 * up here. Two places computing the same total is how the first version drifted,
 * and the bonuses are not simply additive: finishing near death and finishing
 * healthy are the same branch, so the maximum is not the sum of everything
 * listed.
 */
export function xpRangeFor(bossLevel: number): { min: number; max: number } {
  const worst = xpFor({
    bossLevel,
    // A win that earned nothing beyond the fight itself: middling health, a heal
    // taken, no dodges, and no relic claimed.
    healthRemaining: 50,
    dodges: 0,
    healingUsed: 1,
    forgedRelic: false,
  });

  const best = xpFor({
    bossLevel,
    healthRemaining: 8,
    dodges: 6,
    healingUsed: 0,
    forgedRelic: true,
  });

  return { min: worst, max: best };
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
  /* Never persisted: it belongs to the fight that just ended, and a reload
     showing the last award of a previous session would be a lie about now. */
  lastAward: null,

  award: (event) =>
    set((state) => {
      const gained = xpFor(event);
      const after = state.xp + gained;

      /*
       * The same conditions xpFor pays on, named.
       *
       * Written out rather than derived from it, because xpFor is arithmetic and
       * this is a sentence: it has to say why in words a player recognises from
       * the fight they just had. A test asserts the lines sum to what xpFor pays,
       * so the two cannot drift apart in silence.
       */
      const lines: XpLine[] = [{ label: `${bossNameFor(event.bossLevel)} fell`, amount: 60 * event.bossLevel }];
      if (event.healthRemaining <= 20) lines.push({ label: "finished at death's door", amount: 80 });
      else if (event.healthRemaining >= 71) lines.push({ label: "finished barely marked", amount: 30 });
      if (event.healingUsed === 0) lines.push({ label: "never healed", amount: 40 });
      if (event.dodges >= 6) lines.push({ label: "read every blow", amount: 30 });
      if (event.forgedRelic) lines.push({ label: "relic forged", amount: 50 });

      const before = rankFor(state.xp).index;
      const crossed = rankFor(after).index;

      const next = {
        xp: after,
        fightsWon: state.fightsWon + 1,
        fightsLost: state.fightsLost,
        relicsForged: state.relicsForged + (event.forgedRelic ? 1 : 0),
        lastAward: {
          gained,
          lines,
          before: state.xp,
          after,
          rankUp: crossed > before ? (RANKS[crossed]?.name ?? null) : null,
        } satisfies XpAward,
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
