import { describe, expect, it } from "vitest";
import { CHAMPIONS, championFor, championStats, describeChampion } from "../src/game/champions";
import { relicTraits, type Affinity, type RelicDNA } from "@relic/core";
import { combinedTraits } from "../src/game/equipped";

const AFFINITIES: Affinity[] = ["fire", "ice", "storm"];

const base: RelicDNA = {
  weaponClass: "greatsword",
  element: "fire",
  temperament: "balanced",
  condition: "battle-worn",
  bossInfluence: "the Ashen Warden",
  rarity: "legendary",
};

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
      expect(stats.length).toBeGreaterThanOrEqual(1);
      for (const stat of stats) {
        expect(stat.label.length).toBeGreaterThan(2);
        expect(stat.value.length).toBeGreaterThan(0);
      }
      expect(stats.map((s) => s.label)).toContain("health");
      // Labels are plain words, and any value that is not a bare count carries
      // its own unit. "38/71 dmg" and "you deal - light" both failed this by
      // needing the reader to already know the convention.
      for (const stat of stats) {
        // Digits allowed: "dodges per 10s" names a window, it is not a value.
        expect(stat.label).toMatch(/^[a-z0-9 ]+$/);
        expect(stat.label).not.toContain("·");
      }
      // Damage is deliberately absent. It belongs to the weapon, and stating
      // it here too asked the player to hold two sources of one number: if the
      // sword does the damage, what were the numbers on the character?
      for (const stat of stats) {
        expect(stat.label).not.toMatch(/damage|swing|attack|hit/);
        expect(stat.value).not.toContain("damage");
        // No timers either. A cooldown in seconds is not a skill, and sitting
        // where a player looks for abilities it invites being read as one.
        // A cooldown in seconds is a timer and reads as something to add up.
        // The same fact is stated as a count of dodges instead.
        expect(stat.value).not.toMatch(/\ds$/);
      }
    }
  });

  it("gives each champion its own health", () => {
    const health = AFFINITIES.map((a) => championStats(championFor(a)).health);
    expect(new Set(health).size).toBe(AFFINITIES.length);
  });

  it("never leaves a champion beaten on everything it is actually good at", () => {
    /*
     * The card shows health, dodges and damage. A champion losing on all three
     * is a trap: Storm once showed 90 health against Frost's 125 while their
     * damage differed by a single point, so nothing on screen explained why
     * anyone would take it. Its advantage was real and entirely invisible.
     */
    const shown = AFFINITIES.map((a) => {
      const s = championStats(championFor(a));
      return { a, health: s.health, dodges: s.dodgesPerTenSeconds, damage: s.heavyDamage };
    });

    for (const champion of shown) {
      const beatenOnAll = shown.some(
        (other) =>
          other.a !== champion.a &&
          other.health >= champion.health &&
          other.dodges >= champion.dodges &&
          other.damage >= champion.damage,
      );
      expect(beatenOnAll, `${champion.a} is beaten on every visible stat`).toBe(false);
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
    // Storm fits more dodges into the same window than anyone else, which is
    // the entire reason to pick it.
    expect(championStats(CHAMPIONS.storm).dodgesPerTenSeconds).toBeGreaterThan(
      frost.dodgesPerTenSeconds,
    );
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

describe("combined traits", () => {
  it("applies the champion's strength on top of the relic's", () => {
    /*
     * The bug this exists for: the pre-fight briefing built its numbers from the
     * relic alone, so it promised a 60 damage strong attack while an Ember dealt
     * 72 and a Frost 49. Three places computed this and one of them was missing
     * half the calculation, which is why it is one function now.
     */
    const bare = combinedTraits(null, "fire");
    const neutral = relicTraits(null);
    expect(bare.heavyDamage).toBeGreaterThan(neutral.heavyDamage);
    expect(combinedTraits(null, "ice").heavyDamage).toBeLessThan(neutral.heavyDamage);
  });

  it("keeps the relic's own trade intact underneath", () => {
    const dna: RelicDNA = { ...base, temperament: "brutal", condition: "shattered" };
    const withRelic = combinedTraits(dna, "fire");
    expect(withRelic.heavyDamage).toBeGreaterThan(combinedTraits(null, "fire").heavyDamage);
  });
});
