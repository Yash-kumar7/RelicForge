import { useMemo } from "react";
import { buildRelicDNA } from "@relic/core";
import { PLAYER_MAX_HP, useGameStore } from "../state/useGameStore";

/**
 * The relic, forming live.
 *
 * This is the teaching device for the entire game. Telling a player "how you
 * fight shapes your weapon" is a claim they have no reason to believe; showing
 * the projected relic change from BALANCED to BRUTAL the moment they commit to
 * heavy attacks makes the mechanic self-evident without a tutorial.
 *
 * It runs the real buildRelicDNA against live telemetry, so what is shown here
 * is exactly what the forge will receive, not an approximation.
 */
export function LiveRelicPanel() {
  const phase = useGameStore((s) => s.phase);
  const telemetry = useGameStore((s) => s.telemetry);
  const affinity = useGameStore((s) => s.affinity);
  const playerHp = useGameStore((s) => s.playerHp);
  const fightStartedAt = useGameStore((s) => s.fightStartedAt);

  const projected = useMemo(
    () =>
      buildRelicDNA(
        {
          ...telemetry,
          affinity,
          healthRemaining: Math.round((playerHp / PLAYER_MAX_HP) * 100),
          fightDuration: fightStartedAt ? Math.round((Date.now() - fightStartedAt) / 1000) : 0,
        },
        "the Ashen Warden",
      ),
    [telemetry, affinity, playerHp, fightStartedAt],
  );

  if (phase !== "FIGHTING") return null;

  const accent =
    projected.element === "ice"
      ? "text-frost-300"
      : projected.element === "lightning"
        ? "text-amber-200"
        : "text-ember-300";

  return (
    <div className="pointer-events-none absolute left-8 top-8 w-52 border border-ash-800 bg-black/40 p-4 backdrop-blur-sm">
      <p className="text-[9px] uppercase tracking-[0.3em] text-stone-600">Your weapon so far</p>

      <dl className="mt-3 space-y-2 font-mono text-[10px] uppercase tracking-[0.15em]">
        {/*
          Labelled with what the line means, not with the field it came from.

          "form", "style" and "state" are the names of the DNA fields, and a
          player has no way to know that state is the wear on the weapon while
          style is its silhouette. These say it.
        */}
        {[
          ["element", projected.element],
          ["shape", projected.weaponClass],
          ["silhouette", projected.temperament],
          ["condition", projected.condition],
        ].map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between">
            <dt className="text-stone-700">{label}</dt>
            <dd className={accent}>{value}</dd>
          </div>
        ))}
      </dl>

      {projected.achievement && (
        <p className="mt-3 border-t border-ash-800 pt-2 text-[9px] uppercase tracking-[0.2em] text-ember-400">
          {projected.achievement}
        </p>
      )}

      <p className="mt-3 border-t border-ash-800 pt-2 text-[9px] leading-relaxed text-stone-700">
        changes as you fight
      </p>
    </div>
  );
}
