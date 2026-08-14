import { describe, expect, it } from "vitest";
import { CHAMPIONS, championFor, championStats, describeChampion } from "../src/game/champions";
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

  it("states absolute values, never percentages", () => {
    // A percentage is a comparison, and on the setup screen there is nothing to
    // compare against: a first-time player has no idea what the baseline is, so
    // every figure was relative to a number they had never seen.
    for (const affinity of AFFINITIES) {
      for (const stat of describeChampion(championFor(affinity))) {
        expect(stat.value).not.toContain("%");
      }
    }
  });

  it("labels every stat, so no value has to be decoded", () => {
    // The first version returned "38/71 dmg", which only reads correctly if you
    // already know light comes before heavy. A stat nobody can decode is no
    // better than no stat.
    for (const affinity of AFFINITIES) {
      const stats = describeChampion(championFor(affinity));
      expect(stats.length).toBeGreaterThanOrEqual(4);
      for (const stat of stats) {
        expect(stat.label.length).toBeGreaterThan(2);
        expect(stat.value.length).toBeGreaterThan(0);
      }
      expect(stats.map((s) => s.label)).toContain("health");
    }
  });

  it("lets a player learn their health before the fight rather than during it", () => {
    // Health used to exist only as a percentage of a maximum the player never
    // saw, so it was impossible to know Frost carries more than Ember until
    // after committing to one.
    const health = AFFINITIES.map((a) => championStats(championFor(a)).health);
    expect(new Set(health).size).toBeGreaterThan(1);
    expect(championStats(CHAMPIONS.ice).health).toBeGreaterThan(
      championStats(CHAMPIONS.fire).health,
    );
  });

  it("derives stats from the combat constants rather than restating them", () => {
    // A test that hardcodes the numbers cannot catch the setup screen quoting
    // values the fight stopped using, so this checks the relationship instead.
    const ember = championStats(CHAMPIONS.fire);
    const frost = championStats(CHAMPIONS.ice);
    expect(ember.heavyDamage).toBeGreaterThan(frost.heavyDamage);
    expect(ember.heavyDamage).toBeGreaterThan(ember.lightDamage);
    expect(frost.dodgeSeconds).toBeGreaterThan(championStats(CHAMPIONS.storm).dodgeSeconds);
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
