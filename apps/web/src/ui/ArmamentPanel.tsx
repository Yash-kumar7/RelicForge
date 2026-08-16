import { useMemo } from "react";
import { describeTraits, relicTraits, type RelicTraits } from "@relic/core";
import { combinedTraits } from "../game/equipped";
import { InfoTip } from "./InfoTip";
import { useGameStore } from "../state/useGameStore";
import { attackSpec } from "../game/combat";

/**
 * The two attacks, described rather than tabulated.
 *
 * The blurbs state the trade because the numbers alone never did. A strong
 * attack that hits harder and lands about as often is not a choice, and until
 * its recovery was lengthened that was literally true. What makes the quick
 * attack worth throwing is that it ends before the boss's telegraph does.
 */
const ATTACKS = [
  {
    kind: "light" as const,
    name: "Quick attack",
    /* The tactical half only. What leaning on it forges is behind the mark on
       the heading, since it is a consequence rather than a reason to press it. */
    blurb: "Ends before the boss can punish it.",
  },
  {
    kind: "heavy" as const,
    name: "Strong attack",
    blurb: "Staggers the boss, but commits you for longer than its wind-up lasts.",
  },
];

/*
 * Swing time is deliberately not shown.
 *
 * "1.22s per swing" is a figure with no reference point: nobody knows whether
 * that is fast without something to compare it against, and the comparison that
 * matters is against the boss's wind-up, which is not on this screen either.
 * The blurbs carry the same information in a form that needs no arithmetic,
 * which is what the timings were there to convey in the first place.
 */
import { IRON, useLoadout } from "../state/useLoadout";

/**
 * What you are carrying into the fight.
 *
 * The setup screen showed who you are and what you are hunting but never what
 * is in your hands, which is odd for a game about weapons. The iron sword is
 * always here; relics appear beside it as they are earned, and the empty state
 * says plainly that the next slot is filled by fighting rather than by
 * shopping.
 */

/**
 * The two attacks, rendered inside a weapon's own card.
 *
 * Deliberately not a panel of its own below the two cards. Sitting outside them
 * it read as a third thing on the screen and lost its connection to the weapon
 * it was describing, which is the entire point of showing it: these are the
 * numbers for the blade in that box, and they change when the other one is
 * picked.
 */
/**
 * What each attack is for, in words.
 *
 * Lived under every damage figure on both cards, which is the same two sentences
 * twice on a step that already scrolled. They describe the attacks rather than
 * the weapon, so they are identical whichever is in hand, and repeating them was
 * the clearest sign they belonged somewhere else.
 */
function AttackNotes() {
  return (
    <span className="mt-3 block border-t border-ash-800 pt-2">
      {ATTACKS.map((attack) => (
        <span key={attack.kind} className="mt-1 block">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-stone-500">
            {attack.name}
          </span>{" "}
          <span className="text-stone-400">{attack.blurb}</span>
        </span>
      ))}
    </span>
  );
}

function AttackBreakdown({
  traits,
  ceiling,
  dim = false,
}: {
  traits: RelicTraits;
  /**
   * The largest figure on the screen, so both cards share one scale.
   *
   * Measured against the heaviest blow either weapon can throw rather than from
   * zero, exactly as the champion health bars are measured against the toughest
   * champion. A bar drawn against its own maximum would fill on both cards and
   * say nothing, which is the failure mode of every stat bar that compares a
   * thing to itself.
   */
  ceiling: number;
  dim?: boolean;
}) {
  const light = attackSpec("light", traits);
  const heavy = attackSpec("heavy", traits);

  /* No rule above these. It separated the attacks from the name when both were
     blocks of text; they are two bars now and the space divides them on its
     own. */
  return (
    <span className="mt-4 block space-y-2 pr-8">
      {ATTACKS.map((attack) => {
        const spec = attack.kind === "heavy" ? heavy : light;
        return (
          /*
            One line per attack, not four.
            
            This was a name, a button, a damage figure and a sentence stacked, on
            both cards, which is sixteen lines for two weapons and taller than the
            step could show without scrolling. The sentences moved to the mark;
            what is left is the comparison, and a comparison reads better on one
            line anyway.
          */
          /* No buttons named here. Which mouse button throws which attack is
             something a player needs while fighting, and the briefing and the HUD
             both say it; on the screen where a weapon is chosen it is answering a
             question that has not been asked yet. What matters here is that one
             attack does 30 and the other 72. */
          <span key={attack.kind} className="flex items-center gap-3">
            {/* Wide enough for the longer of the two names on one line. At w-28
                "Quick attack" broke after the first word and the row became two
                lines tall, which put the bar beside a wrapped label and knocked
                the two attacks out of alignment with each other. */}
            <span className="w-36 shrink-0 whitespace-nowrap font-display text-sm tracking-[0.1em] text-stone-300">
              {attack.name}
            </span>

            {/*
              A bar, for the same reason health has one.

              Two numbers in a column are a comparison a player has to do; two
              bars are one they can see. It also puts quick against strong on the
              same scale, so the trade the whole step is about, less damage for a
              swing that ends sooner, is visible without reading anything.
            */}
            <span className="block h-[3px] flex-1 bg-ash-800">
              <span
                className={[
                  "block h-[3px] transition-all duration-500",
                  dim ? "bg-stone-600" : "bg-ember-500",
                ].join(" ")}
                style={{ width: `${Math.round((spec.damage / Math.max(1, ceiling)) * 100)}%` }}
              />
            </span>

            {/* The unselected side stays legible but quiet, so which weapon is
                in hand is still obvious at a glance. */}
            <span
              className={[
                "w-20 shrink-0 text-right font-mono text-[11px] tabular-nums",
                dim ? "text-stone-600" : "text-ember-300/80",
              ].join(" ")}
            >
              {spec.damage} damage
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function ArmamentPanel() {
  const owned = useLoadout((s) => s.owned);
  const armament = useLoadout((s) => s.armament);
  const select = useLoadout((s) => s.select);

  // Nothing is preselected, so both cards start unchosen and the champion
  // starts empty-handed.
  const selected = useMemo(
    () => (armament && armament !== IRON ? owned.find((r) => r.relicId === armament) ?? null : null),
    [owned, armament],
  );
  const ironChosen = armament === IRON;

  /*
   * Newest first.
   *
   * The relic just forged is the one the player came back for, and it was
   * arriving at the bottom of a list that only grows. Sorted rather than
   * reversed, because earnedAt is what actually orders them and insertion order
   * is only incidentally the same.
   */
  const byNewest = useMemo(() => [...owned].sort((a, b) => b.earnedAt - a.earnedAt), [owned]);

  /*
   * What the relic card displays, which is not the same as what is equipped.
   *
   * It used to render from `selected`, which is only set when that relic is in
   * hand. So a player holding the iron sword saw the unearned placeholder,
   * question marks and "won by fighting", while the relic they had already won
   * sat in the switcher below it. The card claimed they owned nothing.
   *
   * It now shows the relic you would pick up, and the placeholder only when
   * there genuinely is not one.
   */
  const shown = selected ?? byNewest[0] ?? null;

  // Derived from the same function the fight uses, so the panel cannot promise
  // a number the swing does not deliver.
  /*
   * Champion strength folded in, because this is now the only place damage
   * appears. A panel that showed weapon-only numbers while the fight applied
   * the champion on top would be quietly wrong for every champion but one.
   */
  const affinity = useGameStore((s) => s.affinity);
  const traits = useMemo(() => combinedTraits(selected?.dna, affinity), [selected, affinity]);

  // The iron blade is neutral, so it differs only by the champion holding it.
  const ironTraits = useMemo(() => combinedTraits(null, affinity), [affinity]);

  /*
   * The relic's own contribution, with the champion left out.
   *
   * combinedTraits folds the champion in, which is right for the damage figures
   * on the card because those are what the fight will resolve. It is wrong here:
   * this note explains what the weapon brings, and a champion multiplier applied
   * to every weapon equally explains nothing about choosing between them.
   */
  /*
   * One scale for both cards: the heaviest blow on the screen.
   *
   * Without a shared ceiling each bar would be drawn against its own weapon and
   * every card would look identical, which is the opposite of what a comparison
   * is for.
   */
  const ceiling = useMemo(
    () =>
      Math.max(
        attackSpec("heavy", ironTraits).damage,
        shown ? attackSpec("heavy", traits).damage : 0,
      ),
    [ironTraits, traits, shown],
  );

  const relicNotes = useMemo(
    () => (shown ? describeTraits(relicTraits(shown.dna)) : []),
    [shown],
  );


  return (
    <section>
      {/*
        "Armament" is the state field's name, not a word a player would reach
        for. The panel is about the thing in your hands, so it says so.
      */}
      <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.4em] text-stone-600">
        Your weapon
        {/*
          The whole explanation, in one place, on request.

          It was a paragraph here and half a sentence under each attack, saying
          the same thing twice in two registers: relics come from the fight, and
          also, leaning on this attack makes the forge read you a certain way. A
          player choosing a weapon needs neither to press the button.
          
          On the heading rather than in the cards, because the cards are buttons
          and a button inside a button is invalid and would fire the selection.
        */}
        <InfoTip label="how a relic is decided">
          <span className="block text-stone-500">Two things about your fight shape it.</span>
          <span className="mt-2 block">
            <span className="text-stone-300">How much health you have left</span> when the boss
            falls decides its condition: finish comfortably and it comes out flawless, finish
            nearly dead and it comes out cracked, and hits harder for it.
          </span>
          <span className="mt-2 block">
            <span className="text-stone-300">Which attack you lean on</span> decides its shape:
            mostly quick attacks draw something narrow and precise, mostly strong ones an
            oversized, heavy thing.
          </span>
        </InfoTip>
      </p>

      {/*
        One line, where there was a paragraph.

        The paragraph explained how a relic's condition is decided, which is true,
        useful, and not what this screen asks. This screen asks which weapon you
        are carrying in, and the answer to that is a sentence.
      */}
      <p className="mt-3 max-w-lg text-[12px] leading-relaxed text-bone-400">
        Carry the iron blade, or a relic you have already won.
      </p>

      {/*
        Full-width rows, matching the element step.

        Two columns squeezed each attack description into a narrow strip, and
        those descriptions are the only thing on this screen that explains why a
        player would use one attack over the other.
      */}
      {/*
        Each weapon carries its own mark, in the corner rather than in the card.

        The card is a button, so nothing interactive can live inside it: a button
        within a button is invalid markup and its click would select the weapon
        underneath. Wrapping each in a relative container puts the mark beside the
        target rather than in it, which is also where a player expects to find it.
      */}
      <div className="mt-5 flex flex-col gap-5">
        {/* The blade you always have. Selecting it unequips the relic. */}
        <div className="relative">
        <button
          type="button"
          onClick={() => select(IRON)}
          /* A button is inline-block, so it shrank to its widest line while the
             mark in the corner stayed pinned to the column: a card ending at 420
             pixels with its own ⓘ eight hundred pixels away across empty space. */
          /* Matches the champion and boss rows: an accent on the edge rather
             than a box around every option. */
          className={[
            "w-full border-l-2 py-3 pl-4 pr-4 text-left transition",
            ironChosen
              ? "border-stone-400 bg-gradient-to-r from-white/[0.04] to-transparent"
              : "border-transparent hover:border-ash-700 hover:bg-white/[0.02]",
          ].join(" ")}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-stone-700">
            {ironChosen ? "in hand" : "common"}
          </p>
          <p className="mt-1 font-display text-base tracking-[0.12em] text-stone-300">
            Iron Arming Sword
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
            Forge-standard. One of eleven million.
          </p>
          {/*
            Shown on both cards, always.
            
            The breakdown used to appear only on the selected weapon, so the two
            cards were different heights, the panel jumped when you switched, and
            the one thing this screen exists for was impossible: you could not see
            what you were giving up without giving it up first. A comparison needs
            both sides on screen at once.
          */}
          <AttackBreakdown traits={ironTraits} ceiling={ceiling} dim={!ironChosen} />
        </button>

        <span className="absolute right-3 top-3">
          <InfoTip label="the iron arming sword">
            <span className="block text-stone-500">
              The blade every champion starts with, and the only one in the game that was not
              earned.
            </span>
            <span className="mt-2 block">
              It leans nothing. Every number it shows comes from the champion holding it, which
              makes it the honest baseline: whatever a relic adds is visible against this.
            </span>
            <span className="mt-2 block text-stone-600">
              It cannot be lost, so a fight is never unwinnable for want of a weapon.
            </span>
            <AttackNotes />
          </InfoTip>
        </span>
        </div>

        {/* Earned, or an honest empty state. */}
        <div className="relative">
        <button
          type="button"
          disabled={owned.length === 0}
          onClick={() => owned[0] && select(owned[0].relicId)}
          className={[
            "w-full border-l-2 py-3 pl-4 pr-4 text-left transition",
            selected
              ? "border-ember-500/70 bg-gradient-to-r from-white/[0.04] to-transparent"
              : owned.length > 0
                ? "border-transparent hover:border-ember-500/40 hover:bg-white/[0.02]"
                : "cursor-not-allowed border-transparent",
          ].join(" ")}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-stone-700">
            {selected ? "in hand" : shown ? "relic" : "relic"}
          </p>
          {shown ? (
            <>
              <p className="mt-1 font-display text-base tracking-[0.12em] text-ember-300">
                {shown.name}
              </p>
              {/*
                Capitalised in the stylesheet, not in the data.

                These are enum values and they are lowercase everywhere they are
                stored, compared and hashed into a cache key. Capitalising the
                strings themselves would put display formatting into the thing the
                prompt is compiled from, so the presentation does it.
              */}
              <p className="mt-1 text-[11px] capitalize leading-relaxed text-stone-600">
                {shown.dna.element} · {shown.dna.temperament} · {shown.dna.condition}
              </p>
              <AttackBreakdown traits={traits} ceiling={ceiling} dim={!selected} />
            </>
          ) : (
            <>
              <p className="mt-1 font-display text-base tracking-[0.3em] text-stone-700">??????</p>
              <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
                Won by fighting, not chosen from a list
              </p>
            </>
          )}
        </button>

        {/*
          Only when there is a relic to explain. An empty slot has no reason for
          numbers it does not have.
        */}
        {shown && (
          <span className="absolute right-3 top-3">
            <InfoTip label={shown.name}>
              <span className="block text-stone-500">Why this weapon is the way it is.</span>

              <span className="mt-2 block space-y-1">
                <span className="flex justify-between gap-3">
                  <span className="text-stone-600">Forged from</span>
                  <span className="text-stone-300">{shown.dna.bossInfluence}</span>
                </span>
                <span className="flex justify-between gap-3">
                  <span className="text-stone-600">Element</span>
                  <span className="capitalize text-stone-300">{shown.dna.element}</span>
                </span>
                <span className="flex justify-between gap-3">
                  <span className="text-stone-600">Silhouette</span>
                  <span className="capitalize text-stone-300">{shown.dna.temperament}</span>
                </span>
                <span className="flex justify-between gap-3">
                  <span className="text-stone-600">Condition</span>
                  <span className="capitalize text-stone-300">{shown.dna.condition}</span>
                </span>
              </span>

              {/*
                What those four are actually worth, against a plain blade.
                
                The card shows the words and the damage, and nothing has ever
                connected the two: a player could read "shattered" and "brutal"
                for weeks without learning that one is worth a fifth more damage
                and the other trades quick attacks for heavy ones.
              */}
              <AttackNotes />

              {relicNotes.length > 0 && (
                <span className="mt-3 block border-t border-ash-800 pt-2">
                  <span className="block text-stone-600">Against a plain blade</span>
                  <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-stone-400">
                    {relicNotes.join(" · ")}
                  </span>
                </span>
              )}
            </InfoTip>
          </span>
        )}
        </div>
      </div>

      {/*
        No second viewport for the relic.
        The champion beside this panel is already holding whatever is selected,
        and a spinning copy of the same weapon was both redundant and a third
        WebGL context on one screen.
      */}

      {/* Switching between relics you have kept. */}
      {/* Only worth showing when there is a choice to make. With one relic it
          repeated the card directly above it. */}
      {owned.length > 1 && (
        <div className="mt-3">
          {/*
            A collection that grows without bound.

            One relic per boss cleared, and nothing is ever spent or discarded,
            so a player who keeps playing ends up with dozens. A wrapping row of
            every name was fine at two and would have been a wall at fifty.

            Newest first, because the relic you just forged is the one you came
            here to use, and the list is capped in height and scrolls rather than
            pushing the descend button off the screen.
          */}
          <div className="mb-2 flex items-baseline justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-stone-700">
            <span>your relics</span>
            <span>{owned.length}</span>
          </div>
          <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1">
            {byNewest.map((relic) => (
              <button
                key={relic.relicId}
                type="button"
                onClick={() => select(relic.relicId)}
                title={`${relic.dna.element} · ${relic.dna.temperament} · ${relic.dna.condition}`}
                className={[
                  "border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition",
                  selected?.relicId === relic.relicId
                    ? "border-ember-500/60 text-ember-300"
                    : "border-ash-800 text-stone-600 hover:border-stone-600",
                ].join(" ")}
              >
                {relic.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
