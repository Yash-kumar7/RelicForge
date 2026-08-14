import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "../state/useGameStore";
import { useLoadout } from "../state/useLoadout";
import { themeFor } from "../game/theme";
import { bossAt } from "../game/bosses";

/**
 * Loadout, hold TAB.
 *
 * Two slots, and the second one is the point. Your starting blade is fully
 * specified: iron, 25/60 damage, mass-produced, one of thousands. The relic
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
  const owned = useLoadout((s) => s.owned);
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

  const inWorld = phase === "FIGHTING" || phase === "EQUIPPED" || phase === "FORGING";
  if (!inWorld) return null;

  // Narrowed into a concrete shape so the panel cannot render a half-forged
  // relic with a null name.
  const earned =
    forge.stage === "COMPLETE" && forge.name && forge.dna
      ? { name: forge.name, dna: forge.dna }
      : null;
  const boss = bossAt(bossLevel);

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
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-stone-600">
                  level {boss.level} · {boss.title}
                </span>
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
                    {[
                      ["light", "25 dmg"],
                      ["heavy", "60 dmg"],
                      ["origin", "loot table"],
                      ["unique", "no"],
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
                          ["unique", "one of one"],
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
                          <dt className="uppercase tracking-[0.15em] text-stone-700">unique</dt>
                          <dd className="text-stone-500">one of one</dd>
                        </div>
                      </dl>
                    </>
                  )}
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
