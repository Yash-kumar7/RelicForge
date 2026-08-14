import { useMemo } from "react";
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

  return (
    <section>
      <p className="text-[11px] uppercase tracking-[0.4em] text-stone-600">Your armament</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
            25 light · 60 heavy · one of eleven million
          </p>
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
