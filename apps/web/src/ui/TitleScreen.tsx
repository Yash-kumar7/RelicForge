import { motion } from "framer-motion";
import type { Affinity } from "@relic/core";
import { useGameStore } from "../state/useGameStore";
import { useLoadout } from "../state/useLoadout";
import { BOSSES, highestCleared, isUnlocked } from "../game/bosses";

/**
 * Run setup: what you fight as, then what you fight.
 *
 * There is no separate difficulty selector. The ladder already scales the
 * fight, and unlike a difficulty slider each rung changes bossInfluence, so a
 * harder boss forges a materially different weapon rather than the same weapon
 * behind bigger numbers.
 *
 * Kept to one screen. Every extra step is time between the player and the only
 * thing this project is actually about.
 */

const AFFINITIES: { id: Affinity; glyph: string; name: string; blurb: string; accent: string }[] = [
  {
    id: "fire",
    glyph: "🔥",
    name: "Ember",
    blurb: "Aggressive. Heavy swings, molten steel.",
    accent: "border-ember-500/60 text-ember-300 hover:bg-ember-500/10",
  },
  {
    id: "ice",
    glyph: "❄️",
    name: "Frost",
    blurb: "Defensive. Precise strikes, crystalline edges.",
    accent: "border-frost-500/60 text-frost-300 hover:bg-frost-500/10",
  },
  {
    id: "storm",
    glyph: "⚡",
    name: "Storm",
    blurb: "Fast. Balanced pressure, fractured alloy.",
    accent: "border-amber-400/50 text-amber-200 hover:bg-amber-400/10",
  },
];

export function TitleScreen() {
  const phase = useGameStore((s) => s.phase);
  const setPhase = useGameStore((s) => s.setPhase);
  const affinity = useGameStore((s) => s.affinity);
  const bossLevel = useGameStore((s) => s.bossLevel);
  const chooseAffinity = useGameStore((s) => s.chooseAffinity);
  const chooseBossLevel = useGameStore((s) => s.chooseBossLevel);
  const startFight = useGameStore((s) => s.startFight);
  const owned = useLoadout((s) => s.owned);

  if (phase === "TITLE") {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-ash-950">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2 }}
          className="text-center"
        >
          <h1 className="font-display text-7xl tracking-[0.18em] text-ember-400 drop-shadow-[0_0_40px_rgba(255,107,26,0.35)]">
            RELICFORGE
          </h1>
          <p className="mt-4 text-xs uppercase tracking-[0.45em] text-stone-500">
            Every legendary is actually legendary
          </p>
        </motion.div>

        <motion.button
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 1 }}
          onClick={() => setPhase("CHOOSE_AFFINITY")}
          className="mt-16 border border-ember-500/50 px-12 py-3 text-xs uppercase tracking-[0.4em] text-ember-300 transition hover:bg-ember-500/10"
        >
          Enter the Arena
        </motion.button>

        {owned.length > 0 && (
          <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.25em] text-stone-600">
            {owned.length} relic{owned.length === 1 ? "" : "s"} kept · {highestCleared()} boss
            {highestCleared() === 1 ? "" : "es"} cleared
          </p>
        )}

        <p className="absolute bottom-8 font-mono text-[10px] uppercase tracking-[0.25em] text-stone-700">
          weapons generated at runtime by meshy-7
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-ash-950 px-6 py-10">
      <div className="mx-auto max-w-4xl">
        {/* Affinity */}
        <section>
          <p className="text-[11px] uppercase tracking-[0.4em] text-stone-600">Choose your affinity</p>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {AFFINITIES.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => chooseAffinity(a.id)}
                className={[
                  "border px-5 py-5 text-left transition",
                  affinity === a.id ? a.accent : "border-ash-700 text-stone-500 hover:border-stone-500",
                ].join(" ")}
              >
                <div className="text-2xl">{a.glyph}</div>
                <div className="mt-3 font-display text-lg tracking-[0.15em]">{a.name}</div>
                <p className="mt-1 text-[11px] leading-relaxed text-stone-600">{a.blurb}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Boss ladder */}
        <section className="mt-10">
          <p className="text-[11px] uppercase tracking-[0.4em] text-stone-600">Choose your quarry</p>
          <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-stone-600">
            Each boss forges a different kind of weapon — what you kill becomes part of what you
            carry.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {BOSSES.map((boss) => {
              const unlocked = isUnlocked(boss.level);
              const selected = bossLevel === boss.level;
              return (
                <button
                  key={boss.level}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => chooseBossLevel(boss.level)}
                  className={[
                    "border px-4 py-4 text-left transition",
                    !unlocked
                      ? "cursor-not-allowed border-ash-800 text-stone-800"
                      : selected
                        ? "border-ember-500/70 bg-ember-500/5 text-stone-200"
                        : "border-ash-700 text-stone-500 hover:border-stone-500",
                  ].join(" ")}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[0.25em]">
                      level {boss.level}
                    </span>
                    {!unlocked && <span className="font-mono text-[10px]">locked</span>}
                  </div>
                  <div className="mt-2 font-display text-lg tracking-[0.1em]">
                    {unlocked ? boss.title : "??????"}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
                    {unlocked ? boss.blurb : `Clear level ${boss.level - 1} to face it.`}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <div className="mt-12 flex items-center justify-between border-t border-ash-800 pt-6">
          <p className="max-w-md text-[11px] leading-relaxed text-stone-600">
            How hard you swing, how often you dodge, and how close to death you finish all shape the
            weapon the forge makes for you.
          </p>
          <button
            type="button"
            onClick={startFight}
            className="border border-ember-500/60 px-10 py-3 text-xs uppercase tracking-[0.35em] text-ember-300 transition hover:bg-ember-500/10"
          >
            Descend
          </button>
        </div>
      </div>
    </div>
  );
}
