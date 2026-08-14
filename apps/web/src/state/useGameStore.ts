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
  // forge stage, so a separate phase would be a second source of truth.
  | "EQUIPPED";

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
   * Third person exists because choosing a champion you never see makes the
   * choice pointless. First person stays available: it frames the relic larger
   * and is the better shot for the reveal.
   */
  view: "first" | "third";
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
  armCombat: () => void;
  toggleView: () => void;
  pauseCombat: () => void;
  damageBoss: (amount: number, kind: "light" | "heavy" | "ability") => void;
  damagePlayer: (amount: number) => void;
  heal: (amount: number) => void;
  recordDodge: () => void;
  snapshotTelemetry: () => CombatTelemetry;
  patchForge: (patch: Partial<ForgeState>) => void;
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
      const maxHp = Math.round(BOSS_MAX_HP * bossAt(state.bossLevel ?? 1).hp);
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
      pausedTotalMs: 0,
      pausedAt: null,
      telemetry: { ...EMPTY_TELEMETRY },
      forge: { ...EMPTY_FORGE },
      };
    }),

  armCombat: () =>
    set((state) => {
      if (state.combatActive) return state;
      return {
        combatActive: true,
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

  reset: () =>
    set({
      phase: "TITLE",
      playerHp: PLAYER_MAX_HP,
      playerMaxHp: PLAYER_MAX_HP,
      bossHp: BOSS_MAX_HP,
      bossMaxHp: BOSS_MAX_HP,
      fightStartedAt: null,
      combatActive: false,
      pausedTotalMs: 0,
      pausedAt: null,
      telemetry: { ...EMPTY_TELEMETRY },
      forge: { ...EMPTY_FORGE },
    }),
}));
