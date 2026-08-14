import { useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "../state/useGameStore";
import { COMBAT, attackSpec } from "../game/combat";
import { relicTraits } from "@relic/core";
import { abilityFor } from "../game/abilities";
import { useLoadout } from "../state/useLoadout";
import { bossTitleFor } from "../game/bosses";

/**
 * Onboarding, in one screen.
 *
 * The premise is unusual enough that it has to be stated: most players assume
 * loot is picked from a table, so nothing about the fight signals that *how*
 * they fight is the input. Saying it once, plainly, before the fight is what
 * makes the reveal land later.
 *
 * It also solves a mechanical problem, pointer lock requires a click, and an
 * unexplained dead screen reads as a bug.
 */
export function PreFightBriefing() {
  const phase = useGameStore((s) => s.phase);
  const affinity = useGameStore((s) => s.affinity);
  const combatActive = useGameStore((s) => s.combatActive);
  const bossLevel = useGameStore((s) => s.bossLevel);
  const fightStartedAt = useGameStore((s) => s.fightStartedAt);
  const armCombat = useGameStore((s) => s.armCombat);

  /*
   * The numbers the player is actually about to swing.
   *
   * The briefing used to quote the base constants, which stopped being true the
   * moment a relic changed them: it promised 60 and delivered 78. A briefing
   * that misreports the fight is worse than no briefing, because the player
   * calibrates against it.
   */
  const carried = useLoadout((s) => s.equipped());
  const ability = abilityFor(affinity);
  const traits = relicTraits(carried?.dna);
  const light = attackSpec("light", traits);
  const heavy = attackSpec("heavy", traits);

  /**
   * One click does both jobs: it starts the fight and takes pointer lock.
   * Splitting them would mean the player clicks to dismiss, then clicks again
   * to look around, with a silent frozen frame in between.
   */
  const begin = useCallback(() => {
    const canvas = document.querySelector("canvas");
    if (canvas) void canvas.requestPointerLock();
    armCombat();
  }, [armCombat]);

  // Enter works too, so the keyboard hand does not have to move.
  useEffect(() => {
    if (phase !== "FIGHTING" || combatActive || fightStartedAt !== null) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Enter" || e.code === "Space") begin();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, combatActive, fightStartedAt, begin]);

  // Visible for exactly as long as the fight is frozen, so what is on screen
  // always matches whether the boss can actually hurt you.
  // fightStartedAt distinguishes "not begun yet" from "paused mid-fight",
  // which the PauseOverlay owns.
  if (phase !== "FIGHTING" || combatActive || fightStartedAt !== null) return null;

  const accent = affinity === "ice" ? "text-frost-300" : affinity === "storm" ? "text-amber-200" : "text-ember-300";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={begin}
      >
        <div className="max-w-2xl px-8 text-center">
          <p className="text-[11px] uppercase tracking-[0.45em] text-stone-600">Your objective</p>
          <h2 className={`mt-4 font-display text-4xl tracking-[0.12em] ${accent}`}>
            DEFEAT {bossTitleFor(bossLevel ?? 1, affinity).toUpperCase()}
          </h2>

          <p className="mx-auto mt-6 max-w-lg text-sm leading-relaxed text-stone-400">
            There is no loot table. When the Warden falls, the forge reads{" "}
            <span className="text-stone-200">how you won</span>, how hard you swung, how often you
            dodged, how close to death you finished, and generates a weapon that has never existed
            before.
          </p>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-stone-500">
            Fight recklessly and it comes out brutal and broken. Fight carefully and it comes out
            elegant and pristine. Watch the panel on the left change as you fight.
          </p>

          {/* The telegraph ring is a mechanic, and an unexplained red circle on
              the floor reads as a graphical fault rather than a warning. */}
          <p className="mx-auto mt-8 max-w-lg border border-red-500/30 px-4 py-3 text-[11px] leading-relaxed text-stone-400">
            <span className="text-red-400">A ring on the ground</span> means the Warden is winding
            up. It grows as the blow gets closer, and everything inside it will be hit. Dodge out,
            or dodge through.
          </p>

          {/*
            The two attacks are the largest single input into the relic, and the
            plain control list never said what separated them or what choosing
            one did. A player who does not know that heavy swings produce a
            brutal weapon cannot make the choice the game is asking them to make.
          */}
          {/*
            The champion's move, named and explained.
            Stats on the setup screen tell a player which champion is stronger;
            this is the line that tells them what their champion actually does,
            and it is the only control they have not seen in another game.
          */}
          <div className="mx-auto mt-6 max-w-lg border border-stone-700/60 px-4 py-3 text-left">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-stone-500">
              e · {ability.name}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-stone-500">{ability.blurb}</p>
          </div>

          <div className="mx-auto mt-4 grid max-w-lg gap-3 sm:grid-cols-2">
            <div className="border border-frost-500/40 px-4 py-3 text-left">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-frost-400">
                left click · your quick swing
              </p>
              <p className="mt-1 font-mono text-lg tabular-nums text-stone-200">
                {light.damage} dmg
                {light.damage !== COMBAT.lightAttack.damage && (
                  <span className="ml-2 text-[11px] text-frost-400">
                    {carried?.name}
                  </span>
                )}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
                Fast and safe to throw. Favour it while dodging and the forge reads
                you as <span className="text-frost-300">elegant</span>: a narrow, precise
                weapon.
              </p>
            </div>

            <div className="border border-ember-500/40 px-4 py-3 text-left">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ember-400">
                right click · your strong swing
              </p>
              <p className="mt-1 font-mono text-lg tabular-nums text-stone-200">
                {heavy.damage} dmg
                {heavy.damage !== COMBAT.heavyAttack.damage && (
                  <span className="ml-2 text-[11px] text-ember-400">
                    {carried?.name}
                  </span>
                )}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
                Slow to start and it staggers the Warden. Lean on it and the forge
                reads you as <span className="text-ember-300">brutal</span>: an oversized,
                heavy weapon.
              </p>
            </div>
          </div>

          <dl className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-x-10 gap-y-3 text-left font-mono text-[11px] uppercase tracking-[0.15em]">
            {[
              ["WASD", "move"],
              ["Mouse", "look"],
              ["Space", "jump"],
              // Milliseconds are a tuning value, not something a player thinks
              // in. What matters is that a well-timed dodge avoids the hit.
              ["Shift", "dodge · slip through the blow"],
              ["Q", "heal · 2 charges"],
              ["V", "first or third person"],
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
