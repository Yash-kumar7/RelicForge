import { useMemo } from "react";
import { type RelicTraits } from "@relic/core";
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
    button: "left click",
    /* The tactical half only. What leaning on it forges is behind the mark on
       the heading, since it is a consequence rather than a reason to press it. */
    blurb: "Ends before the boss can punish it.",
  },
  {
    kind: "heavy" as const,
    name: "Strong attack",
    button: "right click",
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
function AttackBreakdown({ traits }: { traits: RelicTraits }) {
  const light = attackSpec("light", traits);
  const heavy = attackSpec("heavy", traits);

  return (
    <span className="mt-3 block space-y-3 border-t border-ash-800 pt-3">
      {ATTACKS.map((attack) => {
        const spec = attack.kind === "heavy" ? heavy : light;
        return (
          <span key={attack.kind} className="block">
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-display text-sm tracking-[0.1em] text-stone-300">
                {attack.name}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-stone-600">
                {attack.button}
              </span>
            </span>
            <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-ember-300/80">
              {spec.damage} damage
            </span>
            <span className="mt-1 block text-[10px] leading-relaxed text-stone-600">
              {attack.blurb}
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
      <div className="mt-5 flex flex-col gap-5">
        {/* The blade you always have. Selecting it unequips the relic. */}
        <button
          type="button"
          onClick={() => select(IRON)}
          className={[
            "border px-4 py-3 text-left transition",
            ironChosen
              ? "border-stone-500 bg-stone-500/5"
              : "border-ash-700 hover:border-stone-600",
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
          {ironChosen && <AttackBreakdown traits={ironTraits} />}
        </button>

        {/* Earned, or an honest empty state. */}
        <button
          type="button"
          disabled={owned.length === 0}
          onClick={() => owned[0] && select(owned[0].relicId)}
          className={[
            "px-4 py-3 text-left transition",
            selected
              ? "border border-ember-500/50 bg-ember-500/5"
              : owned.length > 0
                ? "border border-ash-700 hover:border-ember-500/40"
                : "cursor-not-allowed border border-dashed border-ash-700",
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
              <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
                {shown.dna.element} · {shown.dna.temperament} · {shown.dna.condition}
              </p>
              {selected && <AttackBreakdown traits={traits} />}
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
