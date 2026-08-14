import { BOSS_MAX_HP, PLAYER_MAX_HP, useGameStore } from "../state/useGameStore";

/** Minimal HUD. The relic should hold the frame, not the interface. */
export function Hud() {
  const phase = useGameStore((s) => s.phase);
  const playerHp = useGameStore((s) => s.playerHp);
  const bossHp = useGameStore((s) => s.bossHp);

  if (phase !== "FIGHTING" && phase !== "EQUIPPED") return null;

  const fighting = phase === "FIGHTING";

  return (
    <div className="pointer-events-none absolute inset-0">
      {fighting && (
        <>
          {/* Boss */}
          <div className="absolute left-1/2 top-8 w-[min(560px,70vw)] -translate-x-1/2">
            <div className="mb-1 text-center font-display text-xs uppercase tracking-[0.4em] text-stone-400">
              The Ashen Warden
            </div>
            <div className="h-[3px] w-full bg-ash-800">
              <div
                className="h-[3px] bg-ember-500 transition-[width] duration-200"
                style={{ width: `${(bossHp / BOSS_MAX_HP) * 100}%` }}
              />
            </div>
          </div>

          {/* Crosshair */}
          <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" />
        </>
      )}

      {/* Player */}
      <div className="absolute bottom-8 left-8 w-56">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-stone-600">
          Vitality
        </div>
        <div className="h-[3px] w-full bg-ash-800">
          <div
            className={
              playerHp <= 20
                ? "h-[3px] bg-red-500 transition-[width] duration-200"
                : "h-[3px] bg-stone-300 transition-[width] duration-200"
            }
            style={{ width: `${(playerHp / PLAYER_MAX_HP) * 100}%` }}
          />
        </div>
      </div>

      {fighting && (
        <div className="absolute bottom-8 right-8 text-right font-mono text-[10px] uppercase leading-relaxed tracking-[0.2em] text-stone-700">
          <div>WASD move · mouse look</div>
          <div>LMB light · RMB heavy</div>
          <div>Space dodge · Q heal</div>
        </div>
      )}
    </div>
  );
}
