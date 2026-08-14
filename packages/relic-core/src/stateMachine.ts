import type { RelicStatus } from "./types.js";

/**
 * Explicit machine rather than boolean soup. The forge cinematic is driven
 * entirely by these transitions, and an impossible state on screen is a bug
 * the player experiences as the reveal breaking.
 */
export const TRANSITIONS: Record<RelicStatus, readonly RelicStatus[]> = {
  DNA_READY: ["GENERATING_CONCEPT", "FAILED"],
  GENERATING_CONCEPT: ["CONCEPT_READY", "FAILED"],
  CONCEPT_READY: ["FORGING_3D", "FAILED"],
  FORGING_3D: ["MODEL_READY", "FAILED"],
  MODEL_READY: ["COMPLETE", "FAILED"],
  COMPLETE: [],
  // Retry re-enters the pipeline from the top.
  FAILED: ["GENERATING_CONCEPT"],
};

export function canTransition(from: RelicStatus, to: RelicStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RelicStatus, to: RelicStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal relic transition: ${from} → ${to}`);
  }
}

export const TERMINAL_STATUSES: readonly RelicStatus[] = ["COMPLETE", "FAILED"];

export function isTerminal(status: RelicStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
