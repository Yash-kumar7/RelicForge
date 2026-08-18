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

/**
 * Where the boss stands when a fight begins.
 *
 * Exported so the player's opening view can be derived from it rather than
 * guessed. It was a literal inside Boss.tsx while the player's starting yaw was
 * a separate literal in Player.tsx, and the two disagreed: the fight opened with
 * the player facing the empty end of the arena.
 */
export const BOSS_SPAWN = { x: 0, y: 0, z: -4 } as const;

/** Returns the boss to rest, so a new fight does not start mid-swing. */
export function resetBossState(): void {
  bossState.action = "idle";
  bossState.progress = 0;
}

export function setBossAction(action: BossAction, progress: number): void {
  bossState.action = action;
  bossState.progress = progress;
}

/**
 * Where the arm sits at the end of the wind-up, and at the end of the strike.
 *
 * The wind-up was as large as it was because a telegraph has to be unmissable.
 * It went too far: at -1.3 the weapon travelled about 74 degrees backwards over
 * a full second, then covered the strike in 260ms, so almost everything a player
 * saw was the sword going away from them and the blow itself was a flicker. The
 * attack read as the boss winding up and never hitting.
 *
 * The wind-up is smaller and the strike reaches further, so the down-swing is
 * now the larger and slower-to-miss half of the motion. The telegraph is still
 * a full second, which is what makes the attack dodgeable.
 */
const WOUND = -0.8;
const EXTENDED = 3.1;

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
/**
 * How high the boss carries its weapon, 0 at rest and 1 fully raised.
 *
 * Its own curve, because bossSwing winds backwards rather than upward: it goes
 * to -0.8 during the telegraph and forward through the strike, which is the
 * horizontal shape of the blow. Height has to run on a different schedule —
 * raised while it winds, falling as it comes down — or the blade would lift on
 * the way through the player instead of before it.
 *
 * The same two beats the player has, from the boss's own state machine.
 */
export function bossLift(): number {
  const p = Math.min(1, Math.max(0, bossState.progress));

  switch (bossState.action) {
    case "telegraph":
      // Raised early and held there, which is what makes a telegraph readable.
      return 1 - (1 - p) * (1 - p);
    case "strike":
      return 1 - p;
    default:
      return 0;
  }
}

/**
 * The clip moves the body; the tuned arc still moves the weapon.
 *
 * Both halves, decided by comparison rather than argument. Three modes were built
 * and played against each other — clip only, procedural only, and both — and the
 * answer was split: the clip wins on the body, which used to stand perfectly still
 * through its own attack, and the procedural arc wins on the weapon, because it was
 * tuned for this fight. It is a wide overhead scaled up so it reads from ten metres,
 * where the generated arm motion is naturalistic and too small to carry.
 *
 * The switch is gone now that the question is settled. It is not free — two systems
 * drive one weapon and partly cancel — but losing either half was worse, and that
 * was watched rather than reasoned about.
 */

/**
 * Where the boss is in its attack clip, 0 to 1, or null when it is not attacking.
 *
 * The generated clip is one continuous blow: it winds up, comes down, and recovers.
 * The fight has those same three beats but with its own durations — a full second
 * of telegraph, a short strike, a slower recovery — so the clip is mapped onto them
 * rather than played at its own pace.
 *
 * The split points are eyeballed against the clip and should be checked in frame,
 * not trusted: what they have to satisfy is that the blade is coming down as the
 * strike begins, because that is the instant damage is applied. Everything else is
 * taste.
 */
const WINDUP_END = 0.42;
const STRIKE_END = 0.7;

export function bossAttackAt(): number | null {
  const p = Math.min(1, Math.max(0, bossState.progress));

  switch (bossState.action) {
    case "telegraph":
      return p * WINDUP_END;
    case "strike":
      return WINDUP_END + p * (STRIKE_END - WINDUP_END);
    case "recover":
      return STRIKE_END + p * (1 - STRIKE_END);
    default:
      return null;
  }
}

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
