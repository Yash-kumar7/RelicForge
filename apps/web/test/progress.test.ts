import { describe, expect, it } from "vitest";
import { RANKS, rankFor, xpFor } from "../src/state/useProgress";

/**
 * Rank and XP are cosmetic by design, but they must never contradict the relic.
 * If pushing for rank rewarded playing differently from what produces a good
 * weapon, the progression would be quietly fighting the game's own thesis.
 */

const base = {
  bossLevel: 1,
  healthRemaining: 50,
  dodges: 0,
  healingUsed: 1,
  forgedRelic: true,
};

describe("xpFor", () => {
  it("pays more for harder bosses", () => {
    expect(xpFor({ ...base, bossLevel: 5 })).toBeGreaterThan(xpFor({ ...base, bossLevel: 1 }));
  });

  it("rewards the desperate finish that also produces a shattered relic", () => {
    // These must point the same way: the most interesting outcome should be
    // both the best relic and the best XP.
    expect(xpFor({ ...base, healthRemaining: 8 })).toBeGreaterThan(
      xpFor({ ...base, healthRemaining: 50 }),
    );
  });

  it("rewards never healing", () => {
    expect(xpFor({ ...base, healingUsed: 0 })).toBeGreaterThan(xpFor({ ...base, healingUsed: 2 }));
  });

  it("rewards evasive play", () => {
    expect(xpFor({ ...base, dodges: 8 })).toBeGreaterThan(xpFor({ ...base, dodges: 1 }));
  });

  it("never returns zero or negative for a win", () => {
    for (const level of [1, 2, 3, 4, 5]) {
      expect(xpFor({ ...base, bossLevel: level })).toBeGreaterThan(0);
    }
  });

  it("is deterministic", () => {
    expect(xpFor(base)).toBe(xpFor(base));
  });
});

describe("rankFor", () => {
  it("starts unproven at zero", () => {
    expect(rankFor(0).name).toBe("Unproven");
    expect(rankFor(0).index).toBe(0);
  });

  it("promotes exactly at each threshold, not one short", () => {
    for (const rank of RANKS) {
      expect(rankFor(rank.at).name).toBe(rank.name);
      if (rank.at > 0) expect(rankFor(rank.at - 1).name).not.toBe(rank.name);
    }
  });

  it("caps at the final rank with no next threshold", () => {
    const top = RANKS[RANKS.length - 1]!;
    const capped = rankFor(top.at + 99_999);
    expect(capped.name).toBe(top.name);
    expect(capped.next).toBeNull();
  });

  it("reports progress inside the current band", () => {
    const second = RANKS[1]!;
    const third = RANKS[2]!;
    const midway = Math.floor((second.at + third.at) / 2);
    const rank = rankFor(midway);
    expect(rank.into).toBeGreaterThan(0);
    expect(rank.into).toBeLessThan(rank.span);
  });

  it("never divides by zero at max rank", () => {
    const top = RANKS[RANKS.length - 1]!;
    expect(rankFor(top.at).span).toBeGreaterThan(0);
  });
});
