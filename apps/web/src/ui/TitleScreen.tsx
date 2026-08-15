import { useEffect, useState } from "react";
import type { Affinity } from "@relic/core";
import { championFor, championStats } from "../game/champions";
import { useGameStore } from "../state/useGameStore";
import { IRON, useLoadout } from "../state/useLoadout";
import { BOSSES, bossAt, describeBoss, isCleared } from "../game/bosses";
import { ChampionPreview } from "./ChampionPreview";
import { TitleBackdrop } from "./TitleBackdrop";
import { BossPortrait } from "./BossPortrait";
import { BossPreview } from "./BossPreview";
import { ArmamentPanel } from "./ArmamentPanel";
import { ChampionSelect } from "./ChampionSelect";
import { PendingForgePanel } from "./PendingForgePanel";
import { SpecimenPlate } from "./SpecimenPlate";
import { TitleHero } from "./TitleHero";
import { HowItWorks } from "./HowItWorks";
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
const ALL_STEPS = ["Element", "Weapon", "Enemy"] as const;

const AFFINITIES: {
  id: Affinity;
  name: string;
  blurb: string;
  accent: string;
  /** A rule in the element's colour, replacing the emoji glyph. */
  bar: string;
}[] = [
  {
    id: "fire",
    bar: "bg-ember-500",
    name: "Ember",
    blurb: "Aggressive. Heavy swings, molten steel.",
    accent: "border-ember-500/60 text-ember-300 hover:bg-ember-500/10",
  },
  {
    id: "ice",
    bar: "bg-frost-500",
    name: "Frost",
    blurb: "Defensive. Precise strikes, crystalline edges.",
    accent: "border-frost-500/60 text-frost-300 hover:bg-frost-500/10",
  },
  {
    id: "storm",
    bar: "bg-amber-400",
    name: "Storm",
    blurb: "Fast. Balanced pressure, fractured alloy.",
    accent: "border-amber-400/50 text-amber-200 hover:bg-amber-400/10",
  },
];

export function TitleScreen() {
  const phase = useGameStore((s) => s.phase);
  const setPhase = useGameStore((s) => s.setPhase);
  const [step, setStep] = useState(0);
  const owned = useLoadout((s) => s.owned);
  const selectArmament = useLoadout((s) => s.select);

  /*
   * All three steps, always.
   *
   * The weapon step was briefly hidden for a player who owns nothing, on the
   * grounds that one option is not a choice. That was wrong for two reasons: it
   * takes away the only screen that says what you are carrying into the fight,
   * and it hides the empty relic slot, which is the thing that makes forging one
   * feel like the point rather than a feature you have not found.
   *
   * The iron sword is in hand from the start instead, so the step is somewhere
   * to look rather than something to get past.
   */
  const steps = ALL_STEPS;
  const section = step;

  useEffect(() => {
    // Only as a starting position. Selecting a relic later replaces it.
    if (owned.length === 0) selectArmament(IRON);
  }, [owned.length, selectArmament]);
  const affinity = useGameStore((s) => s.affinity);
  const bossLevel = useGameStore((s) => s.bossLevel);
  const chooseAffinity = useGameStore((s) => s.chooseAffinity);
  const chooseBossLevel = useGameStore((s) => s.chooseBossLevel);
  const startFight = useGameStore((s) => s.startFight);
  const armament = useLoadout((s) => s.armament);
  const xp = useProgress((s) => s.xp);
  const rank = rankFor(xp);

  if (phase === "TITLE") {
    /*
     * The landing page is a plate, not a splash.
     *
     * It used to stack a title, a spinning relic, two paragraphs and three
     * cards, all arriving together, so nothing was dominant and the object
     * doing the arguing read as decoration beside the text describing it.
     *
     * Now the hero is one thing: the relic, annotated with the fight that made
     * it. Everything explanatory moved below the fold, where someone who wants
     * it can scroll and someone who wants to play can press one button.
     */
    return (
      <div className="relative h-full overflow-y-auto bg-[#070605]">
        <div className="relative flex flex-col items-center">
          {/*
            Embers belong to the hero and stop at its edge.

            They used to drift behind the whole page, so every paragraph further
            down was read over moving specks. Ambient motion is atmosphere behind
            a title and noise behind body text, and the difference is only where
            it is allowed to be.
          */}
          <div className="relative w-full">
            <TitleBackdrop />
            <TitleHero onEnter={() => setPhase("CHOOSE_AFFINITY")} />
          </div>

          {/* The evidence, for anyone who scrolled to ask how. */}
          <SpecimenPlate />

          {/* Solid ground under everything that has to be read. */}
          <div className="relative z-10 w-full bg-ash-950">
            {/*
              The pipeline, shown rather than described.

              This was two paragraphs and three cards, which asks a reader to
              take on trust the one thing they have every reason to doubt. The
              walkthrough runs a single real relic through all four steps using
              its own data, so the claim is demonstrated by the thing it is a
              claim about.
            */}
            {/*
              The premise, stated once and large.

              This was two small paragraphs among cards, and it is the only
              thing on the page that frames everything after it: players arrive
              with a lifetime of loot tables behind them and will assume the
              weapon was picked from a list, which is the one thing this game
              does not do. Said at reading size, before the walkthrough, it is
              the question the four steps then answer.
            */}
            <section className="mx-auto w-full max-w-6xl px-8 py-24">
              <p className="max-w-4xl font-display text-[clamp(1.5rem,3.2vw,2.6rem)] leading-[1.35] tracking-[0.02em] text-bone-200">
                Most games hand you loot from a list. Kill the boss, roll the table, receive the
                same sword eleven million other players received.
              </p>
              <p className="mt-8 max-w-2xl text-[15px] leading-relaxed text-bone-400">
                Here the weapon does not exist until you earn it. When the boss falls, the forge
                reads how you fought and generates a new 3D weapon, then puts it in your hands.
              </p>
            </section>

            <HowItWorks />

            {/* The evidence, for anyone who wants the detail. */}
            <SpecimenPlate />
          </div>
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
    /*
      Room above the content.

      py-8 put the champion heading and the step list hard against the top edge
      of the viewport, which reads as the page having been cut off rather than
      laid out. The extra height is affordable now that a step shows one section
      instead of three stacked ones.
    */
    <div className="h-full overflow-y-auto bg-ash-950 px-6 pb-10 pt-14">
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
            <p>{section === 2 ? "Your enemy" : "Your champion"}</p>
            <p className="font-mono text-[10px] leading-4 tracking-[0.25em] text-stone-700">
              {/*
                Labelled, because unlabelled it reads as the champion's name.
                It sits beside "Your champion" in the same small mono type, so
                "Ashbearer" looked like an answer to that heading rather than a
                rank the player has climbed to.
              */}
              rank {rank.name} · {xp} xp
            </p>
          </div>
          {/*
            The enemy takes the stage on the enemy step.

            Stage select shows the stage. Keeping the champion here left the
            thing being chosen as a row in a list while the thing already chosen
            held the large view, and the boss is what the player is deciding
            about.

            Falls back to the champion until one is picked, because an empty
            frame says less than the character who is about to walk into it.
          */}
          {section === 2 && bossLevel !== null ? (
            <BossPreview
              level={bossLevel}
              title={bossAt(bossLevel).title}
              accent={bossAt(bossLevel).accent}
              /* Same frame the champion gets. The two views sit in the same
                 place on consecutive steps, so a smaller one reads as the enemy
                 mattering less than the character choosing to fight it. */
              className="h-[calc(100vh-9rem)] max-h-[46rem] min-h-[26rem] w-full"
            />
          ) : (
            <ChampionPreview affinity={affinity} armed={section > 0} />
          )}
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
          {/*
            Above the steps, because a relic still being forged is news and the
            steps are a routine. It also has to be reachable from every step,
            since the player may have left mid-forge and come back to any of
            them.
          */}
          <PendingForgePanel />

          <ol className="mb-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]">
            {steps.map((label, index) => {
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
                  {index < steps.length - 1 && <span className="text-stone-800">/</span>}
                </li>
              );
            })}
          </ol>

          {section === 0 && (
            <ChampionSelect affinities={AFFINITIES} affinity={affinity} onChoose={chooseAffinity} />
          )}

          {section === 1 && (
          <div>
            <ArmamentPanel />
          </div>

          )}

          {section === 2 && (
          <section>
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
                    {/*
                      No inline preview any more. Selecting a boss used to expand
                      its row into a full 3D view, which put two WebGL contexts on
                      one screen and made the list jump under the cursor. The
                      large view lives on the left now, and every row keeps its
                      portrait so the list stays scannable.
                    */}
                    <span className="flex items-start gap-4 px-4 py-3">
                      <BossPortrait
                        title={boss.title}
                        locked={false}
                        className="h-20 w-16 shrink-0 border border-ash-800"
                      />
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
                      {/*
                        Stats on the row, in the same shape the element cards
                        use. Picking a champion is choosing how to play; picking
                        a boss is choosing what you can survive, and that was the
                        one choice on this screen with nothing to judge it by.
                      */}
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        {cleared && (
                          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-600">
                            cleared
                          </span>
                        )}
                        <dl className="w-32 space-y-1 font-mono text-[9px] uppercase tracking-[0.12em]">
                          {describeBoss(boss.level, championStats(championFor(affinity)).health).map(
                            (stat) => (
                              <div key={stat.label} className="flex justify-between gap-2">
                                <dt className="text-stone-700">{stat.label}</dt>
                                <dd className="tabular-nums text-stone-300">{stat.value}</dd>
                              </div>
                            ),
                          )}
                        </dl>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
          )}


          <div className="mt-8 border-t border-ash-800 pt-5">
            {step < steps.length - 1 && (
              <button
                type="button"
                disabled={section === 1 && armament === null}
                onClick={() => setStep(step + 1)}
                className={[
                  "mb-4 w-full border px-10 py-3 text-xs uppercase tracking-[0.35em] transition",
                  section === 1 && armament === null
                    ? "cursor-not-allowed border-ash-800 text-stone-700"
                    : "border-stone-600 text-stone-300 hover:border-stone-400",
                ].join(" ")}
              >
                {section === 1 && armament === null ? "Choose your weapon" : "Continue"}
              </button>
            )}
            {/*
              Only above Descend.

              It describes the fight, so on the element and weapon steps it was
              answering a question nobody had asked yet. Here it is the last
              thing read before the fight starts, which is when it means
              something.
            */}
            {section === 2 && (
              <p className="text-[11px] leading-relaxed text-stone-600">
                How hard you swing, how often you dodge, and how close to death you finish all
                shape the weapon the forge makes for you.
              </p>
            )}
            {/*
              Descend belongs to the last step only.

              It rendered on all three, and with nothing chosen yet its label
              read "Choose your weapon", so the element step showed a Continue
              button and a second, disabled button telling the player to do
              something two steps away. Each step now offers exactly one way
              forward.
            */}
            {section === 2 && (
              <button
                type="button"
                onClick={startFight}
                disabled={bossLevel === null}
                className={[
                  "mt-4 w-full border px-10 py-3 text-xs uppercase tracking-[0.35em] transition",
                  bossLevel === null
                    ? "cursor-not-allowed border-ash-800 text-stone-700"
                    : "border-ember-500/60 text-ember-300 hover:bg-ember-500/10",
                ].join(" ")}
              >
                {bossLevel === null ? "Choose who you fight" : "Descend"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
