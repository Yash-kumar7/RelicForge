import { describe, expect, it } from "vitest";
import { CHAMPIONS, championFor, describeChampion } from "../src/game/champions";
import type { Affinity } from "@relic/core";

const AFFINITIES: Affinity[] = ["fire", "ice", "storm"];

describe("champions", () => {
  it("gives every affinity a champion, since the arena reads one every fight", () => {
    for (const affinity of AFFINITIES) expect(championFor(affinity)).toBeDefined();
  });

  it("makes every champion a trade rather than a tier", () => {
    // The point of the stats is that the first choice in the game is a real one.
    // A champion that only gains is not a choice, it is the answer.
    for (const affinity of AFFINITIES) {
      const { traits } = championFor(affinity);
      const values = Object.values(traits);
      expect(values.some((v) => v > 1)).toBe(true);
      expect(values.some((v) => v < 1)).toBe(true);
    }
  });

  it("keeps the three within reach of each other", () => {
    // Rough power budget: gains and losses should roughly cancel, or one rung of
    // the ladder becomes materially easier depending on a cosmetic-looking pick.
    for (const affinity of AFFINITIES) {
      const { traits } = championFor(affinity);
      // Dodge cooldown is inverted: below 1 is a gain, so it is counted that way.
      const budget =
        traits.damage + traits.maxHp + 1 / traits.dodgeCooldown + traits.moveSpeed;
      expect(budget).toBeGreaterThan(3.85);
      expect(budget).toBeLessThan(4.35);
    }
  });

  it("never lets a champion trivialise or cripple a stat", () => {
    for (const affinity of AFFINITIES) {
      for (const value of Object.values(championFor(affinity).traits)) {
        expect(value).toBeGreaterThanOrEqual(0.7);
        expect(value).toBeLessThanOrEqual(1.3);
      }
    }
  });

  it("uses the champion slugs the asset paths are built from", () => {
    // PlayerAvatar loads /assets/champions/{slug}/..., so a renamed slug is a
    // missing model rather than a type error.
    expect(Object.values(CHAMPIONS).map((c) => c.slug).sort()).toEqual([
      "ember",
      "frost",
      "storm",
    ]);
  });

  it("reports a shorter dodge cooldown as more dodging, not less", () => {
    expect(describeChampion(CHAMPIONS.storm)).toContain("dodge +");
  });
});
