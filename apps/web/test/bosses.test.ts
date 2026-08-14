import { describe, expect, it } from "vitest";
import { BOSSES, MAX_LEVEL, bossAt, bossTitleFor, isUnlocked } from "../src/game/bosses";
import { themeForBoss } from "../src/game/theme";

describe("boss ladder", () => {
  it("clamps out-of-range levels instead of returning undefined", () => {
    // bossAt is called with a possibly-null level from the store in several
    // places; returning undefined would crash the arena rather than degrade.
    expect(bossAt(0)).toBe(BOSSES[0]);
    expect(bossAt(-5)).toBe(BOSSES[0]);
    expect(bossAt(999)).toBe(BOSSES[MAX_LEVEL - 1]);
  });

  it("escalates difficulty monotonically up the ladder", () => {
    for (let i = 1; i < BOSSES.length; i++) {
      expect(BOSSES[i]!.hp).toBeGreaterThan(BOSSES[i - 1]!.hp);
      expect(BOSSES[i]!.damage).toBeGreaterThanOrEqual(BOSSES[i - 1]!.damage);
    }
  });

  it("gives every boss a distinct name, since the name feeds the prompt", () => {
    // bossInfluence flows into the concept prompt, so duplicate names would
    // silently produce duplicate weapons on different rungs.
    const names = BOSSES.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every boss a weapon class the grip heuristic understands", () => {
    for (const boss of BOSSES) {
      expect(["greatsword", "spear", "warhammer"]).toContain(boss.weaponClass);
    }
  });

  it("leaves every level playable, because gated content is unreachable content", () => {
    for (const boss of BOSSES) expect(isUnlocked(boss.level)).toBe(true);
  });
});

describe("bossTitleFor", () => {
  it("marks the boss with the affinity that came for it", () => {
    expect(bossTitleFor(1, "fire")).toContain("Ember-Scarred");
    expect(bossTitleFor(1, "ice")).toContain("Frost-Bound");
    expect(bossTitleFor(1, "storm")).toContain("Storm-Struck");
  });

  it("keeps the boss identity intact, since it is the same enemy", () => {
    for (const affinity of ["fire", "ice", "storm"]) {
      expect(bossTitleFor(1, affinity)).toContain(BOSSES[0]!.title);
    }
  });

  it("falls back to the plain title for an unknown affinity", () => {
    expect(bossTitleFor(1, "nonsense")).toBe(BOSSES[0]!.title);
  });
});

describe("themeForBoss", () => {
  it("gives every rung its own palette, so no two arenas look alike", () => {
    const fogs = BOSSES.map((b) => themeForBoss(b.level).fog);
    expect(new Set(fogs).size).toBe(fogs.length);
  });

  it("falls back rather than returning undefined for an unknown level", () => {
    expect(themeForBoss(99)).toEqual(themeForBoss(1));
  });

  it("defines every colour every consumer reads", () => {
    for (const boss of BOSSES) {
      const theme = themeForBoss(boss.level);
      for (const key of ["fog", "ambient", "ground", "wall", "pillar", "forge", "ember", "keyLight", "bossCore", "rune"] as const) {
        expect(theme[key]).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});
