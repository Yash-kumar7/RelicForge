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
      // Normalised so every entry reads the same way: above 1 is a gain. Without
      // this, Storm's shorter dodge cooldown counts as a loss and the champion
      // built entirely around it looks like it has no strengths.
      const gains = [traits.damage, traits.maxHp, 1 / traits.dodgeCooldown];
      expect(gains.some((v) => v > 1)).toBe(true);
      expect(gains.some((v) => v < 1)).toBe(true);
    }
  });

  it("keeps the three within reach of each other", () => {
    // Rough power budget: gains and losses should roughly cancel, or one rung of
    // the ladder becomes materially easier depending on a cosmetic-looking pick.
    for (const affinity of AFFINITIES) {
      const { traits } = championFor(affinity);
      // Dodge cooldown is inverted: below 1 is a gain, so it is counted that way.
      const budget = traits.damage + traits.maxHp + 1 / traits.dodgeCooldown;
      expect(budget).toBeGreaterThan(2.9);
      expect(budget).toBeLessThan(3.2);
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

  it("carries no trait the player cannot feel", () => {
    // Move speed used to live here at roughly ten percent either way, which is
    // imperceptible while a boss is winding up. A stat nobody can feel makes the
    // champions look distinct in a table and identical in play.
    for (const affinity of AFFINITIES) {
      for (const [name, value] of Object.entries(championFor(affinity).traits)) {
        if (value === 1) continue;
        // Epsilon because 1 - 0.9 is 0.09999999999999998 in binary floating
        // point, and a champion should not fail balance review over that.
        expect(Math.abs(value - 1), `${affinity}.${name} is too small to notice`)
          .toBeGreaterThan(0.1 - 1e-6);
      }
    }
  });
});
