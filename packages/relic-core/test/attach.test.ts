import { describe, expect, it } from "vitest";
import { attachRelic, weaponSway } from "../src/attach.js";
import type { RelicTransform } from "../src/types.js";

const transform: RelicTransform = {
  quaternion: [0, 0, 0, 1],
  scale: 1,
  gripOffset: [0, -0.3, 0],
  rawAngleDeg: 0.1,
  gripT: 0.18,
  endConfidence: 0.6,
  usedHint: false,
};

describe("attachRelic", () => {
  it("gives every production class a pose", () => {
    for (const weaponClass of ["greatsword", "spear", "warhammer"] as const) {
      const pose = attachRelic(transform, weaponClass);
      expect(pose.scale).toBeGreaterThan(0);
      expect(pose.position).toHaveLength(3);
      expect(pose.rotation).toHaveLength(3);
    }
  });

  it("holds the weapon below and in front of the camera", () => {
    const pose = attachRelic(transform, "greatsword");
    expect(pose.position[1]).toBeLessThan(0); // below eye line
    expect(pose.position[2]).toBeLessThan(0); // in front, -Z is forward
  });

  it("pushes the longer weapon further from the camera", () => {
    // A spear posed at greatsword distance fills the entire viewport.
    const spear = attachRelic(transform, "spear");
    const greatsword = attachRelic(transform, "greatsword");
    expect(spear.position[2]).toBeLessThan(greatsword.position[2]);
    expect(spear.scale).toBeLessThan(greatsword.scale);
  });

  it("returns a fresh object so callers cannot mutate the shared pose table", () => {
    const a = attachRelic(transform, "greatsword");
    a.position[0] = 99;
    expect(attachRelic(transform, "greatsword").position[0]).not.toBe(99);
  });

  it("ignores the canonical transform, because canonicalization already normalized it", () => {
    const scaled: RelicTransform = { ...transform, scale: 7.5 };
    expect(attachRelic(scaled, "greatsword")).toEqual(attachRelic(transform, "greatsword"));
  });
});

describe("weaponSway", () => {
  it("sways further while moving", () => {
    const samples = (moving: boolean) =>
      Array.from({ length: 64 }, (_, i) => Math.abs(weaponSway(i * 0.05, moving).x));
    const maxOf = (xs: number[]) => Math.max(...xs);
    expect(maxOf(samples(true))).toBeGreaterThan(maxOf(samples(false)));
  });

  it("stays small enough to read as breathing rather than drift", () => {
    for (let t = 0; t < 10; t += 0.1) {
      const sway = weaponSway(t, true);
      expect(Math.abs(sway.x)).toBeLessThan(0.05);
      expect(Math.abs(sway.y)).toBeLessThan(0.05);
    }
  });

  it("is deterministic for a given time", () => {
    expect(weaponSway(1.23, true)).toEqual(weaponSway(1.23, true));
  });
});
