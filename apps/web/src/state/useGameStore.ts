import { create } from "zustand";
import type { Affinity, CombatTelemetry, RelicDNA, RelicTransform } from "@relic/core";

/**
 * Game phase, combat telemetry, and the forge lifecycle.
 *
 * Per-frame values (position, velocity, cooldown timers) deliberately live in
 * refs inside the components, not here — pushing them through React state at
 * 60fps would re-render the whole tree every frame.
 */

export type GamePhase =
  | "TITLE"
  | "CHOOSE_AFFINITY"
  | "FIGHTING"
  | "VICTORY"
  | "DEFEAT"
  | "FORGING"
  | "REVEAL"
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
  totalMs: number | null;
  cached: boolean;
  error: string | null;
}

interface GameState {
  phase: GamePhase;
  affinity: Affinity;
  playerHp: number;
  bossHp: number;
  fightStartedAt: number | null;

  /** Accumulated during the fight, snapshotted on victory. */
  telemetry: Omit<CombatTelemetry, "affinity" | "healthRemaining" | "fightDuration">;
  forge: ForgeState;

  setPhase: (phase: GamePhase) => void;
  chooseAffinity: (affinity: Affinity) => void;
  startFight: () => void;
  damageBoss: (amount: number, kind: "light" | "heavy" | "ability") => void;
  damagePlayer: (amount: number) => void;
  heal: (amount: number) => void;
  recordDodge: () => void;
  recordHeal: () => void;
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
  totalMs: null,
  cached: false,
  error: null,
};

export const useGameStore = create<GameState>((set, get) => ({
  phase: "TITLE",
  affinity: "fire",
  playerHp: PLAYER_MAX_HP,
  bossHp: BOSS_MAX_HP,
  fightStartedAt: null,
  telemetry: { ...EMPTY_TELEMETRY },
  forge: { ...EMPTY_FORGE },

  setPhase: (phase) => set({ phase }),
  chooseAffinity: (affinity) => set({ affinity }),

  startFight: () =>
    set({
      phase: "FIGHTING",
      playerHp: PLAYER_MAX_HP,
      bossHp: BOSS_MAX_HP,
      fightStartedAt: Date.now(),
      telemetry: { ...EMPTY_TELEMETRY },
      forge: { ...EMPTY_FORGE },
    }),

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
      playerHp: Math.min(PLAYER_MAX_HP, state.playerHp + amount),
      telemetry: { ...state.telemetry, healingUsed: state.telemetry.healingUsed + 1 },
    })),

  recordDodge: () =>
    set((state) => ({ telemetry: { ...state.telemetry, dodges: state.telemetry.dodges + 1 } })),

  recordHeal: () =>
    set((state) => ({
      telemetry: { ...state.telemetry, healingUsed: state.telemetry.healingUsed + 1 },
    })),

  snapshotTelemetry: () => {
    const state = get();
    return {
      ...state.telemetry,
      affinity: state.affinity,
      healthRemaining: Math.round((state.playerHp / PLAYER_MAX_HP) * 100),
      fightDuration: state.fightStartedAt
        ? Math.round((Date.now() - state.fightStartedAt) / 1000)
        : 0,
    };
  },

  patchForge: (patch) => set((state) => ({ forge: { ...state.forge, ...patch } })),

  reset: () =>
    set({
      phase: "TITLE",
      playerHp: PLAYER_MAX_HP,
      bossHp: BOSS_MAX_HP,
      fightStartedAt: null,
      telemetry: { ...EMPTY_TELEMETRY },
      forge: { ...EMPTY_FORGE },
    }),
}));
