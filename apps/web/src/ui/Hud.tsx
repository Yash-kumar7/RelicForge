import { PLAYER_MAX_HP, useGameStore } from "../state/useGameStore";
import { bossTitleFor } from "../game/bosses";
import { accentFor, themeForBoss } from "../game/theme";
import { useLoadout } from "../state/useLoadout";

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
  const bossMaxHp = useGameStore((s) => s.bossMaxHp);
  const bossLevel = useGameStore((s) => s.bossLevel);
  const affinity = useGameStore((s) => s.affinity);
  const forge = useGameStore((s) => s.forge);
  // A relic carried in from the loadout is in hand from the first frame, before
  // any forge has run this session.
  const carried = useLoadout((s) => s.equipped());
  const inHand =
    phase === "EQUIPPED" && forge.name
      ? { name: forge.name, weaponClass: forge.dna?.weaponClass ?? null }
      : carried
        ? { name: carried.name, weaponClass: carried.dna.weaponClass }
        : null;
  const bossTheme = themeForBoss(bossLevel ?? 1);
  const accent = accentFor(affinity);

  if (phase !== "FIGHTING" && phase !== "EQUIPPED") return null;

  const fighting = phase === "FIGHTING";
  const playerPct = Math.round((playerHp / PLAYER_MAX_HP) * 100);
  const bossPct = Math.ceil((bossHp / Math.max(1, bossMaxHp)) * 100);
  const bossName = bossTitleFor(bossLevel ?? 1, affinity);

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
                {bossName}
              </span>
              <span className="font-mono text-xs tabular-nums text-stone-300">{bossPct}%</span>
            </div>
            <div className="h-[3px] w-full bg-ash-800">
              <div
                className="h-[3px] transition-[width] duration-200"
                style={{ width: `${(bossHp / Math.max(1, bossMaxHp)) * 100}%`, background: bossTheme.forge }}
              />
            </div>
          </div>

          {/* Crosshair */}
          <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" />
        </>
      )}

      {/* Player */}
      <div className="absolute bottom-28 left-8 w-56">
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

      {/* What you are actually holding. Before the forge it is the plain iron
          blade; afterwards it is the relic you just earned, named. Without
          this the weapon in your hands is never identified anywhere on screen
          outside the loadout panel. */}
      <div className="absolute bottom-8 left-8 mt-4 w-56 border-t border-ash-800 pt-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-stone-700">wielding</p>
        {inHand ? (
          <>
            <p
              className="mt-1 font-display text-sm tracking-[0.18em]"
              style={{ color: accent.primary }}
            >
              {inHand.name.toUpperCase()}
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-stone-600">
              legendary {inHand.weaponClass} · one of one
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 font-display text-sm tracking-[0.15em] text-stone-400">
              Iron Arming Sword
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-stone-700">
              common · tab for loadout
            </p>
          </>
        )}
      </div>

      {fighting && (
        // Terse reminder only. The full control list lives in the briefing, so
        // repeating it here would compete with the live relic panel for
        // attention during the fight.
        <div className="absolute bottom-8 right-8 text-right font-mono text-[10px] uppercase leading-relaxed tracking-[0.2em] text-stone-700">
          <div>LMB light · RMB heavy</div>
          <div>Space dodge · Q heal</div>
          <div>V view</div>
        </div>
      )}
    </div>
  );
}
