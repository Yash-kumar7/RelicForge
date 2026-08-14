import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "../state/useGameStore";

/**
 * Onboarding, in one screen.
 *
 * The premise is unusual enough that it has to be stated: most players assume
 * loot is picked from a table, so nothing about the fight signals that *how*
 * they fight is the input. Saying it once, plainly, before the fight is what
 * makes the reveal land later.
 *
 * It also solves a mechanical problem — pointer lock requires a click, and an
 * unexplained dead screen reads as a bug.
 */
export function PreFightBriefing() {
  const phase = useGameStore((s) => s.phase);
  const affinity = useGameStore((s) => s.affinity);
  const [dismissed, setDismissed] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const onLockChange = () => setLocked(Boolean(document.pointerLockElement));
    document.addEventListener("pointerlockchange", onLockChange);
    return () => document.removeEventListener("pointerlockchange", onLockChange);
  }, []);

  // A new fight re-arms the briefing.
  useEffect(() => {
    if (phase === "CHOOSE_AFFINITY" || phase === "TITLE") setDismissed(false);
  }, [phase]);

  const visible = phase === "FIGHTING" && !dismissed && !locked;
  if (!visible) return null;

  const accent = affinity === "ice" ? "text-frost-300" : affinity === "storm" ? "text-amber-200" : "text-ember-300";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={() => setDismissed(true)}
      >
        <div className="max-w-2xl px-8 text-center">
          <p className="text-[11px] uppercase tracking-[0.45em] text-stone-600">Your objective</p>
          <h2 className={`mt-4 font-display text-4xl tracking-[0.12em] ${accent}`}>
            DEFEAT THE ASHEN WARDEN
          </h2>

          <p className="mx-auto mt-6 max-w-lg text-sm leading-relaxed text-stone-400">
            There is no loot table. When the Warden falls, the forge reads{" "}
            <span className="text-stone-200">how you won</span> — how hard you swung, how often you
            dodged, how close to death you finished — and generates a weapon that has never existed
            before.
          </p>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-stone-500">
            Fight recklessly and it comes out brutal and broken. Fight carefully and it comes out
            elegant and pristine. Watch the panel on the left change as you fight.
          </p>

          <dl className="mx-auto mt-10 grid max-w-md grid-cols-2 gap-x-10 gap-y-3 text-left font-mono text-[11px] uppercase tracking-[0.15em]">
            {[
              ["WASD", "move"],
              ["Mouse", "look"],
              ["Left click", "light attack"],
              ["Right click", "heavy attack"],
              ["Space", "dodge · brief invulnerability"],
              ["Q", "heal · 2 charges"],
            ].map(([key, action]) => (
              <div key={key} className="flex justify-between gap-4 border-b border-ash-800 pb-1">
                <dt className="text-stone-300">{key}</dt>
                <dd className="text-stone-600">{action}</dd>
              </div>
            ))}
          </dl>

          <motion.p
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 2.2, repeat: Infinity }}
            className="mt-12 text-xs uppercase tracking-[0.4em] text-stone-400"
          >
            Click anywhere to begin
          </motion.p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
