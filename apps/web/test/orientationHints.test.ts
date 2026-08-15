import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BOSS_WEAPON_HINTS, bossWeaponHint } from "../src/game/orientationHints";

/**
 * The hints themselves cannot be unit tested: whether a weapon looks upside
 * down is a judgement about a mesh, not a computation. What can be tested is
 * that every path which renders a boss weapon actually applies them, which is
 * the mistake that happened: the arena was fixed and the ladder preview was
 * not, so the same asset appeared correct in one screen and inverted in the
 * other.
 */
const RENDER_PATHS = [
  "apps/web/src/game/BossWeapon.tsx",
  "apps/web/src/ui/BossPreview.tsx",
  // The rigged in-fight path, and the one that was missed. Fixing the ladder and
  // the unrigged fallback left the weapon upright everywhere except in combat.
  "apps/web/src/game/HandWeapon.tsx",
];

describe("orientation hints", () => {
  it("returns nothing for a boss with no override", () => {
    expect(bossWeaponHint("no-such-boss")).toBeUndefined();
  });

  it("only overrides which end is the tip, never the measured axis or grip", () => {
    // A hint that set axisOverride or gripT would be replacing the normalizer
    // rather than correcting one ambiguous decision it already flagged.
    for (const hint of Object.values(BOSS_WEAPON_HINTS)) {
      expect(hint.flip).toBe(true);
      expect(hint.axisOverride).toBeUndefined();
      expect(hint.gripT).toBeUndefined();
    }
  });

  it("is applied by every component that renders a boss weapon", () => {
    for (const path of RENDER_PATHS) {
      const source = readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
      expect(source, `${path} renders a boss weapon without its hint`).toContain(
        "bossWeaponHint",
      );
    }
  });
});
