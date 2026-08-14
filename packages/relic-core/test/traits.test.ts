import { describe, expect, it } from "vitest";
import { describeTraits, relicTraits } from "../src/traits.js";
import type { RelicDNA } from "../src/types.js";

const base: RelicDNA = {
  weaponClass: "greatsword",
  element: "fire",
  temperament: "balanced",
  condition: "battle-worn",
  bossInfluence: "the Ashen Warden",
  rarity: "legendary",
};

describe("relicTraits", () => {
  it("returns neutral for no relic, so the iron sword is the baseline", () => {
    expect(relicTraits(null)).toEqual({
      lightDamage: 1,
      heavyDamage: 1,
      lightSpeed: 1,
      heavySpeed: 1,
      reach: 1,
    });
  });

  it("makes a brutal relic hit harder and swing slower", () => {
    const brutal = relicTraits({ ...base, temperament: "brutal" });
    expect(brutal.heavyDamage).toBeGreaterThan(1);
    // Above 1 is a longer swing. A brutal weapon that also swung fast would be
    // strictly better than every other temperament.
    expect(brutal.heavySpeed).toBeGreaterThan(1);
  });

  it("makes an elegant relic quick and light rather than punishing", () => {
    const elegant = relicTraits({ ...base, temperament: "elegant", weaponClass: "spear" });
    expect(elegant.lightDamage).toBeGreaterThan(1);
    expect(elegant.lightSpeed).toBeLessThan(1);
    expect(elegant.heavyDamage).toBeLessThan(1);
  });

  it("gives the spear the reach its silhouette implies", () => {
    expect(relicTraits({ ...base, weaponClass: "spear" }).reach).toBeGreaterThan(
      relicTraits({ ...base, weaponClass: "greatsword" }).reach,
    );
  });

  it("never lets element touch the numbers", () => {
    // Element comes from the affinity picked before the fight. If it carried
    // power that screen would stop being a choice about how the relic looks and
    // become a choice about which one is strongest.
    const fire = relicTraits({ ...base, element: "fire" });
    for (const element of ["ice", "lightning"] as const) {
      expect(relicTraits({ ...base, element })).toEqual(fire);
    }
  });

  it("makes shattered a trade rather than a punishment", () => {
    // Shattered is the relic earned by winning at eight percent health. Making
    // it strictly the weakest would punish the best story the game can tell.
    const shattered = relicTraits({ ...base, condition: "shattered" });
    const pristine = relicTraits({ ...base, condition: "pristine" });
    expect(shattered.heavyDamage).toBeGreaterThan(pristine.heavyDamage);
    expect(shattered.heavySpeed).toBeGreaterThan(pristine.heavySpeed);
  });

  it("keeps every multiplier inside a range the fight can absorb", () => {
    // The base numbers stay the source of the fight's pacing; a relic may lean
    // it, never replace it. Anything outside this range would let one relic
    // trivialise a boss or make another unusable.
    for (const temperament of ["brutal", "balanced", "elegant"] as const) {
      for (const condition of ["pristine", "battle-worn", "shattered"] as const) {
        for (const weaponClass of ["greatsword", "spear", "warhammer"] as const) {
          const traits = relicTraits({ ...base, temperament, condition, weaponClass });
          for (const value of Object.values(traits)) {
            expect(value).toBeGreaterThanOrEqual(0.65);
            expect(value).toBeLessThanOrEqual(1.65);
          }
        }
      }
    }
  });
});

describe("describeTraits", () => {
  it("reports a shorter swing as faster, not as a negative percentage", () => {
    const notes = describeTraits(relicTraits({ ...base, temperament: "elegant" }));
    const speed = notes.find((n) => n.startsWith("light speed"));
    expect(speed).toBeDefined();
    expect(speed).toContain("+");
  });

  it("says nothing about a trait that did not move", () => {
    expect(describeTraits(relicTraits(null))).toEqual([]);
  });
});
