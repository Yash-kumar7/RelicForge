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
import { PendingForgePanel } from "./PendingForgePanel";
import { RankSigil } from "./RankSigil";
import { SpecimenPlate } from "./SpecimenPlate";
import { TitleHero } from "./TitleHero";
import { HowItWorks } from "./HowItWorks";
import { RANKS, rankFor } from "../state/useProgress";
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
/** The most health any champion has, so the bars measure against each other. */
/** The most health any champion has, so the bars measure against each other. */
const TOUGHEST = Math.max(
  ...(["fire", "ice", "storm"] as Affinity[]).map((id) => championStats(championFor(id)).health),
);

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
   * The champion fills its half of the screen.
   *
   * This was behind ?bleed while the framed portrait and the full-height figure
   * were compared side by side. The figure won: framed, it shared a rectangle
   * with the column of choices and needed a border to say where one ended, and
   * the border is what made the page read as a form beside a picture.
   */
  const bleed = true;
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
        /*
          Bleeding, the page has no vertical padding of its own.

          A figure asked to be 100svh tall inside a container padded top and
          bottom is 6rem taller than the screen, so the page scrolled to show a
          champion that was supposed to fit it exactly. The padding moves onto
          the column that still needs it.
        */
        bleed
          ? "h-full overflow-hidden bg-ash-950 py-14 pl-0 pr-6"
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
      <div
        className={`mx-auto grid w-full items-center gap-12 lg:grid-cols-[1.05fr_1fr] xl:gap-20 ${
          bleed ? "h-full max-w-none" : "max-w-[104rem]"
        }`}
      >
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

          {/*
            No name over the figure.

            It named the champion in the largest type on the screen while the
            row beside it was already highlighted with that name in it. Two
            answers to a question the player has just answered themselves, and
            the louder one was competing with the figure it was labelling.
          */}
        </div>

        {/* Right: element, then weapon, then who you fight, then descend. */}
        {/*
          Scrolls on its own, because the page cannot.

          Bleed mode hides the page's overflow so the champion can fill the
          screen without dragging a scrollbar behind it. That works until this
          column is taller than the viewport, at which point whatever sits at the
          bottom is simply gone, and what sits at the bottom is the button that
          continues. Giving the column its own scroll keeps the figure fixed and
          the decision reachable.
        */}
        <div className="flex max-h-full max-w-2xl flex-col justify-center overflow-y-auto py-4 pr-2">
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

          {/*
            Rank rides the step row, at the far end.

            It has been three places and each was wrong for the same reason: it
            is chrome, and chrome belongs with chrome. Above the question it was
            the first thing read on a screen about choosing a character. Below
            the button it read as a footnote to the button. Here it sits opposite
            the steps, which is the other thing on this page that tells you where
            you are rather than what to do.
          */}
          <div className="mb-5 flex items-baseline justify-between gap-6">
          <ol className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]">
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

            {/*
              Always shown, including at zero.

              It was briefly hidden until the first experience was earned, on the
              grounds that "Unproven · 0 xp" is a label for having done nothing.
              That is exactly why it belongs there: a rank at the bottom of a
              ladder is how a player learns there is a ladder, and every game
              shows it from the first minute rather than revealing it after the
              first win.

              The pips do the work the bare word could not. Six marks with one
              filled says there is somewhere to get to, which "Unproven" alone
              does not.
            */}
            {/*
              A rank worth looking at is one with somewhere to go.

              This has been a bare word, six dashes, and a numeral with "of VI"
              beside it, and all three said where the player stands and nothing
              about what is next. Rank displays motivate by showing progress
              toward the following rank, not by stating the current one, which
              is why every version so far read as inert.

              So: the numeral for standing, the bar for how far into this rank
              the player is, and the name of the rank being climbed toward. At
              the top of the ladder there is nothing left to aim at, and the bar
              is replaced by saying so.
            */}
            {/*
              Rank, as one line that does not wrap.

              Rebuilt, because successive edits had nested the sigil inside the
              label's own span: the shield rendered under the copy, the
              experience figure disappeared into a tag that was never closed
              where it looked, and no amount of adjusting widths was going to fix
              markup that was wrong.

              Reads left to right: what is held, what is owed, and the mark that
              stands for the standing, with the bar under them showing how far
              into this rank the player is.
            */}
            {/*
              Labelled first, then everything that describes it.

              Without the word on top the block was two numbers and a shield with
              nothing saying what they were about, which is how a rank ends up
              being read as a score or a timer. The label names it, and the sigil,
              the figures and the bar sit under it as one group.
            */}
            <span className="block w-[14rem] shrink-0 whitespace-nowrap">
              <span className="block font-mono text-[9px] uppercase tracking-[0.3em] text-brass-700">
                rank
              </span>

              <span className="mt-1.5 flex items-center gap-2.5">
                <RankSigil index={rank.index} title={rank.name} size={24} />

                <span className="flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    {/* XP is an initialism, so it takes capitals the way the
                        rest of the labels on this row do. */}
                    <span className="font-mono text-[10px] tabular-nums uppercase text-bone-300">
                      {xp} xp
                    </span>
                    <span className="font-mono text-[9px] tabular-nums text-brass-700">
                      {rank.next === null
                        ? "max rank"
                        : `${rank.next - xp} to ${RANKS[rank.index + 1]?.name ?? ""}`}
                    </span>
                  </span>

                  <span className="mt-1 block h-[2px] w-full bg-ash-800">
                    <span
                      className="block h-[2px] bg-ember-500/80 transition-all duration-500"
                      style={{
                        width: `${rank.next === null ? 100 : Math.round((rank.into / rank.span) * 100)}%`,
                      }}
                    />
                  </span>
                </span>
              </span>
            </span>
          </div>

          {section === 0 && (
          <section>
            {/*
              Affinity is the field name and the fiction, but on a first-run
              screen it explains nothing. The choice is an element, so it says
              element, and the cards carry the flavour instead.
            */}
            {/*
              The question, at the size of a question.

              It was set in the same small grey mono as the rank, the steps and
              every label on the page, so nothing on this half of the screen was
              louder than anything else while the champion beside it filled the
              window.
            */}
            <h2 className="font-display text-[clamp(1.75rem,2.6vw,2.5rem)] leading-none tracking-[0.12em] text-bone-200">
              Choose your element
            </h2>
            {/*
              Stated once rather than repeated in all three cards.
              Without it the champion's damage and the armament panel's damage
              are two different numbers for the same swing, and nothing on
              screen explains which one the fight will actually use.
            */}
            {/*
              The loop, which the forging lines alone do not explain.

              Relics are portable: anything earned can be carried by any
              champion. That reads as making this choice pointless and is the
              opposite. A weapon cannot be bought or picked from a list, so the
              only way to own a cracked one is to nearly die earning it, and only
              Ember reliably takes you there. The champion is how a kind of relic
              gets made; who carries it afterwards is a separate decision, and
              the two together are the only build this game has.
            */}
            <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-bone-400">
              Each champion tends to earn a different kind of relic, and any of
              them can carry any relic afterwards. Win it as Ember, wield it as
              Frost.
            </p>

            {/*
              Full-width rows rather than three columns.

              Three narrow cards were a compromise with a page that had to hold
              every decision at once. A step that asks one question has the width
              to spare, and a row reads left to right, identity then trade then
              numbers, instead of forcing three columns of wrapped text to be
              compared vertically.
            */}
            {/*
              Tight. Three rows at nearly two hundred pixels each, plus a detail
              panel and a button, is taller than any laptop, and what fell off
              the bottom was the button.
            */}
            <div className="mt-5 flex flex-col gap-1">
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
                    "group flex items-center gap-4 overflow-hidden border-l-2 py-3 pl-4 pr-4 text-left transition",
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
                      /*
                        Lifted, not dimmed.

                        Ember and Storm are dark armour, so at this size on a
                        dark page they were silhouettes, and desaturating the
                        unselected ones removed the only thing separating them:
                        their colour. Only Frost read, because it happens to be
                        pale. The unselected state is now a small step back in
                        brightness rather than a drain of colour, and every
                        portrait is lifted enough to survive being small.
                      */
                      "relative h-16 w-14 shrink-0 overflow-hidden transition",
                      affinity === a.id
                        ? "opacity-100 brightness-125"
                        : "opacity-80 brightness-110",
                    ].join(" ")}
                  >
                    <img
                      src={`/assets/champions/${a.id === "fire" ? "ember" : a.id === "ice" ? "frost" : "storm"}/concept-cut.png`}
                      alt=""
                      aria-hidden
                      /* Cropped to the helm and shoulders. A chest-up frame at
                         56 pixels wide is still mostly torso, and torsos are
                         what these three have in common; the helmets are what
                         tells them apart. */
                      className="absolute left-1/2 -top-1 h-[17rem] w-auto max-w-none -translate-x-1/2 object-contain"
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
                  {/*
                    One bar, for the one stat.

                    Three bars asked which champion won three separate contests,
                    two of which nobody had asked about, and one of them was
                    measured per ten seconds and printed as eleven out of ten.
                    A single bar answers the question a player does have: how
                    much punishment does this one take compared to the others.

                    Scaled against the toughest rather than from zero, so the
                    gap between 80 and 130 is the length of the difference
                    rather than a fraction of some invisible ceiling.
                  */}
                  <span className="mt-2 flex max-w-[16rem] items-center gap-3">
                    <span className="font-mono text-[10px] tabular-nums text-bone-300">
                      {championStats(championFor(a.id)).health}
                      <span className="ml-1 text-[9px] uppercase tracking-[0.2em] text-brass-700">
                        hp
                      </span>
                    </span>
                    <span className="block h-[3px] flex-1 bg-ash-800">
                      <span
                        className={`block h-[3px] transition-all duration-500 ${
                          affinity === a.id ? a.bar : "bg-stone-600"
                        }`}
                        style={{
                          width: `${Math.round(
                            (championStats(championFor(a.id)).health / TOUGHEST) * 100,
                          )}%`,
                        }}
                      />
                    </span>
                  </span>
                  </span>
                </button>
              ))}
            </div>

            {/*
              Detail for the one champion being chosen.

              Every row carried a trade line, a forging line and a stat, so
              picking between three meant reading nine paragraphs before the
              first click. A player compares by identity and by one number, then
              wants the detail on whichever they are leaning toward, so the rows
              keep the comparison and this carries the reasons.
            */}
            <div className="mt-6 border-t border-brass-800 pt-5">
              {/*
                Labelled to match the line under it.

                One had a label and the other did not, so they read as unrelated
                sentences rather than as two answers about the same champion.
                Fights and forges are the two things a champion does, and they
                are the two questions this screen exists to answer: how it plays,
                and what it leaves you holding.
              */}
              <p className="max-w-lg text-[13px] leading-relaxed text-bone-200/80">
                <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-brass-700">
                  fights{" "}
                </span>
                {championFor(affinity).blurb}
              </p>
              <p className="mt-3 max-w-lg text-[12px] leading-relaxed text-bone-400">
                <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-brass-700">
                  forges{" "}
                </span>
                {championFor(affinity).forges}
              </p>
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
