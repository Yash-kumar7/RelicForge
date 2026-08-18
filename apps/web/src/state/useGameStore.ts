import { create } from "zustand";
import type { Affinity, CombatTelemetry, RelicDNA, RelicTransform } from "@relic/core";
import { bossAt, type BossLevel } from "../game/bosses";
import { championFor } from "../game/champions";

/**
 * Game phase, combat telemetry, and the forge lifecycle.
 *
 * Per-frame values (position, velocity, cooldown timers) deliberately live in
 * refs inside the components, not here, pushing them through React state at
 * 60fps would re-render the whole tree every frame.
 */

export type GamePhase =
  | "TITLE"
  | "CHOOSE_AFFINITY"
  | "FIGHTING"
  | "VICTORY"
  | "DEFEAT"
  | "FORGING"
  // No REVEAL phase: the pedestal reveal happens inside FORGING, driven by the
  // forge stage, so a separate phase would be a second source of truth.;

export type ForgeStage =
  | "IDLE"
  | "ANALYZING"
  | "DNA_READY"
  | "GENERATING_CONCEPT"
  | "CONCEPT_READY"
  | "FORGING_3D"
  | "MODEL_READY"
  | "COMPLETE"
  | "FAILED";

export const PLAYER_MAX_HP = 100;
/** Base value; the live maximum is scaled by difficulty and boss level. */
export const BOSS_MAX_HP = 1000;

/**
 * Cuts every boss to a tenth of its health, with ?easy.
 *
 * Not a difficulty setting. The forge is the end of a fight that takes a minute
 * or two to win, which makes the part of this game that most needs looking at the
 * part that is hardest to reach: every check of how a relic comes out has to be
 * paid for with a full fight first.
 *
 * A flag rather than an edited constant, because a constant gets changed to try
 * something and then shipped by whoever forgets to change it back. This one is
 * off unless it is asked for in the URL, and it is read once at boot rather than
 * per fight, so it cannot be turned on mid-run.
 *
 * Telemetry is untouched. Health remaining, dodges and heavy ratio all read
 * exactly as they would in a real fight, so the relic a shortened fight forges is
 * the relic that fight would have forged.
 */
const EASY_MODE =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("easy") !== null;

/** A tenth, which is one or two exchanges rather than a fight. */
const EASY_BOSS_HP = 0.1;

export interface ForgeState {
  stage: ForgeStage;
  relicId: string | null;
  name: string | null;
  dna: RelicDNA | null;
  conceptUrl: string | null;
  modelUrl: string | null;
  transform: RelicTransform | null;
  meshPercent: number;
  /** Which concept candidate is being generated, and how many there are. */
  conceptAttempt: number;
  conceptAttempts: number;
  /**
   * The candidates themselves, in the order they finished.
   *
   * Hero mode draws three concepts and keeps one, because geometry quality is
   * dominated by concept quality and images are cheap next to a mesh. None of
   * that was visible: the screen held a counter over an empty frame for the
   * half minute it takes, so the most deliberate step in the pipeline read as
   * slow loading.
   */
  conceptCandidates: string[];
  totalMs: number | null;
  cached: boolean;
  error: string | null;
}

interface GameState {
  phase: GamePhase;
  affinity: Affinity;
  /**
   * Null until the player picks. Nothing should be pre-selected: a highlighted
   * level the player never chose reads as a decision already made for them, and
   * they can descend without ever looking at the ladder.
   */
  bossLevel: number | null;
  playerHp: number;
  /**
   * Scaled by the champion, so a Frost run genuinely has more to lose than an
   * Ember one and healthRemaining still reports a true percentage.
   */
  playerMaxHp: number;
  bossHp: number;
  /** Scaled per run, so the HUD percentage is honest at every difficulty. */
  bossMaxHp: number;
  fightStartedAt: number | null;
  /**
   * Whether combat is actually live.
   *
   * Entering FIGHTING is not the same as the fight having started: the briefing
   * is on screen and the player has not taken pointer lock yet. Without this
   * gate the boss walks over and hits you while you are still reading, and the
   * fight duration counts your reading time as combat.
   */
  combatActive: boolean;
  /**
   * Whether the opening camera move is still running.
   *
   * Its own flag rather than a phase, because nothing else about the fight
   * changes while it plays: the arena is built, the boss is standing in it, and
   * combat is simply not armed yet. Player reads it to leave the camera alone,
   * the HUD reads it to stay out of the frame, and the briefing reads it to know
   * it has been dismissed.
   */
  cinematic: boolean;
  /**
   * The 3-2-1, counted in whole numbers, null when it is not running.
   *
   * Between the camera handing back and combat arming. The camera move shows the
   * room; this says the fight is about to start, which are two different jobs —
   * dropping straight from a slow flythrough into a live boss is the same
   * unannounced start the flythrough was added to fix, just prettier.
   */
  countdown: number | null;
  /**
   * Both views, opening on the champion.
   *
   * First person frames the relic larger, and was briefly the default for that
   * reason: the weapon is what the game is about, and held at the camera every
   * chip and molten crack on it is legible.
   *
   * Third person wins anyway. Three setup steps are spent choosing a champion,
   * and a fight that opens without one in shot makes that choice look decorative.
   * It is also the only view where the weapon can be seen being swung — a first
   * person swing is an arm crossing the frame, while from behind it is a whole
   * body turning into it, which is what sells a hit.
   *
   * One key away either direction, so anyone who wants the relic at size has it.
   */
  view: "first" | "third";
  /**
   * Combat frozen deliberately, with nothing drawn over the top of it.
   *
   * The fight owns the cursor, so a region screenshot cannot be dragged and
   * releasing the pointer to get it back throws the pause card over the exact
   * thing being photographed. This is a pause that stays out of the picture: the
   * boss stops, the cursor comes back, and the screen is left as it was.
   */
  photoMode: boolean;
  /**
   * Milliseconds spent paused. Subtracted from the elapsed clock so that
   * stepping away mid-fight does not read as a slow, cautious victory and
   * change which relic is forged.
   */
  pausedTotalMs: number;
  pausedAt: number | null;

  /** Accumulated during the fight, snapshotted on victory. */
  telemetry: Omit<CombatTelemetry, "affinity" | "healthRemaining" | "fightDuration">;
  forge: ForgeState;

  setPhase: (phase: GamePhase) => void;
  chooseAffinity: (affinity: Affinity) => void;
  chooseBossLevel: (level: number) => void;
  boss: () => BossLevel;
  startFight: () => void;
  /** Hands the camera to the opening move. The countdown follows it. */
  beginCinematic: () => void;
  /** Ends the camera move and starts the 3-2-1. */
  startCountdown: () => void;
  /** One tick of the 3-2-1. Arming combat is left to the caller at zero. */
  tickCountdown: () => void;
  armCombat: () => void;
  toggleView: () => void;
  togglePhotoMode: () => void;
  pauseCombat: () => void;
  damageBoss: (amount: number, kind: "light" | "heavy" | "ability") => void;
  damagePlayer: (amount: number) => void;
  heal: (amount: number) => void;
  recordDodge: () => void;
  snapshotTelemetry: () => CombatTelemetry;
  patchForge: (patch: Partial<ForgeState>) => void;
  /** Appends a finished concept candidate. Its own action because it accumulates,
      and patchForge cannot read what it is adding to. */
  addConceptCandidate: (url: string) => void;
  reset: () => void;
}

const EMPTY_TELEMETRY = {
  damageDealt: 0,
  damageTaken: 0,
  lightAttacks: 0,
  heavyAttacks: 0,
  finishingAttack: "light" as const,
  dodges: 0,
  healingUsed: 0,
};

const EMPTY_FORGE: ForgeState = {
  stage: "IDLE",
  relicId: null,
  name: null,
  dna: null,
  conceptUrl: null,
  modelUrl: null,
  transform: null,
  meshPercent: 0,
  conceptAttempt: 0,
  conceptAttempts: 0,
  conceptCandidates: [],
  totalMs: null,
  cached: false,
  error: null,
};

export const useGameStore = create<GameState>((set, get) => ({
  phase: "TITLE",
  affinity: "fire",
  bossLevel: null,
  playerHp: PLAYER_MAX_HP,
  playerMaxHp: PLAYER_MAX_HP,
  bossHp: BOSS_MAX_HP,
  bossMaxHp: BOSS_MAX_HP,
  fightStartedAt: null,
  combatActive: false,
  cinematic: false,
  countdown: null,
  photoMode: false,
  view: "third",
  pausedTotalMs: 0,
  pausedAt: null,
  telemetry: { ...EMPTY_TELEMETRY },
  forge: { ...EMPTY_FORGE },

  setPhase: (phase) => set({ phase }),
  chooseAffinity: (affinity) => set({ affinity }),
  chooseBossLevel: (bossLevel) => set({ bossLevel }),
  // Resolves for consumers mid-fight, by which point a level is always set.
  boss: () => bossAt(get().bossLevel ?? 1),

  startFight: () =>
    set((state) => {
      // The ladder is the only difficulty knob. A separate easy/normal/hard
      // slider would scale the same numbers while changing nothing about the
      // weapon you earn, whereas each rung changes bossInfluence and therefore
      // the relic itself.
      const maxHp = Math.round(
        BOSS_MAX_HP * bossAt(state.bossLevel ?? 1).hp * (EASY_MODE ? EASY_BOSS_HP : 1),
      );
      const playerMaxHp = Math.round(PLAYER_MAX_HP * championFor(state.affinity).traits.maxHp);
      return {
      phase: "FIGHTING" as GamePhase,
      playerHp: playerMaxHp,
      playerMaxHp,
      bossHp: maxHp,
      bossMaxHp: maxHp,
      // Deliberately null: the clock starts when combat is armed, not when the
      // briefing appears, or reading time would inflate fightDuration.
      fightStartedAt: null,
      combatActive: false,
      cinematic: false,
      countdown: null,
      photoMode: false,
      pausedTotalMs: 0,
      pausedAt: null,
      telemetry: { ...EMPTY_TELEMETRY },
      forge: { ...EMPTY_FORGE },
      };
    }),

  beginCinematic: () => set({ cinematic: true, countdown: null }),

  /* The camera is released here, not at zero: the player should be looking through
     their own eyes while they read the numbers, so the view they will fight from is
     the view they are counted into. */
  startCountdown: () => set({ cinematic: false, countdown: 3 }),

  tickCountdown: () =>
    set((state) => (state.countdown === null ? state : { countdown: state.countdown - 1 })),

  armCombat: () =>
    set((state) => {
      if (state.combatActive) return state;
      return {
        combatActive: true,
        // Whatever arms combat also ends the opening move and the count, so a
        // skip and a finished flythrough leave the game in the same state.
        cinematic: false,
        countdown: null,
        /*
         * Whatever resumed the fight ends photo mode.
         *
         * Clicking the canvas takes pointer lock and arms combat directly, so
         * without this the flag survived into a live fight and the next pause
         * would freeze the screen with nothing on it saying why.
         */
        photoMode: false,
        // Preserved across a pause: only the very first arm starts the clock.
        fightStartedAt: state.fightStartedAt ?? Date.now(),
        pausedTotalMs:
          state.pausedAt !== null
            ? state.pausedTotalMs + (Date.now() - state.pausedAt)
            : state.pausedTotalMs,
        pausedAt: null,
      };
    }),

  toggleView: () => set((state) => ({ view: state.view === "first" ? "third" : "first" })),

  togglePhotoMode: () => set((state) => ({ photoMode: !state.photoMode })),


  pauseCombat: () =>
    set((state) =>
      state.combatActive ? { combatActive: false, pausedAt: Date.now() } : state,
    ),

  damageBoss: (amount, kind) =>
    set((state) => {
      const bossHp = Math.max(0, state.bossHp - amount);
      return {
        bossHp,
        telemetry: {
          ...state.telemetry,
          damageDealt: state.telemetry.damageDealt + amount,
          lightAttacks: state.telemetry.lightAttacks + (kind === "light" ? 1 : 0),
          heavyAttacks: state.telemetry.heavyAttacks + (kind === "heavy" ? 1 : 0),
          // Whatever landed last when the boss died is the finishing blow.
          finishingAttack: kind,
        },
        phase: bossHp === 0 ? ("VICTORY" as GamePhase) : state.phase,
      };
    }),

  damagePlayer: (amount) =>
    set((state) => {
      const playerHp = Math.max(0, state.playerHp - amount);
      return {
        playerHp,
        telemetry: { ...state.telemetry, damageTaken: state.telemetry.damageTaken + amount },
        // No relic is forged from a loss. The weapon is meant to be the record
        // of a victory, so losing has to actually cost you the relic.
        phase: playerHp === 0 && state.phase === "FIGHTING" ? ("DEFEAT" as GamePhase) : state.phase,
      };
    }),

  heal: (amount) =>
    set((state) => ({
      playerHp: Math.min(state.playerMaxHp, state.playerHp + amount),
      telemetry: { ...state.telemetry, healingUsed: state.telemetry.healingUsed + 1 },
    })),

  recordDodge: () =>
    set((state) => ({ telemetry: { ...state.telemetry, dodges: state.telemetry.dodges + 1 } })),

  snapshotTelemetry: () => {
    const state = get();
    return {
      ...state.telemetry,
      affinity: state.affinity,
      healthRemaining: Math.round((state.playerHp / state.playerMaxHp) * 100),
      fightDuration: state.fightStartedAt
        ? Math.max(
            0,
            Math.round((Date.now() - state.fightStartedAt - state.pausedTotalMs) / 1000),
          )
        : 0,
    };
  },

  patchForge: (patch) => set((state) => ({ forge: { ...state.forge, ...patch } })),
  addConceptCandidate: (url) =>
    set((state) =>
      // Guarded, because a reconnect replays events the run already saw.
      state.forge.conceptCandidates.includes(url)
        ? state
        : {
            forge: {
              ...state.forge,
              conceptCandidates: [...state.forge.conceptCandidates, url],
            },
          },
    ),

  reset: () =>
    set({
      phase: "TITLE",
      playerHp: PLAYER_MAX_HP,
      playerMaxHp: PLAYER_MAX_HP,
      bossHp: BOSS_MAX_HP,
      bossMaxHp: BOSS_MAX_HP,
      fightStartedAt: null,
      combatActive: false,
      cinematic: false,
      countdown: null,
      photoMode: false,
      pausedTotalMs: 0,
      pausedAt: null,
      telemetry: { ...EMPTY_TELEMETRY },
      forge: { ...EMPTY_FORGE },
    }),
}));
