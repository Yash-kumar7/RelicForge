import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "../state/useGameStore";
import { STAGE_HEADLINE, forgeLabelFor } from "./forgeCopy";
import { bossAt } from "../game/bosses";

/**
 * The cinematic overlay.
 *
 * Every beat is driven by a named stage from the SSE stream, so what the player
 * sees is always the true state of a real generation, including the concept
 * image, which is a reveal in its own right rather than a loading screen.
 */
/**
 * Seconds since this mounted.
 *
 * Deliberately not the relic's real start time: what matters is that something
 * on screen is moving while a long stage runs, not that the number is a precise
 * measure of anything.
 */
function Elapsed() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return <span className="ml-3 text-stone-700">{seconds}s</span>;
}

export function ForgeSequence({
  onClaim,
  onRetry,
  onAbandon,
}: {
  onClaim: () => void;
  onRetry: () => void;
  onAbandon: () => void;
}) {
  const forge = useGameStore((s) => s.forge);
  const telemetry = useGameStore((s) => s.telemetry);
  const playerHp = useGameStore((s) => s.playerHp);
  const affinity = useGameStore((s) => s.affinity);
  const bossLevel = useGameStore((s) => s.bossLevel);
  // Named explicitly: the boss you killed is part of the relic's identity, and
  // it is literally in the prompt that generated it.
  const boss = bossAt(bossLevel ?? 1);

  const showTelemetry = forge.stage !== "IDLE" && forge.stage !== "ANALYZING";
  const headline = STAGE_HEADLINE[forge.stage];

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between bg-gradient-to-b from-black/70 via-black/30 to-black/80 p-10">
      {/* Headline */}
      <div className="mt-6 h-24 text-center">
        <AnimatePresence mode="wait">
          {headline && (
            <motion.h2
              key={headline}
              initial={{ opacity: 0, y: -12, letterSpacing: "0.5em" }}
              animate={{ opacity: 1, y: 0, letterSpacing: "0.32em" }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className={
                forge.stage === "FAILED"
                  ? "font-display text-3xl text-red-400"
                  : "font-display text-3xl text-ember-300"
              }
            >
              {headline}
            </motion.h2>
          )}
        </AnimatePresence>
      </div>

      {/* Concept reveal, arrives ~10-20s in, long before the mesh. */}
      <AnimatePresence>
        {forge.conceptUrl && forge.stage !== "COMPLETE" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, filter: "blur(12px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            className="relative"
          >
            <img
              src={forge.conceptUrl}
              alt="Relic concept"
              className="max-h-[46vh] rounded border border-ember-500/30 shadow-[0_0_80px_rgba(255,107,26,0.25)]"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full max-w-3xl">
        {/* Telemetry readout, the causal link, stated plainly. */}
        <AnimatePresence>
          {showTelemetry && forge.dna && (
            <motion.dl
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, staggerChildren: 0.08 }}
              className="mx-auto mb-8 grid max-w-xl grid-cols-4 gap-4 font-mono text-[11px] uppercase tracking-widest"
            >
              {[
                ["element", forge.dna.element],
                ["style", forge.dna.temperament],
                ["health", `${Math.round(playerHp)}%`],
                ["final blow", telemetry.finishingAttack],
              ].map(([label, value]) => (
                <div key={label} className="text-center">
                  <dt className="text-stone-600">{label}</dt>
                  <dd
                    className={
                      affinity === "ice" ? "mt-1 text-frost-300" : "mt-1 text-ember-300"
                    }
                  >
                    {value}
                  </dd>
                </div>
              ))}
              {forge.dna.achievement && (
                <div className="col-span-4 text-center">
                  <dd className="mt-2 inline-block border border-ember-500/40 px-3 py-1 text-ember-400">
                    {forge.dna.achievement}
                  </dd>
                </div>
              )}
            </motion.dl>
          )}
        </AnimatePresence>

        {/*
          The concept stage has no percentage to report, so it gets a candidate
          count and an elapsed clock instead. A minute under one motionless
          headline reads as a hang; the same minute with something moving reads
          as work.
        */}
        <AnimatePresence>
          {forge.stage === "GENERATING_CONCEPT" && forge.conceptAttempts > 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mx-auto mb-6 text-center font-mono text-[11px] uppercase tracking-[0.3em] text-stone-500"
            >
              vision {forge.conceptAttempt} of {forge.conceptAttempts}
              <Elapsed />
            </motion.p>
          )}
        </AnimatePresence>

        {/* Forging progress, thematic stages, driven by real task percent. */}
        <AnimatePresence>
          {forge.stage === "FORGING_3D" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mx-auto max-w-md"
            >
              <div className="mb-2 flex justify-between font-mono text-[11px] uppercase tracking-[0.3em] text-ember-400">
                <span>{forgeLabelFor(forge.meshPercent)}…</span>
                <span className="text-stone-600">{forge.meshPercent}%</span>
              </div>
              <div className="h-px w-full bg-ash-700">
                <motion.div
                  className="h-px bg-ember-500"
                  animate={{ width: `${forge.meshPercent}%` }}
                  transition={{ ease: "linear", duration: 0.4 }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Claim */}
        <AnimatePresence>
          {forge.stage === "COMPLETE" && forge.name && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.4 }}
              className="pointer-events-auto text-center"
            >
              <h1 className="font-display text-6xl tracking-[0.14em] text-ember-300 drop-shadow-[0_0_30px_rgba(255,107,26,0.5)]">
                {forge.name.toUpperCase()}
              </h1>
              <p className="mt-3 text-xs uppercase tracking-[0.3em] text-stone-400">
                Legendary {forge.dna?.weaponClass}
              </p>
              <p className="mt-2 text-sm text-stone-500">
                Forged from your victory over {boss.name}
              </p>
              {forge.totalMs !== null && (
                <p className="mt-1 font-mono text-[10px] text-stone-700">
                  {forge.cached ? "cached" : `forged in ${(forge.totalMs / 1000).toFixed(0)}s`}
                </p>
              )}
              <button
                type="button"
                onClick={onClaim}
                className="mt-8 border border-ember-500/60 px-10 py-3 text-xs uppercase tracking-[0.35em] text-ember-300 transition hover:bg-ember-500/10"
              >
                Claim Relic
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {forge.stage === "FAILED" && (
          <div className="pointer-events-auto text-center">
            <p className="text-sm text-stone-500">The forge could not hold the shape.</p>
            <div className="mt-5 flex justify-center gap-3">
              {/* Retry reuses the same relic record, so the DNA and prompt are
                  unchanged and a second attempt is the same weapon, not a
                  different one. */}
              <button
                type="button"
                onClick={onRetry}
                className="border border-ember-500/60 px-8 py-2 text-xs uppercase tracking-[0.3em] text-ember-300 transition hover:bg-ember-500/10"
              >
                Stoke the forge
              </button>
              <button
                type="button"
                onClick={onAbandon}
                className="border border-stone-700 px-8 py-2 text-xs uppercase tracking-[0.3em] text-stone-400 hover:border-stone-500"
              >
                Walk away
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
