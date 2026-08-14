import { describe, expect, it } from "vitest";
import { buildRelicDNA, conditionFor, temperamentFor, weaponClassFor } from "../src/dna.js";
import type { CombatTelemetry } from "../src/types.js";

const base: CombatTelemetry = {
  affinity: "fire",
  damageDealt: 1000,
  damageTaken: 60,
  lightAttacks: 10,
  heavyAttacks: 10,
  finishingAttack: "heavy",
  healthRemaining: 50,
  dodges: 2,
  healingUsed: 1,
  fightDuration: 70,
};

describe("conditionFor", () => {
  // The exact boundaries are the whole contract — off-by-one here silently
  // changes which relic a player earns.
  it.each([
    [0, "shattered"],
    [20, "shattered"],
    [21, "battle-worn"],
    [70, "battle-worn"],
    [71, "pristine"],
    [100, "pristine"],
  ])("health %i → %s", (health, expected) => {
    expect(conditionFor(health)).toBe(expected);
  });
});

describe("temperamentFor", () => {
  it("heavy-attack ratio at or above 0.6 is brutal", () => {
    expect(temperamentFor({ ...base, lightAttacks: 4, heavyAttacks: 6 })).toBe("brutal");
  });

  it("just under the heavy threshold is not brutal", () => {
    expect(temperamentFor({ ...base, lightAttacks: 41, heavyAttacks: 59 })).not.toBe("brutal");
  });

  it("dodging with light attacks is elegant", () => {
    expect(temperamentFor({ ...base, lightAttacks: 20, heavyAttacks: 5, dodges: 6 })).toBe(
      "elegant",
    );
  });

  it("dodges alone do not make it elegant if the player swings heavy", () => {
    expect(temperamentFor({ ...base, lightAttacks: 5, heavyAttacks: 15, dodges: 9 })).toBe(
      "brutal",
    );
  });

  it("no attacks at all does not divide by zero", () => {
    expect(temperamentFor({ ...base, lightAttacks: 0, heavyAttacks: 0, dodges: 0 })).toBe(
      "balanced",
    );
  });
});

describe("weaponClassFor", () => {
  it("only ever emits production classes", () => {
    for (const t of ["brutal", "balanced", "elegant"] as const) {
      expect(["greatsword", "spear"]).toContain(weaponClassFor(t));
    }
  });
});

describe("buildRelicDNA", () => {
  it("maps a desperate aggressive fire victory to a shattered brutal greatsword", () => {
    expect(
      buildRelicDNA(
        {
          ...base,
          affinity: "fire",
          healthRemaining: 8,
          lightAttacks: 3,
          heavyAttacks: 12,
          healingUsed: 0,
        },
        "Ashen Warden",
      ),
    ).toMatchObject({
      weaponClass: "greatsword",
      element: "fire",
      temperament: "brutal",
      condition: "shattered",
      achievement: "DEATH'S DOOR",
      bossInfluence: "Ashen Warden",
    });
  });

  it("maps a clean evasive ice victory to a pristine elegant spear", () => {
    expect(
      buildRelicDNA(
        {
          ...base,
          affinity: "ice",
          healthRemaining: 82,
          lightAttacks: 18,
          heavyAttacks: 2,
          dodges: 7,
          fightDuration: 40,
        },
        "Ashen Warden",
      ),
    ).toMatchObject({
      weaponClass: "spear",
      element: "ice",
      temperament: "elegant",
      condition: "pristine",
    });
  });

  it("storm affinity becomes the lightning element", () => {
    expect(buildRelicDNA({ ...base, affinity: "storm" }, "Ashen Warden").element).toBe("lightning");
  });

  it("is deterministic", () => {
    const a = buildRelicDNA(base, "Ashen Warden");
    const b = buildRelicDNA(base, "Ashen Warden");
    expect(a).toEqual(b);
  });
});
