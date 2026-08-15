import { motion } from "framer-motion";
import { useGameStore } from "../state/useGameStore";

/**
 * Losing costs you the relic.
 *
 * If a defeat still produced a weapon, the reward would stop being a record of
 * how you fought, which is the only claim the project makes.
 */
export function DefeatScreen() {
  const reset = useGameStore((s) => s.reset);
  const telemetry = useGameStore((s) => s.telemetry);
  const bossHp = useGameStore((s) => s.bossHp);
  /*
   * The boss's real maximum, not the base constant.
   *
   * This divided by a hard-coded 1000 while the ladder scales a boss's health by
   * up to 2.4, so losing to the Drowned Choir reported that it had 125% of
   * itself left. Every rung above the first was wrong, and wrong in the direction
   * that makes the game look broken at the exact moment a player has just lost.
   */
  const bossMaxHp = useGameStore((s) => s.bossMaxHp);
  const bossName = useGameStore((s) => s.boss)().title;

  return (
    /* Nothing to reveal here, so the arena is hidden outright rather than left
       as a distracting backdrop to a failure. */
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-ash-950">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.4 }}
        className="text-center"
      >
        {/* Named, because four of the five bosses are not the Warden. */}
        <h2 className="font-display text-5xl tracking-[0.2em] text-stone-500">
          {bossName.toUpperCase()} STANDS
        </h2>
        <p className="mt-4 text-xs uppercase tracking-[0.3em] text-stone-600">
          No victory, no relic
        </p>

        <dl className="mx-auto mt-10 grid max-w-sm grid-cols-3 gap-6 font-mono text-[11px] uppercase tracking-widest">
          <div>
            <dt className="text-stone-700">damage dealt</dt>
            <dd className="mt-1 text-stone-400">{Math.round(telemetry.damageDealt)}</dd>
          </div>
          <div>
            {/* "Warden left 40%" leaves the player working out what is left of
                what. The health it had when you died is the same number the bar
                above the fight was showing, so it is said the same way. */}
            <dt className="text-stone-700">its health left</dt>
            <dd className="mt-1 text-stone-400">
              {Math.max(0, Math.round(bossHp))} / {Math.round(bossMaxHp)}
            </dd>
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
