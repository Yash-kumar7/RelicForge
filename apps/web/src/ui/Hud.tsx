import { useEffect, useState } from "react";
import { useGameStore } from "../state/useGameStore";
import { bossTitleFor } from "../game/bosses";
import { accentFor, themeForBoss } from "../game/theme";
import { useLoadout } from "../state/useLoadout";
import { COMBAT } from "../game/combat";
import { lastDodge } from "../game/feedback";

/**
 * Minimal HUD. The relic should hold the frame, not the interface.
 *
 * Both bars carry a numeric percentage: health remaining is not decoration
 * here, it is the input that decides whether the relic comes out pristine,
 * battle-worn or shattered. A player choosing whether to push on at 22% needs
 * to know it is 22 and not "about a fifth".
 */
/** Dodge count plus a cooldown bar, so both the input and its recharge read. */
function DodgeReadout({ count }: { count: number }) {
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 80);
    return () => clearInterval(timer);
  }, []);

  const since = now - lastDodge.at;
  const cooling = lastDodge.at > 0 && since < COMBAT.player.dodgeCooldownMs;
  const ready = cooling ? since / COMBAT.player.dodgeCooldownMs : 1;

  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between font-mono text-[9px] uppercase tracking-[0.2em]">
        <span className="text-stone-700">dodges</span>
        <span className={cooling ? "text-stone-600" : "text-stone-300"}>{count}</span>
      </div>
      <div className="mt-1 h-[2px] w-full bg-ash-800">
        <div
          className={cooling ? "h-[2px] bg-stone-600" : "h-[2px] bg-frost-400"}
          style={{ width: `${Math.min(100, ready * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function Hud() {
  const phase = useGameStore((s) => s.phase);
  const playerHp = useGameStore((s) => s.playerHp);
  const playerMaxHp = useGameStore((s) => s.playerMaxHp);
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
  /**
   * Every hook runs before the early return, without exception.
   *
   * A hook added below the return crashed the entire tree the instant the
   * player won: while fighting the return did not fire so the hook ran, and at
   * VICTORY it fired first, so React saw fewer hooks than the previous render
   * and threw. The forge never started, and a won fight produced no relic at
   * all. This is the one ordering in the file that must not be broken.
   */
  const telemetry = useGameStore((s) => s.telemetry);
  const bossTheme = themeForBoss(bossLevel ?? 1);
  const accent = accentFor(affinity);

  // Deliberately absent during VICTORY, FORGING and DEFEAT: bars and control
  // hints over a cinematic read as leftover interface.
  if (phase !== "FIGHTING" && phase !== "EQUIPPED") return null;

  const fighting = phase === "FIGHTING";
  // Against the champion's own maximum, not the base constant: a Frost run has
  // 125 health, and dividing by 100 would show a full bar reading 125%.
  /*
   * The bars still work in proportion, because that is what a bar is for. The
   * text beside them reports real values: a percentage tells you how far along
   * you are, a number tells you how many more hits you can take, and only one
   * of those is a decision you can act on.
   */
  // Still used for the bar width and for the condition band, which is a
  // threshold on a proportion rather than on a raw value.
  const playerPct = Math.round((playerHp / playerMaxHp) * 100);
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
              <span className="font-mono text-xs tabular-nums text-stone-300">
                {Math.ceil(bossHp)} / {bossMaxHp}
              </span>
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
            {Math.ceil(playerHp)} / {playerMaxHp}
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
          <>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-stone-700">
              relic → {conditionBand}
            </p>
            {/* Dodge had no readout, so a player could not tell whether it had
                registered at all, and it is one of the inputs that decides the
                relic. */}
            <DodgeReadout count={telemetry.dodges} />
          </>
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
          {/* Numbers, not just bindings: the difference between the attacks is
              the point, and it decides the shape of the relic. */}
          <div>
            LMB light {COMBAT.lightAttack.damage} · RMB heavy {COMBAT.heavyAttack.damage}
          </div>
          <div>Space jump · Shift dodge · Q heal</div>
          <div>V view</div>
        </div>
      )}
    </div>
  );
}
