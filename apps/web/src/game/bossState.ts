/**
 * The boss's current action, published for anything that has to move with it.
 *
 * A module-level handle rather than store state for the same reason the player
 * has one: this is read inside useFrame every frame, and routing it through
 * Zustand would re-render the tree during combat.
 *
 * It exists because the boss's weapon needs to swing when the boss swings. The
 * body already leaned on the wind-up, but the weapon sat rigid in its hand,
 * which is the same defect the player's third-person view had: damage happening
 * while nothing visibly moves.
 */
export type BossAction = "idle" | "telegraph" | "strike" | "recover";

export const bossState = {
  action: "idle" as BossAction,
  /** 0 to 1 through the current action. */
  progress: 0,
};

export function setBossAction(action: BossAction, progress: number): void {
  bossState.action = action;
  bossState.progress = progress;
}

/**
 * Swing offset for the boss's weapon: back and up while winding up, then hard
 * down and through. Mirrors the player's curve so both read the same way.
 */
export function bossSwing(): number {
  if (bossState.action === "telegraph") return -bossState.progress * 0.9;
  if (bossState.action === "strike") return Math.sin(bossState.progress * Math.PI) * 2.6 - 0.9;
  if (bossState.action === "recover") return -0.9 * (1 - bossState.progress) * 0.3;
  return 0;
}
