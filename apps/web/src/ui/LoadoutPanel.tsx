import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "../state/useGameStore";
import { useLoadout } from "../state/useLoadout";
import { themeFor } from "../game/theme";
import { bossAt } from "../game/bosses";
import { rankFor, useProgress } from "../state/useProgress";
import { carriedDamage } from "../game/equipped";

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

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Tab") {
        e.preventDefault();
        setOpen(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Tab") setOpen(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

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
      {!open && (
        <div className="pointer-events-none absolute right-8 top-8 font-mono text-[10px] uppercase tracking-[0.25em] text-stone-700">
          tab · loadout
        </div>
      )}

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
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-stone-600">
                    equipped
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
                      ["origin", "loot table"],
                      ["copies", "eleven million"],
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
                          ["copies", "none, ever"],
                        ].map(([k, v]) => (
                          <div key={k} className="flex justify-between border-b border-ash-800/60 pb-1">
                            <dt className="uppercase tracking-[0.15em] text-stone-700">{k}</dt>
                            <dd className="text-stone-300">{v}</dd>
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
                          <dt className="uppercase tracking-[0.15em] text-stone-700">copies</dt>
                          <dd className="text-stone-500">none, ever</dd>
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
