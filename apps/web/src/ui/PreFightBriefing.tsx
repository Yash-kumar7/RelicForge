import { useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "../state/useGameStore";
import { COMBAT, attackSpec } from "../game/combat";
import { combinedTraits } from "../game/equipped";
import { useLoadout } from "../state/useLoadout";
import { bossAt } from "../game/bosses";
import { bossSlug } from "./BossPortrait";

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
  // The champion's strength included. Without it this promised a 60 damage
  // strong attack while an Ember dealt 72 and a Frost 49.
  const traits = combinedTraits(carried?.dna, affinity);
  const light = attackSpec("light", traits);
  const heavy = attackSpec("heavy", traits);

  /*
   * Who is actually in the room.
   *
   * Three sentences of this screen said "the Warden" no matter which of the five
   * bosses was standing outside, so a player who picked the Hollow Sovereign was
   * briefed on a different fight. The name comes from the ladder now.
   */
  const boss = bossAt(bossLevel ?? 1);

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
        className="absolute inset-0 z-10 flex flex-col bg-black/85 backdrop-blur-sm"
        onClick={begin}
      >
        {/*
          The boss, at the size the fight deserves.

          This screen was a 42rem column of centred text with a third of the
          window empty down each side, which is the shape of a form rather than
          the shape of a fight. An intro exists to make the thing you are about
          to fight look worse than anything you have fought, and it cannot do
          that as a name in a paragraph. It stands in the frame now, bleeding off
          the right edge, and the reading sits over its own room on the left.
        */}
        <motion.img
          key={boss.level}
          src={`/assets/bosses/${bossSlug(boss.title)}/concept-cut.png`}
          alt=""
          aria-hidden
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, ease: "easeOut" }}
          /* Faded into the page rather than cut against it, so the figure reads
             as standing in the dark instead of pasted onto it. */
          /* Standing clear of the bottom edge. At bottom-0 the boots ran into
             the control strip, so the figure read as sunk into the frame rather
             than standing in it, and its head sat below the name naming it. */
          className="pointer-events-none absolute bottom-[9svh] right-[-4%] h-[82svh] max-w-[62vw] object-contain object-bottom opacity-45 [mask-image:linear-gradient(to_left,black_58%,transparent)] lg:right-[2%] lg:opacity-70"
        />

        {/* Its own colour, under its own feet. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 46% 40% at 72% 78%, ${boss.accent}22, transparent 70%)`,
          }}
        />

        {/*
          High in the frame rather than centred in it.

          Vertically centred, the reading started a fifth of the way down the
          window and the space above it was doing nothing, while the boss it sat
          beside runs the full height. Starting near the top puts the name level
          with the head and leaves the empty room under the text, where the
          figure's own weight is.
        */}
        <div className="relative flex flex-1 items-start overflow-y-auto pt-[5svh] pb-8">
          <div className="mx-auto w-full max-w-7xl px-8 py-10 lg:px-14">
            <div className="max-w-xl">
              <p className="font-mono text-[10px] uppercase tracking-[0.45em] text-stone-600">
                Your objective
              </p>
              {/*
                The name alone, at size.

                It read "DEFEAT THE ASHEN WARDEN, EMBER-SCARRED" across two
                lines, and the epithet is the part a first-time player cannot
                decode. A fight intro names the thing and lets the word defeat be
                implied by the fact that it is standing there.
              */}
              <h2 className={`mt-3 font-display text-5xl leading-[1.05] tracking-[0.06em] lg:text-6xl ${accent}`}>
                {boss.title.toUpperCase()}
              </h2>
              {/* The one line that says what this fight will do to you. It was
                  on the ladder and then thrown away at the moment it matters. */}
              <p className="mt-4 max-w-md text-sm leading-relaxed text-stone-400">{boss.blurb}</p>

              <p className="mt-6 max-w-md border-l border-brass-800 pl-4 text-[13px] leading-relaxed text-stone-500">
                There is no loot table. When it falls, the forge reads{" "}
                <span className="text-stone-200">how you won</span> and builds a weapon that has
                never existed before.
              </p>

              {/*
                The choice that shapes the weapon, as two lines rather than two
                cards. It is a comparison: one damage figure against the other,
                and one outcome against the other, which a table does and a pair
                of boxes does not.
              */}
              <dl className="mt-7 space-y-2.5">
                {[
                  {
                    key: "left click",
                    name: "quick attack",
                    damage: light.damage,
                    changed: light.damage !== COMBAT.lightAttack.damage,
                    tone: "text-frost-300",
                    rule: "border-frost-500/50",
                    reads: "precise",
                    note: "Ends before it can punish you.",
                  },
                  {
                    key: "right click",
                    name: "strong attack",
                    damage: heavy.damage,
                    changed: heavy.damage !== COMBAT.heavyAttack.damage,
                    tone: "text-ember-300",
                    rule: "border-ember-500/50",
                    reads: "brutal",
                    note: "Staggers it, and commits you for longer.",
                  },
                ].map((attack) => (
                  <div
                    key={attack.key}
                    className={`flex items-baseline gap-4 border-l-2 ${attack.rule} pl-4`}
                  >
                    <dt className="w-24 shrink-0 font-mono text-[10px] uppercase leading-5 tracking-[0.2em] text-stone-500">
                      {attack.key}
                    </dt>
                    <dd className="min-w-0 flex-1">
                      <span className={`font-mono text-base tabular-nums ${attack.tone}`}>
                        {attack.damage} damage
                      </span>
                      {attack.changed && carried && (
                        <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-600">
                          {carried.name}
                        </span>
                      )}
                      <span className="ml-2 text-[12px] text-stone-500">
                        {attack.note} Lean on it and the forge reads you as{" "}
                        <span className={attack.tone}>{attack.reads}</span>.
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>

              {/* The telegraph ring is a mechanic, and an unexplained red circle
                  on the floor reads as a graphical fault rather than a warning. */}
              <p className="mt-6 max-w-md text-[12px] leading-relaxed text-stone-500">
                <span className="text-red-400">A ring on the ground</span> means the blow is
                coming. Everything inside it will be hit, so dodge out or dodge through.
              </p>

              {/*
                Controls in the column, under everything else in it.

                They had a bar of their own across the bottom of the window,
                which is a lot of structure for six keys nobody reads twice, and
                it drew a rule across the boss's legs to hold them. Everything on
                this screen belongs to one column, so they belong in it too, last,
                which is the order they are wanted in.
              */}
              <dl className="mt-7 flex max-w-md flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.18em]">
                {[
                  ["WASD", "move"],
                  ["Mouse", "look"],
                  ["Space", "jump"],
                  // Milliseconds are a tuning value, not something a player
                  // thinks in. What matters is that a dodge avoids the hit.
                  ["Shift", "dodge"],
                  ["Q", "heal · 2 charges"],
                  ["V", "first or third person"],
                ].map(([key, action]) => (
                  <div key={key} className="flex items-baseline gap-2">
                    <dt className="text-stone-400">{key}</dt>
                    <dd className="text-stone-600">{action}</dd>
                  </div>
                ))}
              </dl>

              <motion.p
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2.2, repeat: Infinity }}
                className="mt-8 font-mono text-[10px] uppercase tracking-[0.4em] text-stone-400"
              >
                Click anywhere to begin
              </motion.p>
            </div>
          </div>
        </div>

      </motion.div>
    </AnimatePresence>
  );
}
