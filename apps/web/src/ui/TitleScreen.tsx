import { useEffect, useState } from "react";
import type { Affinity } from "@relic/core";
import { championFor, championStats, describeChampion } from "../game/champions";
import { useGameStore } from "../state/useGameStore";
import { IRON, useLoadout } from "../state/useLoadout";
import { BOSSES, bossAt, describeBoss, isCleared } from "../game/bosses";
import { ChampionPreview } from "./ChampionPreview";
import { TitleBackdrop } from "./TitleBackdrop";
import { BossPortrait } from "./BossPortrait";
import { BossPreview } from "./BossPreview";
import { ArmamentPanel } from "./ArmamentPanel";
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

/**
 * The light each champion stands in.
 *
 * Faint on purpose: enough that switching element changes the temperature of the
 * screen, not so much that it becomes a coloured page. The figure is lit by its
 * own art already, so this is the room rather than the key light.
 */
const ELEMENT_GLOW: Record<Affinity, string> = {
  fire: "rgba(255,107,26,0.3)",
  ice: "rgba(74,168,216,0.28)",
  storm: "rgba(251,191,36,0.24)",
};

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

  /*
   * ?bleed switches the champion between a framed portrait and a full-height
   * figure cropped by the viewport, so the two can be compared on the same
   * screen rather than described.
   */
  const bleed =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("bleed");
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
    <div
      className={
        bleed
          ? "h-full overflow-y-auto bg-ash-950 pb-10 pl-0 pr-6 pt-14"
          : "h-full overflow-y-auto bg-ash-950 px-6 pb-10 pt-14"
      }
    >
      {/*
        The width of the screen, not a column in the middle of it.

        max-w-6xl was chosen when this page stacked several sections; as a
        two-panel step it left most of a wide monitor empty on both sides while
        the title screen beside it runs full bleed. The right column is capped on
        its own instead, so text still sets to a readable measure.
      */}
      <div className="mx-auto grid w-full max-w-[104rem] items-center gap-12 lg:grid-cols-[1.05fr_1fr] xl:gap-20">
        {/* Left: the champion, as large as the viewport allows. */}
        {/*
          Deliberately not sticky.
          Pinning this column kept the champion on screen while scrolling, but a
          stuck element sits at its own offset from the viewport rather than in
          flow, so the heading drifted below "Choose your affinity" the moment
          the page moved at all. Two headings that are meant to share a line
          cannot have one of them positioned against the viewport.
        */}
        <div className={bleed ? "relative lg:self-stretch" : "lg:self-start"}>
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
          {/*
            The chosen element lights the room.

            The champion stood in a bordered box on a flat page, so choosing a
            different one changed a figure and nothing else. In the games this is
            built after, picking a character changes the whole screen: the light
            behind them is theirs. It costs one gradient and it is the difference
            between a settings panel and a character select.
          */}
          <div className="relative">
            <div
              className={[
                "pointer-events-none absolute inset-0 -z-10 transition-opacity duration-700",
                section === 2 ? "opacity-0" : "opacity-100",
              ].join(" ")}
              style={{
                background: `radial-gradient(ellipse 62% 52% at 50% 58%, ${ELEMENT_GLOW[affinity]}, transparent 72%)`,
              }}
            />
          {section === 2 && bossLevel !== null ? (
            <BossPreview
              level={bossLevel}
              title={bossAt(bossLevel).title}
              accent={bossAt(bossLevel).accent}
              /* Same frame the champion gets. The two views sit in the same
                 place on consecutive steps, so a smaller one reads as the enemy
                 mattering less than the character choosing to fight it. */
              /* The same plate the champion gets, so the two views sit
                 identically on consecutive steps. */
              className="h-[calc(100svh-7rem)] max-h-[54rem] min-h-[30rem] w-full border border-brass-800 bg-white/[0.015]"
            />
          ) : (
            <ChampionPreview affinity={affinity} armed={section > 0} bleed={bleed} />
          )}
          </div>

          {/*
            The name under the figure, at size.

            A character select names its character. This had the name only inside
            a row on the other side of the page, so the person filling the left
            half of the screen was anonymous while you were looking at them.
          */}
          {section !== 2 && !bleed && (
            <p className="mt-3 text-center font-display text-2xl tracking-[0.26em] text-bone-200 lg:text-3xl">
              {championFor(affinity).name.toUpperCase()}
            </p>
          )}

          {/* Bleeding, the name sits over the figure rather than under a frame
              that no longer exists. */}
          {section !== 2 && bleed && (
            <p className="pointer-events-none absolute bottom-[6svh] left-10 font-display text-4xl tracking-[0.26em] text-bone-200">
              {championFor(affinity).name.toUpperCase()}
            </p>
          )}
        </div>

        {/* Right: element, then weapon, then who you fight, then descend. */}
        <div className="flex max-w-2xl flex-col justify-center">
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
            <div className="mt-5 flex flex-col gap-5">
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
                    "group flex items-center gap-5 overflow-hidden border-l-2 py-4 pl-5 pr-4 text-left transition",
                    affinity === a.id
                      ? `${a.accent} bg-gradient-to-r from-white/[0.04] to-transparent`
                      : "border-transparent text-stone-500 hover:border-ash-700 hover:bg-white/[0.02]",
                  ].join(" ")}
                >
                  {/*
                    The champion, not an emoji.

                    The row identified each choice with a weather glyph, which
                    is the element rather than the person and reads as clip art
                    beside an inscriptional face. These are the same cut-out
                    portraits the title screen uses, so the character you are
                    picking is the thing you are looking at, and the one on the
                    left is a larger version of the same figure.
                  */}
                  <span
                    className={[
                      "relative h-24 w-20 shrink-0 overflow-hidden transition",
                      affinity === a.id ? "opacity-100" : "opacity-45 grayscale",
                    ].join(" ")}
                  >
                    <img
                      src={`/assets/champions/${a.id === "fire" ? "ember" : a.id === "ice" ? "frost" : "storm"}/concept-cut.png`}
                      alt=""
                      aria-hidden
                      /* Framed from the chest up: at this size a full figure is
                         a smudge, and a helm is recognisable. */
                      className="absolute left-1/2 top-0 h-[19rem] w-auto max-w-none -translate-x-1/2 object-contain"
                    />
                  </span>

                  <span className="min-w-0 flex-1">
                  <div className="flex h-7 items-center gap-2">
                    {/* A bar in the element's colour, doing the job the glyph
                        was doing without pretending to be an illustration. */}
                    <span className={`h-4 w-[3px] shrink-0 ${a.bar}`} />
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

          {/* No top margin. These were spaced to sit under the section above
              them on a single scrolling page; each one is now the only thing on
              its step and was starting lower than the element list it replaces. */}
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
