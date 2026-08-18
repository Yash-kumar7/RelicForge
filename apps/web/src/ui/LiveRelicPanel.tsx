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
  /* The boss actually being fought. This was hardcoded to the Ashen Warden, so
     the projection named the wrong enemy on every rung above the first. */
  const bossName = useGameStore((s) => s.boss().name);

  const projected = useMemo(
    () =>
      buildRelicDNA(
        {
          ...telemetry,
          affinity,
          healthRemaining: Math.round((playerHp / PLAYER_MAX_HP) * 100),
          fightDuration: fightStartedAt ? Math.round((Date.now() - fightStartedAt) / 1000) : 0,
        },
        bossName,
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
    /*
      Stacked above the player's own state, not marooned in the far corner.
      
      This sat at the top left while health, charges and dodge sat at the bottom
      left, so everything about the player was split across the full height of
      the screen. The health bars have already been brought into one band for
      the same reason: a fight is not the moment to make someone look in three
      places.
      
      Above health rather than below it, because it is glanced at between
      exchanges while health is watched continuously, and the thing watched
      continuously belongs nearest the bottom edge where the eye rests.
    */
    <div className="pointer-events-none absolute bottom-44 left-8 w-52 border border-ash-800 bg-black/40 p-4 backdrop-blur-sm">
      {/*
        Named for what it is, which is not what you are holding.
        
        This read "your weapon so far", and the fight also carries a "wielding"
        block in the opposite corner. Both sound like the sword in your hands, and
        nothing distinguished them: one is the weapon you brought, the other is
        the weapon this fight is building. "So far" made it worse by implying
        partial ownership of something that does not exist yet.
        
        "Your next weapon" says both halves at once — it is yours, and you do not
        have it. The line at the bottom then means what it says: these values move
        while you fight, so the thing you are about to own is being decided now.
      */}
      <p className="text-[9px] uppercase tracking-[0.3em] text-stone-600">Your next weapon</p>

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

      {/* Sentence case. This line is a sentence, unlike the labels above it,
          which are labels and stay uppercase. */}
      <p className="mt-3 border-t border-ash-800 pt-2 text-[9px] leading-relaxed text-stone-700">
        Decided by how you fight
      </p>
    </div>
  );
}
