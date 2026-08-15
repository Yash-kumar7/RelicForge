import { useMemo } from "react";
import { relicTraits, type RelicTraits } from "@relic/core";
import { championFor } from "../game/champions";
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
    blurb:
      "Ends before the boss can punish it. Lean on this and the forge reads you as elegant: a narrow, precise weapon.",
  },
  {
    kind: "heavy" as const,
    name: "Strong attack",
    button: "right click",
    blurb:
      "Staggers the boss, but commits you for longer than its wind-up lasts. Lean on this and the forge reads you as brutal: an oversized, heavy weapon.",
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

  // Derived from the same function the fight uses, so the panel cannot promise
  // a number the swing does not deliver.
  /*
   * Champion strength folded in, because this is now the only place damage
   * appears. A panel that showed weapon-only numbers while the fight applied
   * the champion on top would be quietly wrong for every champion but one.
   */
  const affinity = useGameStore((s) => s.affinity);
  const traits = useMemo(() => {
    // The iron sword is genuinely neutral, so it goes through the same path
    // rather than being special-cased into a second set of numbers.
    const base = relicTraits(selected?.dna);
    const champion = championFor(affinity).traits;
    return {
      ...base,
      lightDamage: base.lightDamage * champion.damage,
      heavyDamage: base.heavyDamage * champion.damage,
    };
  }, [selected, affinity]);

  // The iron blade is neutral, so it differs only by the champion holding it.
  const ironTraits = useMemo(() => {
    const base = relicTraits(null);
    const champion = championFor(affinity).traits;
    return {
      ...base,
      lightDamage: base.lightDamage * champion.damage,
      heavyDamage: base.heavyDamage * champion.damage,
    };
  }, [affinity]);


  return (
    <section>
      {/*
        "Armament" is the state field's name, not a word a player would reach
        for. The panel is about the thing in your hands, so it says so.
      */}
      <p className="text-[11px] uppercase tracking-[0.4em] text-stone-600">Your weapon</p>

      {/*
        Full-width rows, matching the element step.

        Two columns squeezed each attack description into a narrow strip, and
        those descriptions are the only thing on this screen that explains why a
        player would use one attack over the other.
      */}
      <div className="mt-4 flex flex-col gap-3">
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
            {selected ? "in hand" : "relic"}
          </p>
          {selected ? (
            <>
              <p className="mt-1 font-display text-base tracking-[0.12em] text-ember-300">
                {selected.name}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
                {selected.dna.element} · {selected.dna.temperament} · {selected.dna.condition}
              </p>
              <AttackBreakdown traits={traits} />
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
      {owned.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {owned.map((relic) => (
            <button
              key={relic.relicId}
              type="button"
              onClick={() => select(relic.relicId)}
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
      )}
    </section>
  );
}
