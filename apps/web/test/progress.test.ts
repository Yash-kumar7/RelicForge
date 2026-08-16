import { describe, expect, it } from "vitest";
import { RANKS, rankFor, useProgress, xpFor, type XpEvent } from "../src/state/useProgress";

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

describe("the award breakdown", () => {
  /*
   * The lines are written out in words rather than derived from xpFor, because
   * one is arithmetic and the other is a sentence a player has to recognise from
   * the fight they just had. That is a deliberate duplication, and this is what
   * stops it drifting: whatever the two say, they must agree on the total.
   */
  it("adds up to exactly what the fight paid", () => {
    const cases: XpEvent[] = [
      { bossLevel: 1, healthRemaining: 8, dodges: 7, healingUsed: 0, forgedRelic: true },
      { bossLevel: 3, healthRemaining: 85, dodges: 0, healingUsed: 2, forgedRelic: true },
      { bossLevel: 5, healthRemaining: 50, dodges: 6, healingUsed: 0, forgedRelic: false },
      { bossLevel: 2, healthRemaining: 20, dodges: 3, healingUsed: 1, forgedRelic: false },
    ];

    for (const event of cases) {
      useProgress.getState().reset();
      useProgress.getState().award(event);
      const award = useProgress.getState().lastAward;

      expect(award).not.toBeNull();
      expect(award?.gained).toBe(xpFor(event));
      expect(award?.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(xpFor(event));
    }
  });

  it("reports a rank up only when a threshold was actually crossed", () => {
    useProgress.getState().reset();

    // 260 on the first rung clears 150, so this is a genuine crossing.
    useProgress.getState().award({
      bossLevel: 1,
      healthRemaining: 8,
      dodges: 7,
      healingUsed: 0,
      forgedRelic: true,
    });
    expect(useProgress.getState().lastAward?.rankUp).toBe("Ashbearer");

    // The next win lands inside the same rank, so nothing is announced.
    useProgress.getState().award({
      bossLevel: 1,
      healthRemaining: 50,
      dodges: 0,
      healingUsed: 1,
      forgedRelic: false,
    });
    expect(useProgress.getState().lastAward?.rankUp).toBeNull();
  });
});

describe("the ladder and the ranks", () => {
  /** The best a rung can pay: near death, unhealed, well dodged, relic claimed. */
  const bestAt = (bossLevel: number) =>
    xpFor({ bossLevel, healthRemaining: 8, dodges: 7, healingUsed: 0, forgedRelic: true });

  /** A win and nothing else. */
  const worstAt = (bossLevel: number) =>
    xpFor({ bossLevel, healthRemaining: 50, dodges: 0, healingUsed: 1, forgedRelic: false });

  const total = (pay: (level: number) => number) =>
    [1, 2, 3, 4, 5].reduce((sum, level) => sum + pay(level), 0);

  it("takes a player to the rank below the top for a flawless single clear", () => {
    /*
     * Finishing and mastering should not be the same act. A perfect run of all
     * five pays 1900 and lands on Forgesworn, one short of the end: every rank up
     * to that point is a boss cleared well, and the last one is deliberately past
     * anything a single clear can pay.
     *
     * The first version of this asked 2200 by accident and was unreachable in a
     * way nobody had checked. This asks 2400 on purpose.
     */
    const rank = rankFor(total(bestAt));
    expect(rank.index).toBe(RANKS.length - 2);
    expect(total(bestAt)).toBeLessThan(RANKS[RANKS.length - 1]!.at);
  });

  it("puts the last rank within reach of a few more good fights", () => {
    // Past a full clear, but not a wall: three more strong fights on the upper
    // rungs get there, which is what the word legend should cost.
    const remaining = RANKS[RANKS.length - 1]!.at - total(bestAt);
    expect(remaining).toBeLessThanOrEqual(bestAt(5) + bestAt(4));
  });

  it("does not hand the top rank to a sloppy run", () => {
    // Winning five times with no bonuses at all should leave a player mid-ladder,
    // or rank measures distance travelled and nothing about how it was travelled.
    const rank = rankFor(total(worstAt));
    expect(rank.index).toBeGreaterThan(0);
    expect(rank.index).toBeLessThan(RANKS.length - 1);
  });

  it("moves a rank for each boss cleared well, up to the last one", () => {
    // The first five thresholds are the ladder, so a good fight on each rung is
    // worth exactly one rank. The sixth is not, by design.
    let cumulative = 0;
    for (let level = 1; level <= 4; level++) {
      cumulative += bestAt(level);
      expect(rankFor(cumulative).index).toBeGreaterThanOrEqual(level);
    }
  });
});
