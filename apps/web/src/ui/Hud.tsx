import { useEffect, useState } from "react";
import { useGameStore } from "../state/useGameStore";
import { bossAt } from "../game/bosses";
import { accentFor, themeForBoss } from "../game/theme";
import { useLoadout } from "../state/useLoadout";
import { championFor } from "../game/champions";
import { bossSlug } from "./BossPortrait";
import { asset } from "../lib/backend";

/**
 * Minimal HUD. The relic should hold the frame, not the interface.
 *
 * Both bars carry a numeric percentage: health remaining is not decoration
 * here, it is the input that decides whether the relic comes out pristine,
 * battle-worn or shattered. A player choosing whether to push on at 22% needs
 * to know it is 22 and not "about a fifth".
 */
/** Dodge count plus a cooldown bar, so both the input and its recharge read. */
/**
 * How long this fight has been going, in the middle.
 *
 * The centre was empty and looked it, and before that it held both health totals
 * in digits — the worst option, since the bars either side already say that in
 * length. Time is the one thing they cannot carry.
 *
 * Deliberately just the elapsed count. A version of this flagged the forty-five
 * second mark that stamps SWIFT JUDGMENT on the relic, with a countdown beside
 * it, and that turned a quiet readout into a target and a scold: race it and the
 * fight is about the clock, miss it and the clock spends the rest of the fight
 * telling you so. The threshold still exists and the relic still records it. It
 * does not need to be sold mid-fight.
 *
 * Counts up. There is no time limit and a countdown promises one.
 *
 * Excludes paused time, from the same total the forge reads, so the number here
 * and the duration on the relic are the same number.
 */
function FightClock({ startedAt, pausedTotalMs }: { startedAt: number; pausedTotalMs: number }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const tick = () =>
      setSeconds(Math.max(0, Math.floor((Date.now() - startedAt - pausedTotalMs) / 1000)));
    tick();
    // Five times a second: on the second it visibly lags the moment it changes,
    // and per frame it would re-render the tree during combat.
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [startedAt, pausedTotalMs]);

  /*
   * Built like the two columns beside it, so it lines up with the bars.
   *
   * Centring this in the row put it at the row's midpoint, and each side of the
   * row is a name stacked over a bar — so the number sat between those two
   * things rather than level with either. It carries a spacer the height of a
   * name instead, which drops it onto the same line as the bars it sits between.
   */
  return (
    /*
      A fixed width, because the bars either side are flexible.
      
      This was px-2 and sized to its own digits, and Cinzel has no true tabular
      figures — so the clock changed width every second and the two flex-1 bars
      grew and shrank to fill what was left. The health bars appeared to breathe
      in time with the clock, which is the sort of thing that makes a player
      distrust every number on the screen.
      
      tabular-nums is still set below and still worth setting, but it is a request
      the typeface can decline. A fixed box cannot be declined.
    */
    <span className="flex w-24 shrink-0 flex-col justify-center gap-1.5">
      {/* Matches the name line on both sides. Non-breaking space, so it holds
          its height without rendering anything. */}
      <span className="block font-display text-[11px] leading-none tracking-[0.4em] text-transparent">
        &nbsp;
      </span>
      <span className="flex h-5 items-center justify-center font-display text-3xl tabular-nums leading-none text-stone-400">
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
      </span>
    </span>
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
  const fightStartedAt = useGameStore((s) => s.fightStartedAt);
  const pausedTotalMs = useGameStore((s) => s.pausedTotalMs);
  // A relic carried in from the loadout is in hand from the first frame, before
  // any forge has run this session.
  const carried = useLoadout((s) => s.equipped());
  /*
   * Always the loadout, now that claiming returns to the ladder.
   *
   * There used to be a branch for the freshly forged relic, because claiming
   * dropped the player back into the arena holding it before the loadout had
   * been read again. That state is gone: a claimed relic is in the loadout, and
   * the next fight is where it turns up.
   */
  const inHand = carried
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
  const bossTheme = themeForBoss(bossLevel ?? 1);
  const accent = accentFor(affinity);
  /* The champion's own name, because a bar facing a named boss should be named
     too. "Health" opposite "The Ashen Warden" is a field label against a
     character, and it made the fight look one-sided before it started. */
  const champion = championFor(affinity);

  // Deliberately absent during VICTORY, FORGING and DEFEAT: bars and control
  // hints over a cinematic read as leftover interface.
  if (phase !== "FIGHTING") return null;

  /*
   * Not up before the fight has begun.
   *
   * This was phase === "FIGHTING" alone, and the briefing runs inside that same
   * phase while waiting to be dismissed — so two health bars and a set of
   * portraits sat across the top of a screen whose whole job is to introduce the
   * boss, visible through it and belonging to nothing yet.
   *
   * fightStartedAt is what separates "not begun" from "paused mid-fight", which
   * is the same test the briefing itself uses. A pause keeps its HUD, because
   * the fight it describes is real by then.
   */
  const fighting = phase === "FIGHTING" && fightStartedAt !== null;
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
  // The name the briefing gave it, without the epithet. Two screens naming the
  // same boss differently reads as two different bosses.
  const bossName = bossAt(bossLevel ?? 1).title;

  /*
   * Attack damage is no longer read here.
   *
   * It was, and it had to be computed rather than quoted from the constants:
   * this said 25 and 60 while the briefing next door said 30 and 72 for the same
   * champion carrying the same blade, because the champion's traits scale both.
   *
   * The numbers left the HUD with the rest of the control list — they belong on
   * Tab, beside the weapon they describe, rather than in a corner during a
   * fight. carriedDamage is still the one place that computes them, and the
   * loadout and the briefing both read it.
   */

  /*
   * The condition band is not repeated here.
   *
   * It read "relic → pristine" one line under the health bar while the panel in
   * the opposite corner already had it under "state", so the same word appeared
   * twice on screen with different labels, one of them borrowed from the code.
   * The panel is the one that changes as you fight, so the panel keeps it.
   */

  return (
    <div className="pointer-events-none absolute inset-0">
      {fighting && (
        <>
          {/*
            One bar across the top, both halves of it, meeting in the middle.

            The two bars answer a single question — who is winning — and they
            used to sit at opposite ends of the screen's height, so answering it
            took two glances. This is the arcade fighter answer and it has
            survived thirty years because it takes one: equal halves at equal
            height, each draining inward, with the gap that opens between them
            doing the work of a score.

            Portraits at the outer ends, from the same cut-out concepts the title
            screen and the briefing use. They cost nothing, they were generated
            for this, and they turn two rectangles into two fighters.
          */}
          {/*
            Three things separate a fighting game bar from a progress bar, and
            none of them is the position.
            
            It is skewed. A rectangle is a readout; a parallelogram leaning
            toward the fight is a piece of the game's own drawing, and it costs
            one transform.
            
            It is heavy and it is lit. A flat fill of one colour reads as data.
            A gradient with a bright lip along the top edge reads as a physical
            thing with light falling on it, which is what makes damage look like
            it is being taken off something.
            
            And it is not neutral. Grey against the boss's orange said the boss
            was the only one with a colour. The player's half now carries their
            own element, so choosing fire and choosing ice look different in the
            fight and not just on the menu.
          */}
          <div className="absolute inset-x-8 top-5 flex items-stretch gap-4">
            {/*
              Cropped to the head, which is what a portrait is.

              These are full-body concept cut-outs, roughly seven heads tall, and
              dropped into a square frame at their own scale they showed a
              complete figure about eight pixels wide. A fighting game portrait is
              a face: it has to be recognisable at a glance while something is
              swinging at you.

              So the image is blown up to several times the frame and anchored
              near the top, and the frame clips the rest. The two numbers worth
              touching are the height and the offset — taller crops tighter, and
              the offset skips the empty margin these concepts carry above the
              head.
            */}
            {/*
              No frame and no plate behind it.
              
              A bordered square on a dark screen is a box with a person in it, and
              the two of them read as inventory slots rather than as fighters. The
              crop still has to be a rectangle, so its edges are faded out
              instead: the head is solid, the shoulders dissolve, and nothing
              draws a line around it.
            */}
            <span
              className="relative h-14 w-14 shrink-0 overflow-hidden"
              style={{
                maskImage:
                  "radial-gradient(ellipse 72% 78% at 50% 42%, #000 55%, transparent 100%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 72% 78% at 50% 42%, #000 55%, transparent 100%)",
              }}
            >
              <img
                src={asset(`/assets/champions/${champion.slug}/concept-cut.png`)}
                alt=""
                aria-hidden
                className="absolute left-1/2 top-[-6%] h-[520%] max-w-none -translate-x-1/2"
              />
            </span>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
              <span className="block font-display text-[11px] uppercase tracking-[0.4em] text-stone-300">
                {champion.name}
              </span>
              {/* Drains toward the centre, so the two retreat from each other. */}
              {/*
                Cut back toward the middle rather than skewed as a whole.
                
                A skew tilts the outer edge too, so the bar leaned away from the
                screen edge and left a wedge of nothing beside it. Clipping only
                the inner end keeps it square where it meets the frame and points
                it at the fight, which is the shape a fighting game uses and the
                reason those bars look aimed at each other.
              */}
              <div
                className="flex h-5 w-full bg-ash-900 ring-1 ring-ash-600"
                style={{ clipPath: "polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)" }}
              >
                <div
                  className="h-full border-t transition-[width] duration-200"
                  style={{
                    width: `${playerPct}%`,
                    background:
                      playerPct <= 20
                        ? "linear-gradient(180deg, #ff8f8f, #d81f1f)"
                        : `linear-gradient(180deg, ${accent.primary}, ${accent.primary}88)`,
                    borderTopColor: "rgba(255,255,255,0.55)",
                  }}
                />
              </div>
            </div>

            {/* Elapsed time. The bars either side carry health; this carries the
                one thing they cannot. */}
            {fightStartedAt !== null && (
              <FightClock startedAt={fightStartedAt} pausedTotalMs={pausedTotalMs} />
            )}

            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
              <span className="block text-right font-display text-[11px] uppercase tracking-[0.4em] text-stone-300">
                {bossName}
              </span>
              <div
                className="flex h-5 w-full bg-ash-900 ring-1 ring-ash-600"
                style={{ clipPath: "polygon(14px 0, 100% 0, 100% 100%, 0 100%)" }}
              >
                <div
                  className="ml-auto h-full border-t transition-[width] duration-200"
                  style={{
                    width: `${(bossHp / Math.max(1, bossMaxHp)) * 100}%`,
                    background: `linear-gradient(180deg, ${bossTheme.forge}, ${bossTheme.forge}77)`,
                    borderTopColor: "rgba(255,255,255,0.4)",
                  }}
                />
              </div>
            </div>

            <span
              className="relative h-14 w-14 shrink-0 overflow-hidden"
              style={{
                maskImage:
                  "radial-gradient(ellipse 72% 78% at 50% 42%, #000 55%, transparent 100%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 72% 78% at 50% 42%, #000 55%, transparent 100%)",
              }}
            >
              <img
                src={asset(`/assets/bosses/${bossSlug(bossName)}/concept-cut.png`)}
                alt=""
                aria-hidden
                /* Bosses are drawn taller and wider than champions, so the same
                   crop lands lower on them. */
                className="absolute left-1/2 top-[-4%] h-[460%] max-w-none -translate-x-1/2"
              />
            </span>
          </div>

          {/* Crosshair */}
          <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" />
        </>
      )}

      {/*
        No dodge readout.

        It existed because a dodge acknowledged nothing at all, and it earned its
        place then. It does not now: a running count is bookkeeping, and nobody
        makes a decision from "4". What the number was standing in for — six
        dodges pushing the relic toward elegant — is already on screen in the
        relic panel as the temperament changing, which is the consequence rather
        than the tally, and the only version of it a player can act on.

        The dodge itself still answers: a sound, i-frames, and the roll.
      */}

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
              legendary {inHand.weaponClass} · forged from a fight
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 font-display text-sm tracking-[0.15em] text-stone-400">
              Iron Arming Sword
            </p>
            {/* Just what it is. The Tab hint that used to be tacked on here
                predates the control line in the opposite corner, so the same key
                was being offered twice on one screen. */}
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-stone-700">
              common
            </p>
          </>
        )}
      </div>

      {fighting && (
        /*
         * One line, and only the keys nobody guesses.
         *
         * This was three lines, and with the loadout hint stacked under it the
         * corner carried five: attack damage, movement, dodge, heal, view,
         * loadout, debug. Every one of them was taught by the briefing about
         * thirty seconds earlier, and a control list is for what a player needs
         * in the next ten seconds rather than a copy of the manual.
         *
         * WASD, space and left click are conventions nobody needs reminding of.
         * The two damage numbers matter and they live on TAB, next to the weapon
         * they belong to. What is left is the pair a player would not find on
         * their own.
         *
         * P freezes the fight for a screenshot and stays unlisted: it was added
         * to photograph this game, not to play it.
         */
        <div className="absolute bottom-8 right-8 text-right font-mono text-[10px] uppercase tracking-[0.2em] text-stone-700">
          Tab loadout · V view
        </div>
      )}
    </div>
  );
}
