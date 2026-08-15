import { useEffect, useState } from "react";
import { fetchRelic } from "../lib/relicClient";
import { usePendingForge } from "../state/usePendingForge";
import { useLoadout } from "../state/useLoadout";
import { useProgress } from "../state/useProgress";

/**
 * A relic still being forged, waiting to be collected.
 *
 * Appears on the setup screen when the player left a forge running. It polls
 * rather than streaming: the forge is minutes long, the player is reading a
 * screen rather than watching a cinematic, and a held-open event stream buys
 * nothing at this granularity while costing a connection that has to survive
 * navigation.
 *
 * Claiming is deliberately manual. A relic that appeared in the collection on
 * its own would be the one moment of the game that happens without the player,
 * and the whole point is that it was earned.
 */

/** Slow enough to be free, fast enough that nobody sits looking at a stale strip. */
const POLL_MS = 4000;

export function PendingForgePanel() {
  const pending = usePendingForge((s) => s.pending);
  const settle = usePendingForge((s) => s.settle);
  const [ready, setReady] = useState<{ modelUrl: string; conceptUrl: string | null } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!pending) return undefined;

    let cancelled = false;
    const check = async () => {
      const relic = await fetchRelic(pending.relicId);
      if (cancelled || !relic) return;

      if (relic.status === "COMPLETE" && relic.modelUrl) {
        setReady({ modelUrl: relic.modelUrl, conceptUrl: relic.conceptUrl });
      } else if (relic.status === "FAILED") {
        setFailed(true);
      }
    };

    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pending]);

  if (!pending) return null;

  const claim = async () => {
    const relic = await fetchRelic(pending.relicId);
    if (!relic?.modelUrl || !relic.dna) return;

    // Paid here rather than at the end of the fight, for the same reason the
    // forge screen pays it on claim: experience is for a relic that exists.
    useProgress.getState().award({
      bossLevel: pending.bossLevel,
      healthRemaining: 100,
      dodges: 0,
      healingUsed: 1,
      forgedRelic: true,
    });
    useLoadout.getState().claim({
      relicId: relic.relicId,
      name: relic.name,
      dna: relic.dna,
      modelUrl: relic.modelUrl,
      conceptUrl: relic.conceptUrl,
      forgedMs: relic.totalMs,
      earnedAt: Date.now(),
      bossLevel: pending.bossLevel,
    });
    settle();
  };

  return (
    <div
      className={[
        "mb-5 border px-4 py-3",
        ready ? "border-ember-500/50 bg-ember-500/5" : "border-ash-700",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-stone-700">
            {failed ? "the forge failed" : ready ? "ready to claim" : "cooling in the forge"}
          </p>
          <p className="mt-1 truncate font-display text-sm tracking-[0.12em] text-ember-300">
            {pending.name}
          </p>
          {!ready && !failed && (
            <p className="mt-1 text-[10px] leading-relaxed text-stone-600">
              Still being forged. It keeps working while you play.
            </p>
          )}
        </div>

        {ready ? (
          <button
            type="button"
            onClick={() => void claim()}
            className="shrink-0 border border-ember-500/60 px-6 py-2 text-[10px] uppercase tracking-[0.3em] text-ember-300 transition hover:bg-ember-500/10"
          >
            Claim
          </button>
        ) : failed ? (
          <button
            type="button"
            onClick={settle}
            className="shrink-0 border border-stone-700 px-6 py-2 text-[10px] uppercase tracking-[0.3em] text-stone-500 transition hover:border-stone-500"
          >
            Dismiss
          </button>
        ) : (
          /* A shimmer rather than a percentage. The record carries mesh progress,
             but Meshy reports 0 to 10 percent for most of an image-to-3d run, so
             a number here would sit still and read as stuck. */
          <div className="h-px w-24 shrink-0 overflow-hidden bg-ash-800">
            <div className="h-px w-1/3 animate-pulse bg-ember-500/70" />
          </div>
        )}
      </div>
    </div>
  );
}
