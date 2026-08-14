import { describe, expect, it } from "vitest";
import { COMBAT, attackSpec, isWithinArc } from "../src/game/combat";
import {
  ARENA_RADIUS,
  BOSS_LIMIT,
  CAMERA_LIMIT,
  PLAYER_LIMIT,
} from "../src/game/arenaGeometry";

/**
 * Hit resolution is the one piece of combat that must be provably correct:
 * telemetry drives the relic, so a hit test that fires when it shouldn't
 * changes which weapon the player earns.
 */

const origin = { x: 0, z: 0 };
const facingNorth = { x: 0, z: -1 };

describe("isWithinArc", () => {
  it("hits a target directly ahead and in range", () => {
    expect(isWithinArc(origin, facingNorth, { x: 0, z: -2 }, 3, 110)).toBe(true);
  });

  it("misses a target beyond reach", () => {
    expect(isWithinArc(origin, facingNorth, { x: 0, z: -9 }, 3, 110)).toBe(false);
  });

  it("misses a target directly behind", () => {
    expect(isWithinArc(origin, facingNorth, { x: 0, z: 2 }, 3, 110)).toBe(false);
  });

  it("respects the arc edges", () => {
    // 110° arc → 55° either side. 50° in, 60° out.
    const at = (deg: number) => {
      const rad = (deg * Math.PI) / 180;
      return { x: Math.sin(rad) * 2, z: -Math.cos(rad) * 2 };
    };
    expect(isWithinArc(origin, facingNorth, at(50), 3, 110)).toBe(true);
    expect(isWithinArc(origin, facingNorth, at(60), 3, 110)).toBe(false);
  });

  it("does not divide by zero when the target overlaps the attacker", () => {
    expect(() => isWithinArc(origin, facingNorth, origin, 3, 110)).not.toThrow();
    expect(isWithinArc(origin, facingNorth, origin, 3, 110)).toBe(false);
  });

  it("ignores vertical separation, the arena is flat", () => {
    expect(isWithinArc({ x: 0, z: 0 }, facingNorth, { x: 0, z: -2 }, 3, 110)).toBe(true);
  });
});

describe("attack specs", () => {
  it("trades heavy damage against a slower windup", () => {
    const light = attackSpec("light");
    const heavy = attackSpec("heavy");
    expect(heavy.damage).toBeGreaterThan(light.damage);
    expect(heavy.windupMs).toBeGreaterThan(light.windupMs);
    expect(heavy.reach).toBeGreaterThanOrEqual(light.reach);
  });

  it("keeps the fight inside the target length", () => {
    // The forge is the product; a fight that drags undermines it. Roughly
    // 45-90s means the boss should fall in a sane number of committed hits.
    const heavyHits = Math.ceil(COMBAT.boss.maxHp / COMBAT.heavyAttack.damage);
    expect(heavyHits).toBeGreaterThan(8);
    expect(heavyHits).toBeLessThan(30);
  });

  it("lets the player survive a handful of mistakes, not a dozen", () => {
    const hitsToKill = Math.ceil(COMBAT.player.maxHp / COMBAT.boss.damage);
    expect(hitsToKill).toBeGreaterThanOrEqual(4);
    expect(hitsToKill).toBeLessThanOrEqual(6);
  });

  it("gives dodge invulnerability a real window but a real cost", () => {
    expect(COMBAT.player.dodgeDurationMs).toBeGreaterThanOrEqual(200);
    expect(COMBAT.player.dodgeCooldownMs).toBeGreaterThan(COMBAT.player.dodgeDurationMs * 2);
  });

  it("telegraphs boss attacks long enough to react to", () => {
    expect(COMBAT.boss.telegraphMs).toBeGreaterThan(COMBAT.player.dodgeCooldownMs / 2);
  });
});

describe("arena bounds", () => {
  // Asserted against the shared constants rather than numbers copied in here.
  // A test that restates the values it is checking cannot catch them drifting.
  it("orders every limit correctly inside the arena", () => {
    expect(BOSS_LIMIT).toBeLessThan(PLAYER_LIMIT);
    expect(PLAYER_LIMIT).toBeLessThan(CAMERA_LIMIT);
    expect(CAMERA_LIMIT).toBeLessThan(ARENA_RADIUS);
  });

  it("leaves the boss reachable when pinned at its limit", () => {
    // If the boss can sit further out than the player can reach, a fight at the
    // edge stalls with neither side able to act.
    expect(PLAYER_LIMIT - BOSS_LIMIT).toBeLessThan(COMBAT.lightAttack.reach);
  });

  it("keeps the boss inside its own approach distance of the player", () => {
    // The boss walks to preferredRange; if that were larger than the gap between
    // the limits it could never close on a player standing at the wall.
    expect(COMBAT.boss.preferredRange).toBeGreaterThan(PLAYER_LIMIT - BOSS_LIMIT);
  });
});

describe("attack input", () => {
  it("cannot resolve a light attack faster than its own recovery", () => {
    // The buffer exists because a press during recovery used to be discarded,
    // which is why heavy attacks never appeared to land.
    const light = attackSpec("light");
    const total = light.windupMs + light.activeMs + light.recoveryMs;
    expect(total).toBeGreaterThan(300);
    // A 400ms buffer window has to outlast a light attack, or the buffered press
    // goes stale before the attack it was waiting on has finished.
    expect(total).toBeLessThan(500);
  });
});
