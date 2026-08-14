import { motion } from "framer-motion";
import type { Affinity } from "@relic/core";
import { useGameStore } from "../state/useGameStore";

/**
 * Onboarding is two clicks. Every extra step is time between the player and
 * the thing the project is actually about.
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
  const chooseAffinity = useGameStore((s) => s.chooseAffinity);
  const startFight = useGameStore((s) => s.startFight);

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

        <p className="absolute bottom-8 font-mono text-[10px] uppercase tracking-[0.25em] text-stone-700">
          weapons generated at runtime by meshy-7
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-ash-950">
      <p className="mb-10 text-xs uppercase tracking-[0.4em] text-stone-500">Choose your affinity</p>

      <div className="flex flex-wrap justify-center gap-5">
        {AFFINITIES.map((a, i) => (
          <motion.button
            key={a.id}
            type="button"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.12, duration: 0.6 }}
            onClick={() => {
              chooseAffinity(a.id);
              startFight();
            }}
            className={`w-60 border px-6 py-8 text-left transition ${a.accent}`}
          >
            <div className="text-3xl">{a.glyph}</div>
            <div className="mt-4 font-display text-xl tracking-[0.2em]">{a.name}</div>
            <p className="mt-2 text-[11px] leading-relaxed text-stone-500">{a.blurb}</p>
          </motion.button>
        ))}
      </div>

      <p className="mt-12 max-w-md text-center text-[11px] leading-relaxed text-stone-600">
        Your affinity is only the beginning. How hard you swing, how often you dodge, and how close
        to death you finish all shape the weapon the forge makes for you.
      </p>
    </div>
  );
}
