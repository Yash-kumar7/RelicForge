import { env } from "../env.js";
import { InsufficientCredits } from "../lib/errors.js";
import { getBalance } from "../services/meshy/meshy.balance.js";

/**
 * Credit guard.
 *
 * This is a runaway-bug backstop, not a budget. Credits are replenishable for
 * testing, so cost never dictates a design choice here — but a retry loop
 * spinning unattended for an hour is still a bug, and the floor catches it
 * before it drains the account.
 */

export const CREDIT_COST = {
  "concept:nano-banana": 3,
  "concept:nano-banana-2": 6,
  "concept:nano-banana-pro": 9,
  "mesh:meshy-7": 30,
  "mesh:meshy-7:ultra": 35,
  remesh: 5,
} as const;

export type CreditOp = keyof typeof CREDIT_COST;

export function conceptOp(imageModel: string): CreditOp {
  const key = `concept:${imageModel}` as CreditOp;
  return key in CREDIT_COST ? key : "concept:nano-banana";
}

export function meshOp(ultraMode: boolean): CreditOp {
  return ultraMode ? "mesh:meshy-7:ultra" : "mesh:meshy-7";
}

// Balance is only re-read when it is stale or close to the floor — every check
// is itself a network round trip in the middle of a latency-sensitive pipeline.
let lastBalance: number | null = null;
let lastCheckedAt = 0;
const MAX_AGE_MS = 60_000;

export async function currentBalance(force = false): Promise<number> {
  const stale = Date.now() - lastCheckedAt > MAX_AGE_MS;
  if (force || stale || lastBalance === null) {
    lastBalance = await getBalance();
    lastCheckedAt = Date.now();
  }
  return lastBalance;
}

/** Throws before spending if the operation would breach the floor. */
export async function assertBudget(op: CreditOp): Promise<void> {
  const cost = CREDIT_COST[op];
  const balance = await currentBalance();

  if (balance - cost < env.CREDIT_FLOOR) {
    // Re-read once: the cached value may simply be out of date.
    const fresh = await currentBalance(true);
    if (fresh - cost < env.CREDIT_FLOOR) {
      throw new InsufficientCredits(
        `Refusing ${op} (${cost} credits): balance ${fresh} would drop below floor ${env.CREDIT_FLOOR}`,
      );
    }
  }

  if (lastBalance !== null) lastBalance -= cost;
}

export function estimateCost(ops: CreditOp[]): number {
  return ops.reduce((sum, op) => sum + CREDIT_COST[op], 0);
}
