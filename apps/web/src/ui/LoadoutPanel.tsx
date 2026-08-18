import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "../state/useGameStore";
import { useLoadout } from "../state/useLoadout";
import { themeFor } from "../game/theme";
import { bossAt } from "../game/bosses";
import { rankFor, useProgress } from "../state/useProgress";
import { carriedDamage } from "../game/equipped";
import { championFor } from "../game/champions";

/**
 * Loadout, hold TAB.
 *
 * Two slots, and the second one is the point. Your starting blade is fully
 * specified: iron, mass-produced, one of thousands. The relic
 * slot shows `??????` because the weapon that fills it does not exist yet and
 * cannot be looked up, it will be generated from the fight you are currently
 * having.
 *
 * Once earned it persists, so the slot is a record of runs rather than a
 * session-scoped prop.
 */
export function LoadoutPanel() {
  const [open, setOpen] = useState(false);
  const phase = useGameStore((s) => s.phase);
  const affinity = useGameStore((s) => s.affinity);
  const bossLevel = useGameStore((s) => s.bossLevel);
  const forge = useGameStore((s) => s.forge);
  /*
   * What this loadout actually deals, which is the relic and the champion
   * together. The iron sword is the no-relic case, so it still lands here.
   */
  const carried = useLoadout((s) => s.equipped());
  const damage = carriedDamage(carried?.dna, affinity);
  const owned = useLoadout((s) => s.owned);
  const xp = useProgress((s) => s.xp);
  const fightsWon = useProgress((s) => s.fightsWon);
  const fightsLost = useProgress((s) => s.fightsLost);
  const rank = rankFor(xp);
  const theme = themeFor(affinity);
  const pauseCombat = useGameStore((s) => s.pauseCombat);

  /**
   * The fight stops while this is open.
   *
   * It did not, and the boss went on swinging at a player who was reading. This
   * is a reference screen — what you are carrying, what it does, where you are on
   * the ladder — and none of it is a tactical decision made under pressure. Being
   * hit for looking at it is a punishment for using the interface.
   *
   * Held rather than toggled, so it cannot be left open to stall a fight, and it
   * reuses the same pause the escape key uses: pausedTotalMs already excludes
   * paused time from the fight duration the forge reads, so a long look at the
   * loadout cannot forge a faster relic than it earned.
   */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Tab") {
        e.preventDefault();
        setOpen(true);
        if (useGameStore.getState().phase === "FIGHTING") pauseCombat();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Tab") {
        setOpen(false);
        const state = useGameStore.getState();
        // Only if this pause was ours. Escape may have paused it first, and that
        // one is dismissed deliberately rather than by letting go of a key.
        if (state.phase === "FIGHTING" && !state.photoMode) state.armCombat();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [pauseCombat]);

  const inWorld = phase === "FIGHTING" || phase === "FORGING";
  if (!inWorld) return null;

  // Narrowed into a concrete shape so the panel cannot render a half-forged
  // relic with a null name.
  const earned =
    forge.stage === "COMPLETE" && forge.name && forge.dna
      ? { name: forge.name, dna: forge.dna }
      : null;
  const boss = bossAt(bossLevel ?? 1);

  return (
    <>
      {/* No standalone hint any more: the HUD's one control line names Tab
          beside V, so this had become the same sentence twice in one corner. */}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <div className="w-[min(860px,90vw)]">
              <div className="mb-6 flex items-baseline justify-between border-b border-ash-800 pb-3">
                <h2 className="font-display text-xl tracking-[0.3em] text-stone-300">LOADOUT</h2>
                <div className="text-right">
                  <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ember-400">
                    {rank.name}
                  </span>
                  <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.25em] text-stone-600">
                    level {boss.level} · {boss.title}
                  </span>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Slot 1, what you brought. */}
                <div className="border border-ash-800 bg-ash-900/70 p-5">
                  {/*
                    Named, because the numbers below it are not the weapon's.
                    
                    A champion multiplies what it carries, so the same relic
                    reads 36 in Ember's hands and 24 in Frost's. Shown without
                    saying whose hands, that looks like the weapon changing by
                    itself, which is the one thing it must never look like on the
                    screen that exists to compare weapons.
                  */}
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-stone-600">
                    equipped · as {championFor(affinity).name}
                  </p>
                  <h3 className="mt-2 font-display text-2xl tracking-[0.1em] text-stone-300">
                    Iron Arming Sword
                  </h3>
                  <p className="mt-1 text-[11px] italic text-stone-600">
                    Standard issue. Eleven million identical copies.
                  </p>

                  <dl className="mt-5 space-y-1.5 font-mono text-[11px]">
                    {/* From the same place the fight gets them. These were
                        typed in as "25 dmg" and "60 dmg", so the panel reported
                        the same numbers for every champion carrying every
                        weapon, and disagreed with both the briefing and the
                        damage actually being dealt. */}
                    {[
                      ["left click", `${damage.light} damage`],
                      ["right click", `${damage.heavy} damage`],
                      /*
                       * Two rows removed here, not renamed.
                       *
                       * They read "origin · loot table" and "made from · nothing
                       * you did". The first is genre vocabulary that only makes
                       * sense to someone who has read about games rather than
                       * played this one, and it is the exact kind of word this
                       * interface has been cleared of everywhere else. The second
                       * is a riddle at the player's expense: they are holding it,
                       * and being told it represents nothing they did is a
                       * put-down dressed as a stat.
                       *
                       * What both were reaching for is already said, better and
                       * once, in the line above: standard issue, eleven million
                       * identical copies. The contrast with a relic is the whole
                       * game and it does not need saying three times on one card.
                       */
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-ash-800/60 pb-1">
                        <dt className="uppercase tracking-[0.15em] text-stone-700">{k}</dt>
                        <dd className="text-stone-400">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                {/* Slot 2, what does not exist yet. */}
                <div
                  className="border bg-ash-900/70 p-5"
                  style={{ borderColor: earned ? theme.forge : "#2a2622" }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-stone-600">
                    relic slot
                  </p>

                  {earned ? (
                    <>
                      <h3
                        className="mt-2 font-display text-2xl tracking-[0.1em]"
                        style={{ color: theme.forge }}
                      >
                        {earned.name.toUpperCase()}
                      </h3>
                      <p className="mt-1 text-[11px] italic text-stone-500">
                        Forged from your victory over {boss.name}.
                      </p>
                      <dl className="mt-5 space-y-1.5 font-mono text-[11px]">
                        {[
                          ["class", earned.dna?.weaponClass ?? "-"],
                          ["element", earned.dna?.element ?? "-"],
                          ["temperament", earned.dna?.temperament ?? "-"],
                          ["condition", earned.dna?.condition ?? "-"],
                          ["made from", "how you fought"],
                        ].map(([k, v]) => (
                          <div key={k} className="flex justify-between border-b border-ash-800/60 pb-1">
                            <dt className="uppercase tracking-[0.15em] text-stone-700">{k}</dt>
                            {/* Same treatment as the weapon step: these are enum
                                values, lowercase where they are stored and hashed,
                                and capitalised only where they are read. */}
                            <dd className="capitalize text-stone-300">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  ) : (
                    <>
                      <h3 className="mt-2 font-display text-2xl tracking-[0.35em] text-stone-700">
                        ??????
                      </h3>
                      <p className="mt-1 text-[11px] italic text-stone-600">
                        This weapon does not exist yet.
                      </p>
                      <dl className="mt-5 space-y-1.5 font-mono text-[11px]">
                        {["class", "element", "temperament", "condition"].map((k) => (
                          <div key={k} className="flex justify-between border-b border-ash-800/60 pb-1">
                            <dt className="uppercase tracking-[0.15em] text-stone-700">{k}</dt>
                            <dd className="text-stone-700">decided by how you fight</dd>
                          </div>
                        ))}
                        <div className="flex justify-between border-b border-ash-800/60 pb-1">
                          <dt className="uppercase tracking-[0.15em] text-stone-700">made from</dt>
                          <dd className="text-stone-500">how you fight</dd>
                        </div>
                      </dl>
                    </>
                  )}
                </div>
              </div>

              {/* Rank. Cosmetic on purpose: XP buys no damage, because the
                  moment progression gates power the relic stops being a record
                  of one fight and becomes a reward for grinding. */}
              <div className="mt-6 border border-ash-800 p-4">
                <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.2em]">
                  <span className="text-stone-500">{rank.name}</span>
                  <span className="text-stone-700">
                    {rank.next === null ? `${xp} xp · max rank` : `${xp} / ${rank.next} xp`}
                  </span>
                </div>
                <div className="mt-2 h-[2px] w-full bg-ash-800">
                  <div
                    className="h-[2px] bg-ember-500"
                    style={{
                      width: `${rank.next === null ? 100 : Math.min(100, (rank.into / rank.span) * 100)}%`,
                    }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 font-mono text-[10px] uppercase tracking-[0.15em]">
                  {[
                    ["won", String(fightsWon)],
                    ["lost", String(fightsLost)],
                    ["forged", String(owned.length)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-stone-700">{k}</span>
                      <span className="text-stone-400">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/*
                The controls, on the screen a player opens when they have
                forgotten one.
                
                The fight used to list them in a corner, three lines of it, next
                to a fourth line pointing here. That is a manual pinned to the
                windscreen: it is in the way exactly when there is no time to read
                it, and absent from the one screen whose whole purpose is to be
                read. They live here now, and the fight names only Tab and V.
                
                Held open, and the fight is paused while it is, so looking
                something up costs nothing.
              */}
              <div className="mt-6 border border-ash-800 p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-stone-700">
                  controls
                </p>
                <div className="mt-3 grid gap-x-8 gap-y-1.5 font-mono text-[10px] uppercase tracking-[0.15em] sm:grid-cols-3">
                  {[
                    ["wasd", "walk"],
                    ["space", "jump"],
                    ["shift", "dodge"],
                    ["left click", "quick attack"],
                    ["right click", "strong attack"],
                    ["q", "heal, twice"],
                    ["mouse", "aim"],
                    ["v", "change view"],
                    ["tab", "this screen"],
                  ].map(([key, does]) => (
                    <div key={key} className="flex items-baseline justify-between gap-3">
                      <span className="border border-ash-800 px-1.5 py-0.5 text-stone-500">
                        {key}
                      </span>
                      <span className="text-stone-600">{does}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Everything earned so far, across every run. */}
              {owned.length > 0 && (
                <div className="mt-6">
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-stone-700">
                    relics you have kept · {owned.length}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {owned.map((relic) => (
                      <span
                        key={relic.relicId}
                        className="border border-ash-800 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-stone-500"
                      >
                        {relic.name}
                        <span className="ml-2 text-stone-700">{relic.dna.weaponClass}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
