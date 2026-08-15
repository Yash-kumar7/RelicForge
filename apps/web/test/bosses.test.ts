import { describe, expect, it } from "vitest";
import { BOSSES, MAX_LEVEL, bossAt, bossTitleFor, describeBoss, isUnlocked } from "../src/game/bosses";
import { themeForBoss } from "../src/game/theme";
import { Group, Vector3 } from "three";

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

describe("facing convention", () => {
  it("points a front-on mesh at its target with no correction", () => {
    // Object3D.lookAt on a non-camera aims the object's +Z at the target, and a
    // front-on concept produces a mesh whose front is +Z. Any half turn applied
    // on top of that faces the model away, which is what made the boss advance
    // with its back to the player and the champion run backwards.
    const group = new Group();
    group.position.set(0, 0, 0);
    group.lookAt(new Vector3(0, 0, -10));

    const facing = new Vector3(0, 0, 1).applyQuaternion(group.quaternion);
    expect(facing.z).toBeLessThan(-0.9);
  });

  it("matches the champion's own facing formula", () => {
    // PlayerAvatar sets rotation.y from atan2(forward.x, forward.z), which is
    // the same convention. Both must agree or one of them is backwards.
    const forward = new Vector3(0, 0, -1);
    const group = new Group();
    group.rotation.y = Math.atan2(forward.x, forward.z);

    const facing = new Vector3(0, 0, 1).applyQuaternion(group.quaternion);
    expect(facing.z).toBeLessThan(-0.9);
  });
});

describe("describeBoss", () => {
  it("gets harder in the numbers a player can see, not only in the fiction", () => {
    const health = (level: number) =>
      Number(describeBoss(level, 100).find((s) => s.label === "health")?.value);
    for (let level = 2; level <= MAX_LEVEL; level++) {
      expect(health(level)).toBeGreaterThan(health(level - 1));
    }
  });

  it("answers the question that decides the fight", () => {
    // Picking a champion is choosing how to play; picking a boss is choosing
    // what you can survive. How many hits you can take is the number that
    // settles it, and it needs the champion's health because the same boss
    // kills Ember in three and Frost in six.
    const embersOdds = describeBoss(1, 80).find((s) => s.label === "kills you in");
    const frostsOdds = describeBoss(1, 130).find((s) => s.label === "kills you in");
    expect(embersOdds?.value).not.toBe(frostsOdds?.value);
    expect(parseInt(frostsOdds?.value ?? "0", 10)).toBeGreaterThan(
      parseInt(embersOdds?.value ?? "0", 10),
    );
  });

  it("states plain labels with no jargon, like every other card", () => {
    for (const stat of describeBoss(1, 100)) {
      expect(stat.label).toMatch(/^[a-z0-9 ]+$/);
      expect(stat.value).not.toContain("%");
    }
  });

  it("carries the unit on any value that is not a bare count", () => {
    // "hits you for 22" left the 22 to be guessed at and could be read as a
    // rate. Every card on this screen names the thing and puts the unit on the
    // number.
    const attack = describeBoss(1, 100).find((s) => s.label === "its attack");
    expect(attack?.value).toContain("damage");
    expect(describeBoss(1, 100).find((s) => s.label === "kills you in")?.value).toContain("hits");
  });
});
