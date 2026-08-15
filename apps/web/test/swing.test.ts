import { beforeEach, describe, expect, it } from "vitest";
import { swingProgress } from "../src/game/swing";
import { COMBAT, attackSpec } from "../src/game/combat";
import { bossSwing, bossState, setBossAction } from "../src/game/bossState";

/**
 * Swing curves are what make an attack legible, and both of them were bugs
 * before they were features: the third-person weapon sat rigid while damage
 * landed, and so did the boss's. The curves are pure functions of time, so the
 * property that matters can be asserted directly: the weapon must be travelling
 * fastest during the window when the hit actually registers.
 */

describe("swingProgress", () => {
  it("is zero when not attacking", () => {
    expect(swingProgress(null)).toBe(0);
  });

  it("never travels away from the target", () => {
    /*
     * The wind-up used to pull the blade back to -0.6 before driving it
     * through, which is how a swing is animated and read wrong here: a light
     * wind-up is 120ms, so the eye catches the reversal and little else and the
     * weapon appeared to move backwards when the player pressed attack.
     */
    for (const kind of ["light", "heavy"] as const) {
      const spec = attackSpec(kind);
      const total = spec.windupMs + spec.activeMs + spec.recoveryMs;
      for (let ms = 0; ms <= total; ms += 10) {
        expect(swingProgress({ kind, startedAt: 0 }, ms)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("still moves during the wind-up, so a heavy attack is not frozen", () => {
    // 420ms of nothing before a heavy lands reads as the input being dropped.
    const spec = attackSpec("heavy");
    const mid = swingProgress({ kind: "heavy", startedAt: 0 }, spec.windupMs / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(swingProgress({ kind: "heavy", startedAt: 0 }, spec.windupMs));
  });

  it("peaks during the active window, when the hit test can land", () => {
    const spec = attackSpec("light");
    const startedAt = 0;
    const activeMid = spec.windupMs + spec.activeMs / 2;

    const atActive = swingProgress({ kind: "light", startedAt }, activeMid);
    const atWindup = swingProgress({ kind: "light", startedAt }, spec.windupMs / 2);
    const atEnd = swingProgress(
      { kind: "light", startedAt },
      spec.windupMs + spec.activeMs + spec.recoveryMs,
    );

    expect(atActive).toBeGreaterThan(atWindup);
    expect(atActive).toBeGreaterThan(atEnd);
  });

  it("travels further for a heavy swing than a light one", () => {
    const startedAt = 0;
    const peak = (kind: "light" | "heavy") => {
      const spec = attackSpec(kind);
      let max = -Infinity;
      for (let t = 0; t <= spec.windupMs + spec.activeMs + spec.recoveryMs; t += 5) {
        max = Math.max(max, swingProgress({ kind, startedAt }, t));
      }
      return max;
    };
    expect(peak("heavy")).toBeGreaterThan(peak("light"));
  });

  it("settles once the attack is over rather than running away", () => {
    const spec = attackSpec("heavy");
    const total = spec.windupMs + spec.activeMs + spec.recoveryMs;
    const after = swingProgress({ kind: "heavy", startedAt: 0 }, total + 5000);
    // Clamped at t = 1, so a stale attack cannot keep accumulating rotation.
    expect(Math.abs(after)).toBeLessThan(1.5);
  });

  it("is deterministic for a given time", () => {
    const attack = { kind: "light" as const, startedAt: 500 };
    expect(swingProgress(attack, 700)).toBe(swingProgress(attack, 700));
  });
});

describe("bossSwing", () => {
  beforeEach(() => setBossAction("idle", 0));

  it("is still while idle", () => {
    expect(bossSwing()).toBe(0);
  });

  it("winds back through the telegraph", () => {
    setBossAction("telegraph", 0.9);
    expect(bossSwing()).toBeLessThan(0);
  });

  it("swings forward hardest mid-strike", () => {
    setBossAction("strike", 0.5);
    const mid = bossSwing();
    setBossAction("telegraph", 1);
    const wound = bossSwing();
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(wound);
  });

  it("returns toward rest during recovery", () => {
    setBossAction("strike", 0.5);
    const striking = bossSwing();
    setBossAction("recover", 0.9);
    expect(Math.abs(bossSwing())).toBeLessThan(Math.abs(striking));
  });

  it("publishes what was set, so the weapon and body cannot disagree", () => {
    setBossAction("strike", 0.42);
    expect(bossState.action).toBe("strike");
    expect(bossState.progress).toBeCloseTo(0.42, 5);
  });
});

describe("combat tuning invariants", () => {
  it("keeps attack reach beyond the boss's standoff distance", () => {
    // The bug this pins: the boss parked at 3.1 while a light attack reached
    // 3.2, so light swings whiffed almost by design.
    expect(COMBAT.lightAttack.reach).toBeGreaterThan(COMBAT.boss.preferredRange);
    expect(COMBAT.heavyAttack.reach).toBeGreaterThan(COMBAT.boss.preferredRange);
  });

  it("gives a jump enough speed to leave the ground against gravity", () => {
    expect(COMBAT.player.jumpSpeed).toBeGreaterThan(0);
    expect(COMBAT.player.gravity).toBeGreaterThan(COMBAT.player.jumpSpeed);
  });
});
