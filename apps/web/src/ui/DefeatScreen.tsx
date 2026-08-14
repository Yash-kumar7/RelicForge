import { motion } from "framer-motion";
import { useGameStore } from "../state/useGameStore";

/**
 * Losing costs you the relic.
 *
 * If a defeat still produced a weapon, the reward would stop being a record of
 * how you fought — which is the only claim the project makes.
 */
export function DefeatScreen() {
  const reset = useGameStore((s) => s.reset);
  const telemetry = useGameStore((s) => s.telemetry);
  const bossHp = useGameStore((s) => s.bossHp);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.4 }}
        className="text-center"
      >
        <h2 className="font-display text-5xl tracking-[0.2em] text-stone-500">THE WARDEN STANDS</h2>
        <p className="mt-4 text-xs uppercase tracking-[0.3em] text-stone-600">
          No victory, no relic
        </p>

        <dl className="mx-auto mt-10 grid max-w-sm grid-cols-3 gap-6 font-mono text-[11px] uppercase tracking-widest">
          <div>
            <dt className="text-stone-700">damage dealt</dt>
            <dd className="mt-1 text-stone-400">{Math.round(telemetry.damageDealt)}</dd>
          </div>
          <div>
            <dt className="text-stone-700">warden left</dt>
            <dd className="mt-1 text-stone-400">{Math.round((bossHp / 1000) * 100)}%</dd>
          </div>
          <div>
            <dt className="text-stone-700">dodges</dt>
            <dd className="mt-1 text-stone-400">{telemetry.dodges}</dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={reset}
          className="mt-12 border border-stone-700 px-10 py-3 text-xs uppercase tracking-[0.35em] text-stone-400 transition hover:border-ember-500/60 hover:text-ember-300"
        >
          Try again
        </button>
      </motion.div>
    </div>
  );
}
