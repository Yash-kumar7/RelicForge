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

  // Clamped, because a killing blow can overshoot into negative health and a
  // fight nobody landed a hit in would otherwise divide by whatever it liked.
  const cleared = Math.max(
    0,
    Math.min(100, Math.round(((bossMaxHp - bossHp) / Math.max(1, bossMaxHp)) * 100)),
  );

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

        {/*
          How close you got, as the bar that was on screen when you died.

          This was a stat reading "its health left, 1250 / 1250", which is the
          same fact as "damage dealt" next to it said backwards, and it made a
          player do the subtraction to learn the only thing they want to know
          after losing: whether they were close. The bar answers that without
          being read at all, which a pair of numbers cannot.
        */}
        <div className="mx-auto mt-10 w-[22rem] max-w-full">
          <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-widest">
            <span className="text-stone-700">how close you got</span>
            <span className="tabular-nums text-stone-400">{cleared}%</span>
          </div>
          <div className="mt-2 h-[3px] w-full bg-ash-800">
            <div className="h-[3px] bg-stone-500" style={{ width: `${cleared}%` }} />
          </div>
        </div>

        <dl className="mx-auto mt-8 grid max-w-sm grid-cols-2 gap-6 font-mono text-[11px] uppercase tracking-widest">
          <div>
            <dt className="text-stone-700">damage dealt</dt>
            <dd className="mt-1 text-stone-400">{Math.round(telemetry.damageDealt)}</dd>
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
