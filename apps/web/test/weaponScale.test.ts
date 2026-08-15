import { describe, expect, it } from "vitest";
import { CANONICAL_LENGTH, type WeaponClass } from "@relic/core";
import {
  HELD_LENGTH,
  IRON_SCALE,
  IRON_SWORD_LENGTH,
  REFERENCE_HEIGHT,
  relicScale,
} from "../src/game/weaponScale";

const CLASSES: WeaponClass[] = ["greatsword", "spear", "warhammer"];

describe("carried weapon sizes", () => {
  it("never lets the starter blade out-size the relic that replaces it", () => {
    // The bug this exists for: the iron sword rendered at 1.59 world units and a
    // legendary greatsword at 1.08, so the common weapon looked bigger than the
    // one-of-one earned by beating a boss.
    expect(HELD_LENGTH.greatsword).toBeGreaterThan(HELD_LENGTH.iron);
    for (const weaponClass of CLASSES) {
      expect(HELD_LENGTH[weaponClass]).toBeGreaterThan(HELD_LENGTH.iron);
    }
  });

  it("keeps every weapon a plausible size for the person holding it", () => {
    // Under half a champion's height is a knife; much over their height is a
    // prop. The spear is exempt above, because being taller than its wielder is
    // the whole point of a spear.
    for (const weaponClass of CLASSES) {
      const ratio = HELD_LENGTH[weaponClass] / REFERENCE_HEIGHT;
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(weaponClass === "spear" ? 1.15 : 0.85);
    }
    expect(HELD_LENGTH.iron / REFERENCE_HEIGHT).toBeGreaterThan(0.5);
  });

  it("scales a relic from its canonical length to its carried length", () => {
    for (const weaponClass of CLASSES) {
      const carried = CANONICAL_LENGTH[weaponClass] * relicScale(weaponClass);
      expect(carried).toBeCloseTo(HELD_LENGTH[weaponClass], 5);
    }
  });

  it("scales the hand-built iron sword to the same carried length", () => {
    expect(IRON_SWORD_LENGTH * IRON_SCALE).toBeCloseTo(HELD_LENGTH.iron, 5);
  });

  it("gives the spear the longest reach on screen, matching its trait", () => {
    // relicTraits gives the spear more reach; a spear that did not also look
    // longer would make the stat feel arbitrary.
    for (const weaponClass of CLASSES) {
      if (weaponClass === "spear") continue;
      expect(HELD_LENGTH.spear).toBeGreaterThan(HELD_LENGTH[weaponClass]);
    }
  });
});
