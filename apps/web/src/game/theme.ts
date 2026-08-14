import type { Affinity } from "@relic/core";

/**
 * Two palettes, and which one applies where is a design decision worth stating.
 *
 * The **arena** belongs to the boss. You are walking into its domain, so the
 * fog, ground, pillars, rune ring, forge glow and its own core all come from the
 * boss you chose. Keying the arena off the player made every level look the
 * same and every affinity look different, which is backwards: the ladder is
 * where the variety should live.
 *
 * Your **affinity** shows on what you brought: the glow along your blade, the
 * bands on your gauntlets, and the element of the relic you earn. It is you, so
 * it travels with you rather than repainting someone else's arena.
 */
export interface ArenaTheme {
  /** Distance fog and clear colour. */
  fog: string;
  /** Ambient and hemisphere fill. */
  ambient: string;
  ground: string;
  wall: string;
  pillar: string;
  /** Forge mouth, ember particles, key light. */
  forge: string;
  ember: string;
  keyLight: string;
  /** The boss's core, eyes and attack telegraph. */
  bossCore: string;
  /** Rune ring on the floor. */
  rune: string;
}

/** Arena palettes, one per rung of the ladder. */
export const BOSS_THEMES: Record<number, ArenaTheme> = {
  // Ashen Warden: burnt, close, volcanic.
  1: {
    fog: "#0a0705",
    ambient: "#3a2b22",
    ground: "#16130f",
    wall: "#100e0c",
    pillar: "#1a1613",
    forge: "#ff6b1a",
    ember: "#ff8c42",
    keyLight: "#ffd9b3",
    bossCore: "#ff4d1a",
    rune: "#ff6b1a",
  },
  // Drowned Choir: cold, wet, drained of warmth.
  2: {
    fog: "#04080c",
    ambient: "#1e3038",
    ground: "#0d1418",
    wall: "#090f13",
    pillar: "#111a20",
    forge: "#2f8fd0",
    ember: "#8fd4ee",
    keyLight: "#c2e2f2",
    bossCore: "#2f8fd0",
    rune: "#2f8fd0",
  },
  // Gilded Husk: opulent, dry, brass and lacquer.
  3: {
    fog: "#0a0803",
    ambient: "#3a3220",
    ground: "#171408",
    wall: "#100e07",
    pillar: "#1e1a0e",
    forge: "#d8b02a",
    ember: "#ffe08a",
    keyLight: "#f4e6b8",
    bossCore: "#d8b02a",
    rune: "#d8b02a",
  },
  // Rootbound King: overgrown, damp, green dark.
  4: {
    fog: "#050805",
    ambient: "#24331f",
    ground: "#101610",
    wall: "#0a0f0a",
    pillar: "#141d13",
    forge: "#5fae5a",
    ember: "#a8e6a0",
    keyLight: "#d4ecc8",
    bossCore: "#5fae5a",
    rune: "#5fae5a",
  },
  // Hollow Sovereign: void, regal, violet.
  5: {
    fog: "#07050b",
    ambient: "#2c2438",
    ground: "#12101a",
    wall: "#0b0910",
    pillar: "#181425",
    forge: "#a855f7",
    ember: "#d8b4fe",
    keyLight: "#e6dcf7",
    bossCore: "#a855f7",
    rune: "#a855f7",
  },
};

export function themeForBoss(level: number): ArenaTheme {
  return BOSS_THEMES[level] ?? BOSS_THEMES[1]!;
}

/** Player-side accents. Travels with you, never repaints the arena. */
export const AFFINITY_ACCENT: Record<Affinity, { primary: string; soft: string }> = {
  fire: { primary: "#ff6b1a", soft: "#ffb066" },
  ice: { primary: "#4aa8d8", soft: "#a8ddf0" },
  storm: { primary: "#c9a227", soft: "#ffd76a" },
};

export function accentFor(affinity: Affinity): { primary: string; soft: string } {
  return AFFINITY_ACCENT[affinity];
}

/**
 * Kept as a thin shim over the affinity accent.
 *
 * Several player-side components only ever wanted a single colour for a glow or
 * a band, and rewriting each of them to reach for `accentFor(...).primary`
 * would churn a lot of files for no behavioural gain.
 */
export function themeFor(affinity: Affinity): { forge: string; ember: string } {
  const accent = accentFor(affinity);
  return { forge: accent.primary, ember: accent.soft };
}
