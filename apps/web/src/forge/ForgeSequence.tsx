import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "../state/useGameStore";
import { STAGE_HEADLINE, forgeLabelFor } from "./forgeCopy";
import { bossAt } from "../game/bosses";
import { themeFor } from "../game/theme";
import { RelicRevealScreen } from "./RelicRevealScreen";

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

/**
 * Sparks, fixed rather than random.
 *
 * Random positions would differ between two recordings of the same forge, and
 * the whole demo is two runs compared side by side.
 */
const SPARKS = [
  { key: 0, left: 38, rise: 90, drift: -14, duration: 1.5, delay: 0 },
  { key: 1, left: 46, rise: 130, drift: 10, duration: 1.9, delay: 0.15 },
  { key: 2, left: 52, rise: 70, drift: 18, duration: 1.3, delay: 0.4 },
  { key: 3, left: 58, rise: 150, drift: -8, duration: 2.1, delay: 0.75 },
  { key: 4, left: 44, rise: 110, drift: 22, duration: 1.7, delay: 1.05 },
  { key: 5, left: 62, rise: 95, drift: -20, duration: 1.6, delay: 1.3 },
] as const;

export function ForgeSequence({
  onClaim,
  onRetry,
  onAbandon,
  onLeave,
}: {
  onClaim: () => void;
  onRetry: () => void;
  onAbandon: () => void;
  /** Walk away and let it finish. Absent when there is nothing to wait for. */
  onLeave: (() => void) | null;
}) {
  const forge = useGameStore((s) => s.forge);
  const telemetry = useGameStore((s) => s.telemetry);
  const playerHp = useGameStore((s) => s.playerHp);
  const affinity = useGameStore((s) => s.affinity);
  const bossLevel = useGameStore((s) => s.bossLevel);
  // Named explicitly: the boss you killed is part of the relic's identity, and
  // it is literally in the prompt that generated it.
  const boss = bossAt(bossLevel ?? 1);

  /* The stages where a mesh is actually being built, and the wait is long. */
  const beingForged = forge.stage === "FORGING_3D" || forge.stage === "MODEL_READY";

  const showTelemetry = forge.stage !== "IDLE" && forge.stage !== "ANALYZING";
  const headline = STAGE_HEADLINE[forge.stage];

  /*
   * A finished relic gets a screen, not a caption.
   *
   * Everything above this point is a progress cinematic laid over the arena,
   * which is right while there is nothing to show yet. The moment there is, the
   * arena stops being a backdrop worth keeping: the weapon rises off a forge
   * eleven metres from the camera, and the reveal was a name in large type in
   * front of a room still lit for a fight.
   */
  if (forge.stage === "COMPLETE" && forge.name && forge.modelUrl && forge.dna) {
    return (
      <RelicRevealScreen
        name={forge.name}
        weaponClass={forge.dna.weaponClass}
        modelUrl={forge.modelUrl}
        bossName={boss.name}
        accent={themeFor(affinity).forge}
        readings={[
          { label: "element", value: forge.dna.element },
          { label: "silhouette", value: forge.dna.temperament },
          { label: "condition", value: forge.dna.condition },
          { label: "health left", value: `${Math.round(playerHp)}%` },
          { label: "final blow", value: telemetry.finishingAttack },
          { label: "dodges", value: `${telemetry.dodges}` },
        ]}
        onClaim={onClaim}
      />
    );
  }

  /**
   * How much of the arena to hide, by stage.
   *
   * The cover was doing nothing at all. It sat at -z-10, which puts it behind
   * the canvas rather than over it, so the arena stayed fully lit through every
   * stage while the code carefully animated an opacity nobody could see. That is
   * the arena visible behind the forging text.
   *
   * It never lifts now, either. It used to thin out at MODEL_READY because the
   * relic rose off the forge inside the scene and the cover would have hidden the
   * payoff. The reveal is its own screen, so there is nothing behind this worth
   * seeing and no reason to leave a dead arena half visible under the type.
   *
   * The first beats are the exception: the boss has just fallen and the forge is
   * igniting, and both of those happen in the scene.
   */
  const cover = forge.stage === "IDLE" || forge.stage === "ANALYZING" ? 0.55 : 1;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-10">
      {/* Over the arena, which is the only place it can cover anything. */}
      <motion.div
        className="absolute inset-0 bg-ash-950"
        animate={{ opacity: cover }}
        transition={{ duration: 1.4, ease: "easeInOut" }}
      />
      {/* Headline */}
      <div className="relative mt-6 h-24 text-center">
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

      {/*
        The candidates, while they are still candidates.

        Hero mode draws three concepts and keeps one, because geometry quality
        follows concept quality and an image is cheap next to a mesh. Until now
        none of that was visible: the screen held a counter over an empty frame
        for the half minute it takes, which is the longest stretch of nothing in
        the game and sits in the middle of its most important moment. The most
        deliberate step in the pipeline read as slow loading.

        Each one appears as it finishes, so the wait shows the work. They are
        held small, dim and side by side — these are drafts, and the moment one
        is chosen it arrives properly, at size, on its own.

        Dropped the instant a concept is settled on, so the two things never
        share the screen and there is no doubt about which one won.
      */}
      <AnimatePresence>
        {forge.stage === "GENERATING_CONCEPT" && forge.conceptCandidates.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.6 }}
            className="flex items-center justify-center gap-4"
          >
            {forge.conceptCandidates.map((url, i) => (
              <motion.img
                key={url}
                src={url}
                alt=""
                aria-hidden
                initial={{ opacity: 0, y: 14, filter: "blur(14px)" }}
                animate={{ opacity: 0.75, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 1.2, delay: i * 0.08, ease: "easeOut" }}
                /* Same treatment as the chosen concept, further down: these
                   arrive on whatever pale ground the image model picked, and a
                   bright square on a black screen is the least interesting
                   thing in the frame. */
                className="h-[20vh] w-auto rounded border border-ember-500/20 brightness-[0.55] contrast-[1.15] [mask-image:radial-gradient(ellipse_78%_78%_at_50%_50%,black_58%,transparent_100%)]"
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

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
            {/*
              Concept art arrives on whatever ground the image model chose, and
              for a weapon that is usually a pale studio backdrop. Dropped onto a
              black screen it reads as a bright square with a sword in it, which
              is the brightest thing in the frame and the least interesting.
              
              Darkened and dimmed at the edges so it sits in the page instead of
              on top of it. The subject survives: it is the lit part of a picture
              lit against a flat ground, so pulling the whole image down takes the
              ground with it and leaves the blade.
            */}
            <img
              src={forge.conceptUrl}
              alt="Relic concept"
              className="max-h-[46vh] rounded border border-ember-500/30 shadow-[0_0_80px_rgba(255,107,26,0.25)] brightness-[0.62] contrast-[1.15] [mask-image:radial-gradient(ellipse_78%_78%_at_50%_50%,black_58%,transparent_100%)]"
            />

            {/*
              Worked, rather than waited on.
              
              The mesh takes 90 to 120 seconds and the concept art sat perfectly
              still for all of it, under a progress bar. A still picture and a
              number is a loading screen; the claim being made is that something
              is being made, and nothing on screen was behaving as though it
              were.
              
              So the drawing is heated. It flares on the same 1.5 second beat the
              hammer plays on, which is the whole trick: the sound already
              existed and there was nothing to see when it landed, so the two
              were describing different events.
            */}
            {beingForged && (
              <>
                <motion.div
                  className="pointer-events-none absolute inset-0 rounded bg-ember-400 mix-blend-overlay"
                  animate={{ opacity: [0.05, 0.42, 0.12, 0.05] }}
                  transition={{ duration: 1.5, repeat: Infinity, times: [0, 0.06, 0.3, 1] }}
                />
                {/* Struck metal throws sparks. Six is enough to read as a shower
                    and few enough to stay out of the way of the drawing. */}
                {SPARKS.map((spark) => (
                  <motion.span
                    key={spark.key}
                    className="pointer-events-none absolute bottom-[18%] h-1 w-1 rounded-full bg-ember-200"
                    style={{ left: `${spark.left}%` }}
                    animate={{
                      y: [0, -spark.rise],
                      x: [0, spark.drift],
                      opacity: [0, 1, 0],
                      scale: [1, 0.4],
                    }}
                    transition={{
                      duration: spark.duration,
                      repeat: Infinity,
                      delay: spark.delay,
                      ease: "easeOut",
                    }}
                  />
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative w-full max-w-3xl">
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
                <span className="text-stone-600">
                  {forge.meshPercent}%
                  <Elapsed />
                </span>
              </div>

              {/*
                Meshy reports 0-10% for most of an image-to-3d run and then
                jumps near the end, so the number genuinely sits still for a
                minute. A bar that is merely stationary reads as a hang, so a
                shimmer runs across it: the percentage stays honest while the
                motion says the work is alive.
              */}
              <div className="relative h-px w-full overflow-hidden bg-ash-700">
                <motion.div
                  className="h-px bg-ember-500"
                  animate={{ width: `${Math.max(2, forge.meshPercent)}%` }}
                  transition={{ ease: "linear", duration: 0.4 }}
                />
                <motion.div
                  className="absolute top-0 h-px w-1/4 bg-gradient-to-r from-transparent via-ember-300 to-transparent"
                  animate={{ left: ["-25%", "100%"] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                />
              </div>

              <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-stone-700">
                meshy-7 usually takes 90 to 120 seconds
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/*
          A way out, once it is clear this will take a while.

          Held back until the mesh stage because everything before it is fast,
          and offering an exit during a two second cache hit would make the
          instant path look like it was about to be slow. From here it is 90 to
          120 seconds, which is too long to hold someone who wants to move on.
        */}
        {onLeave && forge.stage === "FORGING_3D" && (
          <div className="pointer-events-auto mt-6 text-center">
            <button
              type="button"
              onClick={onLeave}
              className="border border-stone-700 px-8 py-2 text-[10px] uppercase tracking-[0.3em] text-stone-500 transition hover:border-stone-500 hover:text-stone-300"
            >
              Leave it forging
            </button>
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-stone-700">
              it keeps working without you
            </p>
          </div>
        )}

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
