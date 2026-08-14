import { useCallback, useEffect } from "react";
import { useGameStore } from "../state/useGameStore";

/**
 * Pointer lock is the fight.
 *
 * Escape releases the cursor, which means the player can no longer look or
 * aim, so the boss must stop too. Without this, walking away mid-fight comes
 * back to a corpse, and the relic that gets forged is a record of a fight the
 * player was not present for.
 */
export function PauseOverlay() {
  const phase = useGameStore((s) => s.phase);
  const combatActive = useGameStore((s) => s.combatActive);
  const fightStartedAt = useGameStore((s) => s.fightStartedAt);
  const pauseCombat = useGameStore((s) => s.pauseCombat);
  const armCombat = useGameStore((s) => s.armCombat);

  useEffect(() => {
    const onLockChange = () => {
      if (document.pointerLockElement) return;
      if (useGameStore.getState().phase === "FIGHTING") pauseCombat();
    };
    document.addEventListener("pointerlockchange", onLockChange);
    return () => document.removeEventListener("pointerlockchange", onLockChange);
  }, [pauseCombat]);

  const resume = useCallback(() => {
    const canvas = document.querySelector("canvas");
    if (canvas) void canvas.requestPointerLock();
    armCombat();
  }, [armCombat]);

  // Only a fight already under way can be paused, before the first arm the
  // briefing owns the screen instead.
  const paused = phase === "FIGHTING" && !combatActive && fightStartedAt !== null;
  if (!paused) return null;

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={resume}
    >
      <p className="font-display text-3xl tracking-[0.3em] text-stone-400">PAUSED</p>
      <p className="mt-4 text-xs uppercase tracking-[0.35em] text-stone-600">
        click to resume · the Warden waits
      </p>
    </div>
  );
}
