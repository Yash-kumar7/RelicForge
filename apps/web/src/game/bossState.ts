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

/** Returns the boss to rest, so a new fight does not start mid-swing. */
export function resetBossState(): void {
  bossState.action = "idle";
  bossState.progress = 0;
}

export function setBossAction(action: BossAction, progress: number): void {
  bossState.action = action;
  bossState.progress = progress;
}

/** Where the arm sits at the end of the wind-up, and at the end of the strike. */
const WOUND = -1.3;
const EXTENDED = 2.4;

/**
 * Swing offset for the boss's weapon, as one continuous motion.
 *
 * The first version only really moved during the 260ms strike window, which is
 * too brief to register: the weapon appeared static and damage seemed to arrive
 * from nowhere. The motion now spans all three phases, so roughly 1.2 seconds
 * of visible movement rather than a quarter of one.
 *
 *   telegraph  rest to wound, easing out so it settles into the raised pose
 *   strike     wound to extended, easing in so it accelerates into the blow
 *   recover    extended back to rest, a slow follow-through
 */
export function bossSwing(): number {
  const p = Math.min(1, Math.max(0, bossState.progress));

  switch (bossState.action) {
    case "telegraph": {
      // Decelerating: fast lift, then a held, threatening pause.
      const eased = 1 - (1 - p) * (1 - p);
      return WOUND * eased;
    }
    case "strike": {
      /**
       * Decelerating, not accelerating.
       *
       * Damage is applied at the instant the wind-up ends and the strike
       * begins, so the weapon has to be through its arc immediately. An
       * ease-in curve left it still behind the boss halfway through the strike,
       * meaning the hit landed before the swing visibly happened. A test caught
       * this by asserting the arm is past rest at mid-strike.
       */
      const eased = 1 - (1 - p) * (1 - p);
      return WOUND + (EXTENDED - WOUND) * eased;
    }
    case "recover":
      return EXTENDED * (1 - p);
    default:
      return 0;
  }
}
