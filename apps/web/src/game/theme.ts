import type { Affinity } from "@relic/core";

/**
 * The arena reads the player's affinity.
 *
 * A world that looks identical no matter what you chose quietly contradicts the
 * premise: if the game claims your choices shape what you get, the first thing
 * you choose should visibly change something. This is also the cheapest way to
 * make two recorded runs read as different runs rather than the same clip twice.
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
  /** The Warden's core, which takes on the arena's hostility. */
  bossCore: string;
  /** Rune ring on the floor. */
  rune: string;
}

export const ARENA_THEMES: Record<Affinity, ArenaTheme> = {
  fire: {
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
  ice: {
    // Colder, brighter, and emptier — a frost arena should feel exposed rather
    // than smothered, so the fog sits lighter and the fill is blue.
    fog: "#05080c",
    ambient: "#22303a",
    ground: "#0f1418",
    wall: "#0b0f13",
    pillar: "#131a20",
    forge: "#4aa8d8",
    ember: "#a8ddf0",
    keyLight: "#cfe8f7",
    bossCore: "#2f8fd0",
    rune: "#4aa8d8",
  },
  storm: {
    fog: "#07060a",
    ambient: "#2e2a3a",
    ground: "#131118",
    wall: "#0d0c11",
    pillar: "#181521",
    forge: "#c9a227",
    ember: "#ffd76a",
    keyLight: "#efe3b0",
    bossCore: "#d8b02a",
    rune: "#c9a227",
  },
};

export function themeFor(affinity: Affinity): ArenaTheme {
  return ARENA_THEMES[affinity];
}
