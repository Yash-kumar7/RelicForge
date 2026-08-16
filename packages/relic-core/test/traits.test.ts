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

  it("gives every element its own lean, and none of them a free one", () => {
    /*
     * Element used to touch nothing, on the reasoning that it is picked before
     * any fighting and should not turn the affinity screen into a power choice.
     * Champions have carried damage, health and dodge multipliers since, so that
     * screen decides power either way, and element being inert only meant two
     * relics won the same way were the same weapon in different colours.
     *
     * Each takes a different axis, so no element dominates: the test is that
     * every one of them gives something up.
     */
    const fire = relicTraits({ ...base, element: "fire" });
    const ice = relicTraits({ ...base, element: "ice" });
    const lightning = relicTraits({ ...base, element: "lightning" });

    expect(fire).not.toEqual(ice);
    expect(ice).not.toEqual(lightning);

    // Fire buys a heavier blow with a weaker quick one.
    expect(fire.heavyDamage).toBeGreaterThan(ice.heavyDamage);
    expect(fire.lightDamage).toBeLessThan(ice.lightDamage);

    // Ice buys reach with a slower heavy.
    expect(ice.reach).toBeGreaterThan(fire.reach);
    expect(ice.heavySpeed).toBeGreaterThan(fire.heavySpeed);

    // Lightning buys pace with a weaker quick attack.
    expect(lightning.lightSpeed).toBeLessThan(fire.lightSpeed);
    expect(lightning.lightDamage).toBeLessThan(ice.lightDamage);
  });

  it("pays more for a harder boss, without making the early ones worthless", () => {
    /*
     * A player climbing the ladder fights something with 2.4 times the health of
     * the first rung. Before this the relic that fell out of it was identical to
     * a Warden's if the two fights went the same way, so climbing bought a
     * colour and a name.
     *
     * It stays small on purpose. A fifth more damage at the top is felt across a
     * fight; several times more would turn the ladder into a queue to the only
     * relic worth owning.
     */
    const warden = relicTraits({ ...base, bossInfluence: "the Ashen Warden" });
    const sovereign = relicTraits({ ...base, bossInfluence: "the Hollow Sovereign" });

    expect(sovereign.heavyDamage).toBeGreaterThan(warden.heavyDamage);
    expect(sovereign.heavyDamage / warden.heavyDamage).toBeLessThan(1.3);
  });

  it("leans nothing for a boss it does not recognise", () => {
    // Relics forged before this lookup existed carry names it may not know, and
    // a miss must never make a weapon worse than the one it already was.
    const unknown = relicTraits({ ...base, bossInfluence: "something else entirely" });
    const warden = relicTraits({ ...base, bossInfluence: "the Ashen Warden" });
    expect(unknown).toEqual(warden);
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
