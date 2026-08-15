import { motion } from "framer-motion";
import { useGameStore } from "../state/useGameStore";
import { bossSlug } from "./BossPortrait";

/**
 * Losing costs you the relic.
 *
 * If a defeat still produced a weapon, the reward would stop being a record of
 * how you fought, which is the only claim the project makes.
 *
 * It is also the one screen the player did not want to reach, so it has to be
 * worth reaching. This was a 22rem column of small type in the middle of a black
 * page, which reads as an error dialog: the fight ended and the game had nothing
 * to say about it. A defeat screen shows you the thing that beat you, standing
 * where you left it.
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
  const boss = useGameStore((s) => s.boss)();

  // Clamped, because a killing blow can overshoot into negative health and a
  // fight nobody landed a hit in would otherwise divide by whatever it liked.
  const cleared = Math.max(
    0,
    Math.min(100, Math.round(((bossMaxHp - bossHp) / Math.max(1, bossMaxHp)) * 100)),
  );

  return (
    /* Nothing to reveal here, so the arena is hidden outright rather than left
       as a distracting backdrop to a failure. */
    <div className="absolute inset-0 overflow-hidden bg-ash-950">
      {/*
        The boss, still standing, which is the whole message.

        Held at low opacity and behind everything: it is the subject of the
        screen but not the thing to be read, and a figure at full strength would
        fight the one line of type that matters.
      */}
      <motion.img
        src={`/assets/bosses/${bossSlug(boss.title)}/concept-cut.png`}
        alt=""
        aria-hidden
        initial={{ opacity: 0, scale: 1.08 }}
        animate={{ opacity: 0.4, scale: 1 }}
        transition={{ duration: 2.4, ease: "easeOut" }}
        className="pointer-events-none absolute bottom-0 left-1/2 h-[86svh] -translate-x-1/2 object-contain object-bottom [mask-image:linear-gradient(to_top,transparent,black_28%)]"
      />

      {/* Its own colour, under its own feet, the way the arena lit it. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 44% 38% at 50% 88%, ${boss.accent}1f, transparent 70%)`,
        }}
      />

      <div className="relative flex h-full flex-col items-center justify-end pb-[9svh]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.4 }}
          className="w-full max-w-2xl px-8 text-center"
        >
          {/* Named, because four of the five bosses are not the Warden. */}
          <h2 className="font-display text-5xl tracking-[0.16em] text-stone-400 lg:text-6xl">
            {boss.title.toUpperCase()} STANDS
          </h2>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.35em] text-stone-600">
            No victory, no relic
          </p>

          {/*
            How close you got, as the bar that was on screen when you died.

            This was a stat reading "its health left, 1250 / 1250", the same fact
            as the damage beside it said backwards, and it made a player do the
            subtraction to learn the only thing anyone wants to know after
            losing: whether they were close. The bar answers that without being
            read at all, which a pair of numbers cannot.
          */}
          <div className="mx-auto mt-10 w-[26rem] max-w-full">
            <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-widest">
              <span className="text-stone-700">how close you got</span>
              <span className="tabular-nums text-stone-400">{cleared}%</span>
            </div>
            <div className="mt-2 h-[3px] w-full bg-ash-800">
              <motion.div
                className="h-[3px]"
                style={{ background: boss.accent }}
                initial={{ width: 0 }}
                animate={{ width: `${cleared}%` }}
                transition={{ duration: 1.1, delay: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>

          <dl className="mx-auto mt-7 flex max-w-md items-baseline justify-center gap-12 font-mono text-[11px] uppercase tracking-widest">
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
            className="mt-10 border border-stone-700 px-10 py-3 text-xs uppercase tracking-[0.35em] text-stone-400 transition hover:border-ember-500/60 hover:text-ember-300"
          >
            Try again
          </button>
        </motion.div>
      </div>
    </div>
  );
}
