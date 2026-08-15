import { useState } from "react";
import { motion } from "framer-motion";
import type { Affinity } from "@relic/core";
import { championFor, describeChampion } from "../game/champions";
import { useGameStore } from "../state/useGameStore";
import { useLoadout } from "../state/useLoadout";
import { BOSSES, highestCleared, isCleared } from "../game/bosses";
import { TitleShowcase } from "./TitleShowcase";
import { ChampionPreview } from "./ChampionPreview";
import { TitleBackdrop } from "./TitleBackdrop";
import { BossPortrait } from "./BossPortrait";
import { BossPreview } from "./BossPreview";
import { ArmamentPanel } from "./ArmamentPanel";
import { rankFor } from "../state/useProgress";
import { useProgress } from "../state/useProgress";

/**
 * Run setup: what you fight as, then what you fight.
 *
 * There is no separate difficulty selector. The ladder already scales the
 * fight, and unlike a difficulty slider each rung changes bossInfluence, so a
 * harder boss forges a materially different weapon rather than the same weapon
 * behind bigger numbers.
 *
 * Kept to one screen. Every extra step is time between the player and the only
 * thing this project is actually about.
 */

/**
 * Every section heading on the setup screen, defined once.
 *
 * The champion heading sat a few pixels below the affinity heading because it
 * shares its row with the rank line, and a taller sibling dragged the shared
 * baseline down. Two columns that are meant to start on the same line must not
 * derive their height from whatever happens to be inside them.
 */
const SECTION_HEADING = "flex h-4 items-baseline text-[11px] uppercase leading-4 tracking-[0.4em] text-stone-600";

/** Character select, then loadout, then stage select. */
const STEPS = ["Element", "Weapon", "Enemy"] as const;

const AFFINITIES: { id: Affinity; glyph: string; name: string; blurb: string; accent: string }[] = [
  {
    id: "fire",
    glyph: "🔥",
    name: "Ember",
    blurb: "Aggressive. Heavy swings, molten steel.",
    accent: "border-ember-500/60 text-ember-300 hover:bg-ember-500/10",
  },
  {
    id: "ice",
    glyph: "❄️",
    name: "Frost",
    blurb: "Defensive. Precise strikes, crystalline edges.",
    accent: "border-frost-500/60 text-frost-300 hover:bg-frost-500/10",
  },
  {
    id: "storm",
    glyph: "⚡",
    name: "Storm",
    blurb: "Fast. Balanced pressure, fractured alloy.",
    accent: "border-amber-400/50 text-amber-200 hover:bg-amber-400/10",
  },
];

export function TitleScreen() {
  const phase = useGameStore((s) => s.phase);
  const setPhase = useGameStore((s) => s.setPhase);
  const [step, setStep] = useState(0);
  const affinity = useGameStore((s) => s.affinity);
  const bossLevel = useGameStore((s) => s.bossLevel);
  const chooseAffinity = useGameStore((s) => s.chooseAffinity);
  const chooseBossLevel = useGameStore((s) => s.chooseBossLevel);
  const startFight = useGameStore((s) => s.startFight);
  const owned = useLoadout((s) => s.owned);
  const armament = useLoadout((s) => s.armament);
  const xp = useProgress((s) => s.xp);
  const fightsWon = useProgress((s) => s.fightsWon);
  const rank = rankFor(xp);

  if (phase === "TITLE") {
    return (
      <div className="relative flex h-full flex-col items-center overflow-y-auto bg-ash-950 py-12">
        {/* Always-on motion. The showcase below needs relics to exist; the very
            first thing a visitor sees cannot be a static page waiting on a
            fetch. */}
        <TitleBackdrop />

        <div className="relative flex w-full flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2 }}
          className="text-center"
        >
          <h1 className="font-display text-7xl tracking-[0.18em] text-ember-400 drop-shadow-[0_0_40px_rgba(255,107,26,0.35)]">
            RELICFORGE
          </h1>
          <p className="mt-4 text-xs uppercase tracking-[0.45em] text-stone-500">
            Every legendary is actually legendary
          </p>
        </motion.div>

        {/* A real generated relic, spinning, loaded from the same cache the
            game uses. The page argues that generated 3D belongs in a runtime,
            so the page should be running some. */}
        <TitleShowcase />

        {/*
          The premise has to be stated on the front page. Players arrive with a
          lifetime of loot tables behind them and will assume the weapon was
          picked from a list, which is the one thing this game does not do.
        */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 1 }}
          className="mt-6 max-w-2xl px-8 text-center"
        >
          <p className="text-sm leading-relaxed text-stone-400">
            Most games hand you loot from a list. Kill the boss, roll the table, receive the same
            sword eleven million other players received.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-stone-400">
            Here the weapon does not exist until you earn it. When the boss falls, the forge reads
            how you fought and generates a new 3D weapon in real time, then puts it in your hands.
          </p>

          <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
            {[
              ["1 · Fight", "Swing hard, dodge, survive. Everything you do is recorded."],
              ["2 · Forge", "Your fight becomes a design, then a real 3D model, generated while you wait. About two minutes."],
              ["3 · Wield", "Claim it and carry it. Nobody else will ever have that weapon."],
            ].map(([title, body]) => (
              <div key={title} className="border border-ash-800 px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ember-400">
                  {title}
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-stone-500">{body}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-[11px] leading-relaxed text-stone-600">
            Fight recklessly and it comes out brutal and cracked. Fight carefully and it comes out
            elegant and flawless. Two players can beat the same boss and walk away holding
            completely different weapons.
          </p>
        </motion.div>

        <motion.button
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 1 }}
          onClick={() => setPhase("CHOOSE_AFFINITY")}
          className="mt-10 border border-ember-500/50 px-12 py-3 text-xs uppercase tracking-[0.4em] text-ember-300 transition hover:bg-ember-500/10"
        >
          Enter the Arena
        </motion.button>

        {(owned.length > 0 || fightsWon > 0) && (
          <div className="mt-8 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ember-400">
              {rank.name}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-stone-600">
              {xp} xp · {owned.length} relic{owned.length === 1 ? "" : "s"} kept ·{" "}
              {highestCleared()} boss{highestCleared() === 1 ? "" : "es"} cleared
            </p>
          </div>
        )}

        <p className="mt-12 font-mono text-[10px] uppercase tracking-[0.25em] text-stone-700">
          weapons forged live by meshy-7 from your fight · bosses and champions
          pre-generated with meshy-7
        </p>
        </div>
      </div>
    );
  }

  /**
   * Setup is two columns: the champion holds the left half at full height, and
   * every decision sits on the right. Stacking them vertically made the
   * champion a banner you scrolled past, when it is the thing that answers
   * "who am I" and deserves the space.
   */
  return (
    <div className="h-full overflow-y-auto bg-ash-950 px-6 py-8">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2">
        {/* Left: the champion, as large as the viewport allows. */}
        {/*
          Deliberately not sticky.
          Pinning this column kept the champion on screen while scrolling, but a
          stuck element sits at its own offset from the viewport rather than in
          flow, so the heading drifted below "Choose your affinity" the moment
          the page moved at all. Two headings that are meant to share a line
          cannot have one of them positioned against the viewport.
        */}
        <div className="lg:self-start">
          <div className={`${SECTION_HEADING} mb-2 justify-between`}>
            {/*
              Named for the step it belongs to. On the enemy step the champion
              is no longer the thing being decided, it is who you are sending,
              and saying so keeps the left column from looking like a leftover.
            */}
            <p>{step === 2 ? "Sending" : "Your champion"}</p>
            <p className="font-mono text-[10px] leading-4 tracking-[0.25em] text-stone-700">
              {rank.name} · {xp} xp
            </p>
          </div>
          <ChampionPreview affinity={affinity} />
        </div>

        {/* Right: element, then weapon, then who you fight, then descend. */}
        <div className="flex flex-col">
          {/*
            One decision at a time.

            Everything used to sit on one scrolling page, which made every choice
            look equally available and gave a first-time player nowhere obvious
            to start. Character select, then loadout, then stage select is the
            order almost every action game uses, and for the same reason.

            Steps rather than routes: the champion stays on screen throughout, so
            picking a weapon shows it in their hand and picking an enemy is done
            while still looking at who is going to fight it. Separate pages would
            have thrown that away and added a back button to get it back.
          */}
          <ol className="mb-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]">
            {STEPS.map((label, index) => {
              const reached = index <= step;
              return (
                <li key={label} className="flex items-center gap-2">
                  <button
                    type="button"
                    // Only backwards. Skipping ahead would let a player reach the
                    // enemy list without a weapon, which the descend button then
                    // has to refuse, and a step you can enter but not complete is
                    // worse than one you cannot enter.
                    disabled={index > step}
                    onClick={() => setStep(index)}
                    className={
                      reached
                        ? "text-ember-300 transition hover:text-ember-200"
                        : "cursor-not-allowed text-stone-700"
                    }
                  >
                    {index + 1}. {label}
                  </button>
                  {index < STEPS.length - 1 && <span className="text-stone-800">/</span>}
                </li>
              );
            })}
          </ol>

          {step === 0 && (
          <section>
            {/*
              Affinity is the field name and the fiction, but on a first-run
              screen it explains nothing. The choice is an element, so it says
              element, and the cards carry the flavour instead.
            */}
            <p className={`${SECTION_HEADING} mb-2`}>Choose your element</p>
            {/*
              Stated once rather than repeated in all three cards.
              Without it the champion's damage and the armament panel's damage
              are two different numbers for the same swing, and nothing on
              screen explains which one the fight will actually use.
            */}
            <p className="mt-2 text-[10px] leading-relaxed text-stone-600">
              Your element decides who you are and what your weapon is made of.
              Damage comes from the weapon, shown below.
            </p>
            {/*
              Full-width rows rather than three columns.

              Three narrow cards were a compromise with a page that had to hold
              every decision at once. A step that asks one question has the width
              to spare, and a row reads left to right, identity then trade then
              numbers, instead of forcing three columns of wrapped text to be
              compared vertically.
            */}
            <div className="mt-4 flex flex-col gap-3">
              {AFFINITIES.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  /*
                    Selecting does not advance.

                    It did, on the reasoning that picking is the only thing this
                    step asks for. That was wrong: it made the first click final,
                    so a player could not try Frost after Ember, or read the
                    third card at all. The champion beside these cards changes
                    with the selection, which is the entire reason to sit on this
                    step and compare.
                  */
                  onClick={() => chooseAffinity(a.id)}
                  className={[
                    "flex items-start gap-5 border px-5 py-4 text-left transition",
                    affinity === a.id
                      ? a.accent
                      : "border-ash-700 text-stone-500 hover:border-stone-500",
                  ].join(" ")}
                >
                  <span className="min-w-0 flex-1">
                  <div className="flex h-7 items-center gap-2">
                    {/*
                      Fixed box. The three glyphs are emoji with different
                      intrinsic heights, and the fire one is the tallest, so a
                      row sized by its content made the Ember card start lower
                      than the other two.
                    */}
                    <span className="flex h-7 w-6 items-center justify-center text-xl leading-none">
                      {a.glyph}
                    </span>
                    <span className="font-display text-base leading-none tracking-[0.15em]">
                      {a.name}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-stone-600">{a.blurb}</p>

                  {/*
                    The trade, stated before the choice is made.
                    The three champions used to look different and play
                    identically, which made the first decision in the game a
                    cosmetic one wearing the clothes of a real one.
                  */}
                  <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
                    {championFor(a.id).blurb}
                  </p>
                  </span>

                  {/*
                    Stats to the side, so the three sets line up in a column and
                    can be read against each other without moving your eye across
                    a paragraph to reach the next number.
                  */}
                  <dl className="w-32 shrink-0 space-y-1 font-mono text-[9px] uppercase tracking-[0.12em]">
                    {describeChampion(championFor(a.id)).map((stat) => (
                      <div key={stat.label} className="flex justify-between gap-2">
                        <dt className="text-stone-700">{stat.label}</dt>
                        <dd className="tabular-nums text-stone-300">{stat.value}</dd>
                      </div>
                    ))}
                  </dl>
                </button>
              ))}
            </div>
          </section>
          )}

          {step === 1 && (
          <div className="mt-8">
            <ArmamentPanel />
          </div>

          )}

          {step === 2 && (
          <section className="mt-8">
            {/*
              "Quarry" is a hunting word most players will not have met, and it
              was doing no work that "who you fight" does not do better.
            */}
            <p className={`${SECTION_HEADING} mb-2`}>Choose who you fight</p>
            <p className="mt-2 text-[11px] leading-relaxed text-stone-600">
              Each one forges a different kind of weapon. What you kill becomes part of what you
              carry.
            </p>

            <div className="mt-4 flex flex-col gap-2">
              {BOSSES.map((boss) => {
                const cleared = isCleared(boss.level);
                const selected = bossLevel === boss.level;
                return (
                  <button
                    key={boss.level}
                    type="button"
                    onClick={() => chooseBossLevel(boss.level)}
                    className={[
                      "border text-left transition",
                      selected
                        ? "border-ember-500/70 bg-ember-500/5 text-stone-200"
                        : "border-ash-700 text-stone-500 hover:border-stone-500",
                    ].join(" ")}
                  >
                    {/*
                      Selecting a boss expands the row into a proper portrait.
                      A 64px thumbnail is enough to tell rows apart but not
                      enough to decide by, and deciding is the whole purpose of
                      this screen.
                    */}
                    {selected && (
                      <BossPreview
                        level={boss.level}
                        title={boss.title}
                        accent={boss.accent}
                        className="h-72 w-full border-b border-ember-500/30 bg-ash-950"
                      />
                    )}

                    <span className="flex items-start gap-4 px-4 py-3">
                      {!selected && (
                        <BossPortrait
                          title={boss.title}
                          locked={false}
                          className="h-20 w-16 shrink-0 border border-ash-800"
                        />
                      )}
                      <span className="mt-0.5 w-7 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em]">
                        {boss.level.toString().padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-base tracking-[0.1em]">
                          {boss.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-600">
                          {boss.blurb}
                        </span>
                      </span>
                      {cleared && (
                        <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-600">
                          cleared
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
          )}


          <div className="mt-8 border-t border-ash-800 pt-5">
            {step < 2 && (
              <button
                type="button"
                disabled={step === 1 && armament === null}
                onClick={() => setStep(step + 1)}
                className={[
                  "mb-4 w-full border px-10 py-3 text-xs uppercase tracking-[0.35em] transition",
                  step === 1 && armament === null
                    ? "cursor-not-allowed border-ash-800 text-stone-700"
                    : "border-stone-600 text-stone-300 hover:border-stone-400",
                ].join(" ")}
              >
                {step === 1 && armament === null ? "Choose your weapon" : "Continue"}
              </button>
            )}
            {/*
              Only above Descend.

              It describes the fight, so on the element and weapon steps it was
              answering a question nobody had asked yet. Here it is the last
              thing read before the fight starts, which is when it means
              something.
            */}
            {step === 2 && (
              <p className="text-[11px] leading-relaxed text-stone-600">
                How hard you swing, how often you dodge, and how close to death you finish all
                shape the weapon the forge makes for you.
              </p>
            )}
            <button
              type="button"
              onClick={startFight}
              disabled={bossLevel === null || armament === null}
              className={[
                "mt-4 w-full border px-10 py-3 text-xs uppercase tracking-[0.35em] transition",
                bossLevel === null || armament === null
                  ? "cursor-not-allowed border-ash-800 text-stone-700"
                  : "border-ember-500/60 text-ember-300 hover:bg-ember-500/10",
              ].join(" ")}
            >
              {/*
                The button says what is still missing, in the same words the
                sections above use. It said "armament" and "quarry", which are
                the state field names and the two words already removed from
                every heading on this screen.
              */}
              {armament === null
                ? "Choose your weapon"
                : bossLevel === null
                  ? "Choose who you fight"
                  : "Descend"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
