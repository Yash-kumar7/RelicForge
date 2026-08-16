import { useEffect, useState } from "react";
import type { Affinity } from "@relic/core";
import { championFor, championStats } from "../game/champions";
import { useGameStore } from "../state/useGameStore";
import { IRON, useLoadout } from "../state/useLoadout";
import { BOSSES, bossAt, describeBoss, isCleared } from "../game/bosses";
import { bossTraits, describeTraits } from "@relic/core";
import { ChampionPreview } from "./ChampionPreview";
import { TitleBackdrop } from "./TitleBackdrop";
import { BossPortrait } from "./BossPortrait";
import { BossPreview } from "./BossPreview";
import { ArmamentPanel } from "./ArmamentPanel";
import { PendingForgePanel } from "./PendingForgePanel";
import { RankSigil } from "./RankSigil";
import { InfoTip } from "./InfoTip";
import { RankLadder } from "./RankLadder";
import { SpecimenPlate } from "./SpecimenPlate";
import { TitleHero } from "./TitleHero";
import { HowItWorks } from "./HowItWorks";
import { RANKS, XP_BONUSES, rankFor, useProgress, xpRangeFor } from "../state/useProgress";
import { asset } from "../lib/backend";

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

/**
 * The same light, in whatever colour is standing in it.
 *
 * The glow belongs to whoever fills the left half of the screen, and on the
 * enemy step that is no longer the champion, so it was switched off entirely
 * and the boss stood in a black box while the two steps before it had a lit
 * room. A boss lights the room in its own colour instead.
 */
function glowFrom(hex: string, alpha: number): string {
  const value = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

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
    <div
      className={
        /*
          Bleeding, the page has no vertical padding of its own.

          A figure asked to be 100svh tall inside a container padded top and
          bottom is 6rem taller than the screen, so the page scrolled to show a
          champion that was supposed to fit it exactly. The padding moves onto
          the column that still needs it.
        */
        /*
          No vertical padding here, and that is the point.

          This wrapper holds both columns, so every adjustment made to move the
          steps moved the champion by exactly the same amount. Five rounds of
          nudging pt from 2 to 36 changed where the pair sat on the page and never
          once changed the distance between them, which is the thing being aimed
          at. The padding belongs to the column that needs it.
        */
        "h-full overflow-hidden bg-ash-950 pb-8 pl-0 pr-6"
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
        /*
          Stretched, not centred.

          items-center held each column in the middle of the row, so the setup
          column floated regardless of what its own contents did: removing the
          justify-center inside it changed nothing, because the block being
          centred was the column itself. That is why the steps sat a hundred
          pixels below the champion's head with nothing above them.

          Stretched, both columns start at the top of the row and the steps line
          up with the top of the figure beside them.

          The figure also takes the room the column gives back, rather than the
          page spreading into margin on very wide screens.
        */
        className="mx-auto grid h-full w-full max-w-none items-stretch gap-12 lg:grid-cols-[1.25fr_1fr] xl:gap-16"
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
        <div className="relative lg:self-stretch">
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
              ].join(" ")}
              style={{
                background: `radial-gradient(ellipse 62% 52% at 50% 58%, ${
                  section === 2 && bossLevel !== null
                    ? glowFrom(bossAt(bossLevel).accent, 0.26)
                    : ELEMENT_GLOW[affinity]
                }, transparent 72%)`,
              }}
            />
          {section === 2 && bossLevel !== null ? (
            <BossPreview
              level={bossLevel}
              title={bossAt(bossLevel).title}
              accent={bossAt(bossLevel).accent}
              /*
                Bleeds, exactly as the champion does.

                The champion moved out of its bordered plate and onto the page
                two steps ago; the boss never followed, so the last step of the
                sequence still looked like the version of the screen the first
                two had left behind. The enemy gets the same room the character
                choosing to fight it gets.
              */
              className="h-[calc(100svh-7rem)] w-full"
            />
          ) : (
            <ChampionPreview affinity={affinity} armed={section > 0} />
          )}
          </div>

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
        {/*
          Starts at the top, rather than floating in the middle.

          justify-center held the whole column in the vertical centre of the
          viewport, so a step with three rows in it sat with two hundred pixels of
          nothing above the numbered steps and as much again below the button. The
          steps are a header: they belong at the top of their column, in the same
          place on every step, and the champion beside them is what should be
          using the height.
        */}
        {/*
          A measure, not the whole panel.

          Uncapped, the column grew with the window: on a wide screen the rows
          stretched past a thousand pixels while their text stayed at reading
          size, so each one was a short sentence with a long empty tail. Capped
          it keeps the shape it was designed at, and the space left over goes to
          the champion rather than being distributed as margin.
        */}
        {/* The setup column's own top offset, which moves the steps without
            moving the figure beside them. */}
        <div className="flex h-full max-w-3xl flex-col overflow-y-auto pb-4 pr-2 pt-12">
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
          {/*
            Pinned, because the column scrolls.

            The steps and the rank sat at the top of a scrolling column, so on
            the enemy step, where the list of five bosses is taller than the
            viewport, they scrolled away and the player lost the only thing
            saying where they were in the sequence. Sticky keeps them while the
            content moves under them.
          */}
          <div className="sticky top-0 z-20 mb-5 bg-ash-950 pb-3 pt-0">
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
            {/*
              A row of its own, under the steps.

              It sat opposite them, squeezed into fourteen rem while the column
              ran past a thousand pixels: a name, two figures and a bar crammed
              into a corner, with the bar too short to show anything and the gap
              between the two blocks doing nothing. They are not a pair. The steps
              say where you are in the sequence, and this says where you are in
              the game, so they read as two lines rather than two columns.
            */}
            {/* mt-3 read as a caption hanging off the steps. These are two
                separate things, and the gap between them should say so as
                clearly as the gap between the rank block and the heading below
                it. */}
            <span className="mt-7 block whitespace-nowrap">
              <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.3em] text-brass-700">
                rank
                {/*
                  Six ranks existed and five of them were invisible.

                  A player saw one name, one mark and a distance to the next, which
                  says something is climbing but not what: Relic-Bound meant nothing
                  beyond not being Unproven, and the sigil could not say whether it
                  was the second rung or the fifth. The value of a rank is entirely
                  in the ones above and below it.
                */}
                <InfoTip label="rank">
                  <RankLadder xp={xp} />
                </InfoTip>
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
                    {/*
                      The unit, on the number.

                      It read "1000 to Legend-Made", and a bare figure beside a
                      progress bar is as easily a percentage, a countdown or a
                      score as it is experience. The figure on the left of the
                      same row says XP; this one was the only number on the screen
                      that did not.
                    */}
                    <span className="font-mono text-[9px] tabular-nums text-brass-700">
                      {rank.next === null
                        ? "highest rank"
                        : `${rank.next - xp} XP to ${RANKS[rank.index + 1]?.name ?? ""}`}
                    </span>
                  </span>

                  {/*
                    A track that looks like one, even when empty.

                    At zero experience there is no fill, so a thin dark bar on a
                    dark page was a rule between two numbers rather than progress
                    waiting to happen. The track is lighter and taller now, and
                    the fill keeps a minimum sliver, so the thing always reads as
                    a container with something in it rather than as a divider.
                  */}
                  <span className="mt-1.5 block h-[4px] w-full rounded-sm bg-brass-800/70">
                    <span
                      className="block h-[4px] rounded-sm bg-ember-500 transition-all duration-500"
                      style={{
                        width: `${
                          rank.next === null
                            ? 100
                            : Math.max(4, Math.round((rank.into / rank.span) * 100))
                        }%`,
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
            <h2 className="flex items-center gap-3 font-display text-[clamp(1.75rem,2.6vw,2.5rem)] leading-none tracking-[0.12em] text-bone-200">
              Choose your element
              {/*
                Element sounds like a colour, and it is the only choice on this
                screen that changes a number.
                
                Fire, ice and lightning read as a skin: three versions of one
                character in different palettes, which is what they were before
                champions carried their own damage, health and dodge. They decide
                how the fight goes now, and nothing on the page said so except
                three health bars a player has to infer it from.
              */}
              <InfoTip label="what your element decides">
                <span className="block text-stone-300">
                  Your element is the champion you fight as, and the only choice here that
                  changes numbers.
                </span>
                <span className="mt-2 block">
                  It sets how hard you hit, how much punishment you survive, and how often you
                  can dodge. Those three decide how a fight goes, and how a fight goes decides
                  the weapon it forges.
                </span>
                <span className="mt-2 block text-stone-600">
                  It also colours the relic, but that is the smallest thing it does.
                </span>
              </InfoTip>
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
            {/*
              The line goes with the panel it belonged to.

              It said each champion tends to earn a different relic and any of
              them can carry any of them afterwards, which is now the last two
              sentences of every row's own mark. Kept here it was a third copy,
              and the heading above it already asks the question the page is for.
            */}

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
            {/*
              Space between the rows.

              At gap-1 three champions were one block with hairlines through it,
              and the selected row's tint bled into its neighbours. At 3 they were
              still reading as a table: the portraits are 64 pixels tall, so a
              12 pixel gap is a fifth of a row and the eye groups them anyway.

              These are three separate choices, each with a picture, a name, a
              line and a bar, and they need enough air between them that the
              selected one is obviously one of three rather than a highlighted
              cell.
            */}
            {/* The heading is set in a display face at up to 2.5rem with
                leading-none, so it has almost no room under it of its own: mt-6
                put the first champion within a few pixels of the descenders. */}
            <div className="mt-10 flex flex-col gap-5">
              {AFFINITIES.map((a) => (
                /*
                  A mark per row, in the corner rather than in the card.

                  The detail lived in one panel under all three, which meant the
                  answer to "what is Frost like" was somewhere else and only ever
                  about whichever row was already selected: to read about a
                  champion you had to choose it first. Now each row explains
                  itself where it is.

                  Outside the button because a button inside a button is invalid
                  markup and its click would select the champion underneath.
                */
                <div key={a.id} className="relative">
                <button
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
                    "group flex w-full items-center gap-4 overflow-hidden border-l-2 py-3 pl-4 pr-4 text-left transition",
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
                      /* 64 pixels was chosen when three rows had to share a
                         page with a detail panel and a paragraph. The panel and
                         the paragraph are both gone and the column now ends two
                         thirds of the way down the window, so the portraits can
                         be the size the character select of a game about
                         characters should have. */
                      "relative h-28 w-24 shrink-0 overflow-hidden transition",
                      affinity === a.id
                        ? "opacity-100 brightness-125"
                        : "opacity-80 brightness-110",
                    ].join(" ")}
                  >
                    <img
                      src={asset(`/assets/champions/${a.id === "fire" ? "ember" : a.id === "ice" ? "frost" : "storm"}/concept-cut.png`)}
                      alt=""
                      aria-hidden
                      /* Cropped to the helm and shoulders. A chest-up frame at
                         56 pixels wide is still mostly torso, and torsos are
                         what these three have in common; the helmets are what
                         tells them apart. */
                      /* Scaled with the frame, so the crop still lands on the
                         helm and shoulders rather than pulling back to a torso. */
                      className="absolute left-1/2 -top-2 h-[28rem] w-auto max-w-none -translate-x-1/2 object-contain"
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
                  {/* Uncapped. It was 16rem, then 28, and both stopped short of
                      the row's own edge, which left every card looking cut off
                      and the mark in its corner stranded in empty space. The bar
                      compares three numbers, so it should use the width it has. */}
                  <span className="mt-2 flex items-center gap-3 pr-10">
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

                <span className="absolute right-3 top-3">
                  <InfoTip label={a.name}>
                    <span className="block text-stone-300">{championFor(a.id).blurb}</span>
                    <span className="mt-2 block border-t border-ash-800 pt-2 text-stone-500">
                      {championFor(a.id).forges}
                    </span>
                    <span className="mt-2 block text-stone-600">
                      Only a tendency. The weapon comes from the fight you actually have, so
                      anyone can forge anything by fighting against type.
                    </span>
                  </InfoTip>
                </span>
                </div>
              ))}
            </div>

            {/*
              No detail panel under the rows.

              It carried how the selected champion fights and what it forges,
              which is the same pair each row now explains for itself. Keeping
              both meant three sentences existed twice, and the panel could only
              ever describe the champion already chosen: the one a player had
              stopped needing to read about.
            */}
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
            {/* The third question, asked the way the other two are. */}
            <h2 className="font-display text-[clamp(1.75rem,2.6vw,2.5rem)] leading-none tracking-[0.12em] text-bone-200">
              Choose who you fight
            </h2>

            <div className="mt-4 flex flex-col gap-1.5">
              {BOSSES.map((boss) => {
                const cleared = isCleared(boss.level);
                const selected = bossLevel === boss.level;
                const lean = describeTraits(bossTraits(boss.name));
                const pay = xpRangeFor(boss.level);
                return (
                  /* Wrapped, so the mark is a sibling of the button rather than
                     a child of it: nesting one would select the boss underneath. */
                  <div key={boss.level} className="relative">
                  <button
                    type="button"
                    onClick={() => chooseBossLevel(boss.level)}
                    /*
                      The same shape a champion row has, because it is the same
                      kind of decision.

                      This was a boxed card with a border on four sides while the
                      champions were rows with a coloured edge, so two lists that
                      do the same job on consecutive steps looked like two
                      different interfaces. The champion pattern is the better of
                      the two: the accent marks the selection without drawing a
                      container around every option that is not chosen.

                      w-full because a button is inline-block, so each row stopped
                      at its own longest line and five rows came out five widths.
                    */
                    className={[
                      "w-full border-l-2 text-left transition",
                      selected
                        ? "border-ember-500/70 bg-gradient-to-r from-white/[0.04] to-transparent text-stone-200"
                        : "border-transparent text-stone-500 hover:border-ash-700 hover:bg-white/[0.02]",
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
                    <span className="flex items-start gap-4 py-2.5 pl-4 pr-12">
                      <BossPortrait
                        title={boss.title}
                        locked={false}
                        /* 80 pixels tall was a third of a row and five of them
                           pushed the last boss off the screen. A thumbnail only
                           has to tell one row from another. */
                        className="h-14 w-12 shrink-0 border border-ash-800"
                      />
                      <span className="mt-0.5 w-7 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em]">
                        {boss.level.toString().padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-base tracking-[0.1em]">
                          {boss.title}
                        </span>
                        {/* Clamped to one line. It is repeated inside the mark in
                            full, and a row that wraps to two lines on some bosses
                            and not others is why the list was never the same
                            height twice. */}
                        <span className="mt-0.5 block truncate text-[11px] leading-relaxed text-stone-600">
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
                          {describeBoss(boss.level).map(
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

                  <span className="absolute right-3 top-3">
                    <InfoTip label={boss.title}>
                      <span className="block text-stone-300">{boss.blurb}</span>

                      {/*
                        What killing this one leaves behind.

                        The ladder pays more for a harder rung and nothing said so:
                        a player could own two relics differing by a fifth in
                        damage with no way to learn the difference was which boss
                        died. The first rung leans nothing, which is worth saying
                        plainly rather than showing an empty list.
                      */}
                      <span className="mt-3 block border-t border-ash-800 pt-2">
                        <span className="block text-stone-600">Its relic</span>
                        <span className="mt-1 block text-stone-400">
                          Forged from {boss.name}, and carries its name into the weapon.
                        </span>
                        {lean.length > 0 ? (
                          {/*
                            Sentence case, like the rest of the note.
                            
                            It was uppercase mono with wide tracking, which is the
                            style this interface uses for labels: RANK, IN HAND,
                            HEALTH. This is not a label, it is the answer to what
                            the relic is worth, sitting inside a note written in
                            sentences, and setting it as a label made it read as a
                            heading for something that never came.
                          */}
                          <span className="mt-1 block font-mono text-[10px] capitalize text-stone-400">
                            {lean.join(" · ")}
                          </span>
                        ) : (
                          <span className="mt-1 block text-stone-600">
                            The first rung, so it leans nothing. Everything above it hits harder.
                          </span>
                        )}
                      </span>

                      {/*
                        The conditions, with their thresholds and their prices.
                        
                        This said "up to 260 by finishing hurt, never healing,
                        dodging often, and claiming the relic": four judgements
                        and no numbers. How hurt, how often, and worth what. A
                        player cannot aim at that, and a bonus nobody can aim at
                        is one nobody earns deliberately.
                      */}
                      <span className="mt-3 block border-t border-ash-800 pt-2">
                        <span className="flex justify-between gap-3">
                          <span className="text-stone-600">Win the fight</span>
                          <span className="tabular-nums text-stone-300">{pay.min}</span>
                        </span>
                        {XP_BONUSES.map((bonus) => (
                          <span key={bonus.label} className="mt-1 flex justify-between gap-3">
                            <span className="text-stone-600">{bonus.label}</span>
                            <span className="tabular-nums text-stone-400">+{bonus.amount}</span>
                          </span>
                        ))}
                        {/* The two health bonuses are the same branch, so the
                            maximum is not the sum of the list above it. */}
                        <span className="mt-2 block text-stone-600">
                          The two health conditions are one or the other, so the most this fight
                          can pay is {pay.max}.
                        </span>
                      </span>
                    </InfoTip>
                  </span>
                  </div>
                );
              })}
            </div>
          </section>
          )}


          {/*
            Pinned to the bottom, because the column scrolls.

            The way forward sat in flow underneath a list of five bosses, so on
            the last step it began below the fold and the player had to scroll
            past every enemy to reach the button that starts the fight. A control
            that leaves the screen is a control that looks missing. The steps are
            pinned at the top of this column for the same reason; this is the
            other end of it.

            Opaque, since the rows pass underneath.
          */}
          {/*
            No rule above the button.

            It was drawn when this bar was pinned, on the assumption that content
            scrolling underneath needed a hard edge to stop against. The button
            already has a border on all four sides, so the line sat a few pixels
            above another line and read as a seam in the panel rather than as a
            division of it. The gap does that job on its own.
          */}
          <div className="sticky bottom-0 z-20 mt-8 bg-ash-950 pb-4 pt-5">
            {step < steps.length - 1 && (
              <button
                type="button"
                disabled={section === 1 && armament === null}
                onClick={() => setStep(step + 1)}
                /*
                  Sized to the words and centred under them.
                  
                  It ran the full width of a panel past 1200 pixels, which made a
                  step forward the largest object on a screen whose subject is a
                  champion and set one word in the middle of a long empty outline.
                  Cut to fit its own label it went the other way and read as an
                  afterthought pinned to the left. A control this important is
                  neither of those: it is a comfortable target, centred, where the
                  eye already is after reading down the middle of the column.
                */
                className={[
                  "mx-auto block border px-16 py-3 text-xs uppercase tracking-[0.32em] transition",
                  section === 1 && armament === null
                    ? "cursor-not-allowed border-ash-800 text-stone-700"
                    : "border-stone-600 text-stone-300 hover:border-stone-400",
                ].join(" ")}
              >
                {section === 1 && armament === null ? "Choose your weapon" : "Continue"}
              </button>
            )}
            {/*
              Nothing under the list any more.

              Two things lived here and both have been said better elsewhere. A
              sentence explaining that how you swing, dodge and finish shapes the
              weapon, which is the weapon step's heading mark and the first line
              of the briefing. And a mark explaining how the experience on each
              row is earned, which every row now carries itself, as a price list
              with thresholds rather than the four judgements this one offered.

              A duplicate of a better version is worse than nothing: it is one
              more thing to read that teaches less than the thing beside it.
            */}
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
                /* The one press on this screen that starts a fight. */
                data-sound="confirm"
                /* Wider and brighter than Continue, because it starts a fight
                   rather than turning a page, and centred with it. */
                className={[
                  "mx-auto mt-4 block border px-20 py-3.5 text-xs uppercase tracking-[0.35em] transition",
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
