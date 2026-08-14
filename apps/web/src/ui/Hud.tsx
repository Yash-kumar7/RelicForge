import { BOSS_MAX_HP, PLAYER_MAX_HP, useGameStore } from "../state/useGameStore";
import { themeFor } from "../game/theme";

/**
 * Minimal HUD. The relic should hold the frame, not the interface.
 *
 * Both bars carry a numeric percentage: health remaining is not decoration
 * here, it is the input that decides whether the relic comes out pristine,
 * battle-worn or shattered. A player choosing whether to push on at 22% needs
 * to know it is 22 and not "about a fifth".
 */
export function Hud() {
  const phase = useGameStore((s) => s.phase);
  const playerHp = useGameStore((s) => s.playerHp);
  const bossHp = useGameStore((s) => s.bossHp);
  const affinity = useGameStore((s) => s.affinity);
  const theme = themeFor(affinity);

  if (phase !== "FIGHTING" && phase !== "EQUIPPED") return null;

  const fighting = phase === "FIGHTING";
  const playerPct = Math.round((playerHp / PLAYER_MAX_HP) * 100);
  const bossPct = Math.ceil((bossHp / BOSS_MAX_HP) * 100);

  // The thresholds the relic actually keys off, surfaced so the player can see
  // which band they are about to fall into.
  const conditionBand =
    playerPct <= 20 ? "shattered" : playerPct <= 70 ? "battle-worn" : "pristine";

  return (
    <div className="pointer-events-none absolute inset-0">
      {fighting && (
        <>
          {/* Boss */}
          <div className="absolute left-1/2 top-8 w-[min(560px,70vw)] -translate-x-1/2">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="font-display text-xs uppercase tracking-[0.4em] text-stone-400">
                The Ashen Warden
              </span>
              <span className="font-mono text-xs tabular-nums text-stone-300">{bossPct}%</span>
            </div>
            <div className="h-[3px] w-full bg-ash-800">
              <div
                className="h-[3px] transition-[width] duration-200"
                style={{ width: `${(bossHp / BOSS_MAX_HP) * 100}%`, background: theme.forge }}
              />
            </div>
          </div>

          {/* Crosshair */}
          <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" />
        </>
      )}

      {/* Player */}
      <div className="absolute bottom-8 left-8 w-56">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-stone-600">
            Vitality
          </span>
          <span
            className={
              playerPct <= 20
                ? "font-mono text-xs tabular-nums text-red-400"
                : "font-mono text-xs tabular-nums text-stone-300"
            }
          >
            {playerPct}%
          </span>
        </div>
        <div className="h-[3px] w-full bg-ash-800">
          <div
            className={
              playerPct <= 20
                ? "h-[3px] bg-red-500 transition-[width] duration-200"
                : "h-[3px] bg-stone-300 transition-[width] duration-200"
            }
            style={{ width: `${playerPct}%` }}
          />
        </div>
        {fighting && (
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-stone-700">
            relic → {conditionBand}
          </p>
        )}
      </div>

      {fighting && (
        // Terse reminder only. The full control list lives in the briefing, so
        // repeating it here would compete with the live relic panel for
        // attention during the fight.
        <div className="absolute bottom-8 right-8 text-right font-mono text-[10px] uppercase leading-relaxed tracking-[0.2em] text-stone-700">
          <div>LMB light · RMB heavy</div>
          <div>Space dodge · Q heal</div>
        </div>
      )}
    </div>
  );
}
