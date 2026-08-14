/**
 * The boss ladder.
 *
 * Each level is a different thing to kill, and that matters mechanically rather
 * than cosmetically: the boss name is `bossInfluence` in the Relic DNA, which
 * flows into the concept prompt. Beating the Ashen Warden yields a weapon
 * forged from ash and molten rock; beating the Drowned Choir yields something
 * grown from salt and drowned bone. Same fight, same telemetry, different relic.
 *
 * Progression is per-boss so a player can chase one specific relic without
 * grinding the whole ladder again.
 */
export interface BossLevel {
  level: number;
  /** Passed to the backend as bossInfluence, this shapes the prompt. */
  name: string;
  title: string;
  blurb: string;
  /** Multipliers on top of the difficulty profile. */
  hp: number;
  damage: number;
  speed: number;
  /** Core and eye colour; the arena palette still comes from your affinity. */
  accent: string;
}

export const BOSSES: BossLevel[] = [
  {
    level: 1,
    name: "the Ashen Warden",
    title: "The Ashen Warden",
    blurb: "A burnt sentinel that never left its post. Slow, heavy, honest.",
    hp: 1,
    damage: 1,
    speed: 1,
    accent: "#ff4d1a",
  },
  {
    level: 2,
    name: "the Drowned Choir",
    title: "The Drowned Choir",
    blurb: "Salt-swollen and many-voiced. Faster, and it does not telegraph kindly.",
    hp: 1.25,
    damage: 1.15,
    speed: 1.15,
    accent: "#2f8fd0",
  },
  {
    level: 3,
    name: "the Gilded Husk",
    title: "The Gilded Husk",
    blurb: "Something rich died inside this armour. It still spends like it is alive.",
    hp: 1.5,
    damage: 1.3,
    speed: 1.1,
    accent: "#d8b02a",
  },
  {
    level: 4,
    name: "the Rootbound King",
    title: "The Rootbound King",
    blurb: "Held together by what grew through him. Enormous health, punishing reach.",
    hp: 2,
    damage: 1.4,
    speed: 0.95,
    accent: "#5fae5a",
  },
  {
    level: 5,
    name: "the Hollow Sovereign",
    title: "The Hollow Sovereign",
    blurb: "The last thing on the ladder. Everything it lost, it takes back.",
    hp: 2.4,
    damage: 1.75,
    speed: 1.3,
    accent: "#a855f7",
  },
];

export const MAX_LEVEL = BOSSES.length;

export function bossAt(level: number): BossLevel {
  return BOSSES[Math.min(Math.max(level, 1), MAX_LEVEL) - 1]!;
}

/* ------------------------------------------------------------- progression */

const STORAGE_KEY = "relicforge.progress.v1";

export function highestCleared(): number {
  if (typeof localStorage === "undefined") return 0;
  const raw = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(raw) ? Math.max(0, Math.min(MAX_LEVEL, raw)) : 0;
}

export function recordClear(level: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.max(level, highestCleared())));
  } catch {
    /* private mode, progression is a nicety, never load-bearing */
  }
}

/** Level 1 is always open; each clear unlocks exactly the next one. */
export function isUnlocked(level: number): boolean {
  return level === 1 || highestCleared() >= level - 1;
}
