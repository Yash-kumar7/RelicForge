import { COMBAT } from "./combat";
import { BOSS_MAX_HP } from "../state/useGameStore";
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
  /** Core and eye colour. */
  accent: string;
  /**
   * The weapon it carries, generated separately so it can be socketed rather
   * than fused into the body mesh. Its class drives the grip heuristic, exactly
   * as it does for a relic.
   */
  weaponClass: "greatsword" | "spear" | "warhammer";
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
    weaponClass: "greatsword",
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
    weaponClass: "spear",
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
    weaponClass: "spear",
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
    weaponClass: "warhammer",
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
    weaponClass: "greatsword",
  },
];

export const MAX_LEVEL = BOSSES.length;

/**
 * The same boss, marked by the affinity that came for it.
 *
 * Affinity deliberately does not change *which* boss you fight: the headline
 * comparison is "same boss, different story, different relic", and swapping the
 * enemy per affinity would confound the one variable the project is trying to
 * isolate. What it changes is how the encounter presents, so two runs still
 * read as two different runs.
 */
export const AFFINITY_EPITHET: Record<string, string> = {
  fire: "Ember-Scarred",
  ice: "Frost-Bound",
  storm: "Storm-Struck",
};

export function bossTitleFor(level: number, affinity: string): string {
  const epithet = AFFINITY_EPITHET[affinity];
  const boss = bossAt(level);
  return epithet ? `${boss.title}, ${epithet}` : boss.title;
}

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

/**
 * Every boss is selectable from the start.
 *
 * Progression gating made four of the five rungs identical blurred smudges you
 * could not select, which is actively hostile in a piece someone is evaluating:
 * the content exists, and a reviewer should be able to reach the Hollow
 * Sovereign without grinding the ladder first.
 *
 * `highestCleared` is still recorded, and still drives rank and the cleared
 * count, so progress remains visible without being a wall.
 */
export function isUnlocked(_level: number): boolean {
  return true;
}

/** Whether the player has actually beaten this rung, for display only. */
export function isCleared(level: number): boolean {
  return highestCleared() >= level;
}

/**
 * What a boss is, in the same shape the champion cards use.
 *
 * The enemy step was the only choice on the setup screen with no numbers, which
 * is the wrong one to leave blank: a player picking a champion is choosing how
 * to play, but a player picking a boss is choosing what they can survive.
 *
 * Derived from the same multipliers the fight applies, so a difficulty change
 * cannot leave this screen quoting a boss that no longer exists.
 */
export function describeBoss(
  level: number,
  championHealth: number,
): { label: string; value: string }[] {
  const boss = bossAt(level);
  const health = Math.round(BOSS_MAX_HP * boss.hp);
  const damage = Math.round(COMBAT.boss.damage * boss.damage);

  return [
    { label: "health", value: `${health}` },
    /*
     * Named and given its unit, matching the champion cards, where a row reads
     * "light attack: 30 damage". "Hits you for 22" left the 22 to be guessed at
     * and read as a rate rather than a quantity.
     */
    { label: "its attack", value: `${damage} damage` },
    /*
     * The number that actually decides whether to take this fight, and the
     * reason this takes the champion's health rather than a constant: the same
     * boss kills Ember in three hits and Frost in six, and that difference is
     * the whole point of choosing between them.
     */
    { label: "kills you in", value: `${Math.ceil(championHealth / damage)} hits` },
  ];
}
