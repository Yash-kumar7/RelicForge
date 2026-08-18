import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "../state/useGameStore";
import { bossAt } from "../game/bosses";

/**
 * Three, two, one.
 *
 * The opening camera move shows the room and then gives the view back, and for a
 * moment after that the player is holding a live camera in front of a boss that
 * cannot yet hit them, with nothing saying which of those two facts is about to
 * change. That moment is what a countdown is for: it converts an unannounced start
 * into a start the player is allowed to prepare for.
 *
 * Deliberately not skippable. It is under two seconds, and the whole point is that
 * everyone — including the player who has skipped the flythrough for the tenth time
 * — arrives at the first swing having been told when it begins.
 */

/**
 * Milliseconds per number.
 *
 * A second a number is the convention and it is too slow here, because this count
 * follows a four second camera move rather than a loading screen: by the time the
 * numbers appear the player has already been waiting. Three beats and a FIGHT come
 * in under two seconds at this rate, which keeps the whole opening — flythrough and
 * count together — inside six.
 */
const BEAT = 520;

export function FightCountdown() {
  const countdown = useGameStore((s) => s.countdown);
  const tickCountdown = useGameStore((s) => s.tickCountdown);
  const armCombat = useGameStore((s) => s.armCombat);
  const bossLevel = useGameStore((s) => s.bossLevel);

  useEffect(() => {
    if (countdown === null) return undefined;
    // At zero the fight is on: arming clears the count, which unmounts this.
    if (countdown <= 0) {
      const go = setTimeout(() => armCombat(), BEAT * 0.55);
      return () => clearTimeout(go);
    }
    const next = setTimeout(() => tickCountdown(), BEAT);
    return () => clearTimeout(next);
  }, [countdown, tickCountdown, armCombat]);

  if (countdown === null) return null;

  const boss = bossAt(bossLevel ?? 1);

  return (
    /* Over the arena and under nothing: no dimming panel, because the room was
       just introduced and covering it now would undo that. */
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
      <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.4em] text-stone-500">
        {boss.title}
      </p>

      <AnimatePresence mode="wait">
        <motion.span
          /* Keyed on the number so each one is its own arrival rather than a
             character swap inside a single element. */
          key={countdown}
          initial={{ opacity: 0, scale: 1.55 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.88 }}
          transition={{ duration: 0.34, ease: "easeOut" }}
          className={
            countdown <= 0
              ? "font-display text-7xl tracking-[0.2em] text-ember-300"
              : "font-display text-8xl tabular-nums text-bone-200"
          }
        >
          {countdown <= 0 ? "FIGHT" : countdown}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
