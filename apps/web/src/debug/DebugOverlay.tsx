import { useCallback, useEffect, useState } from "react";
import { useGameStore } from "../state/useGameStore";

/**
 * Backtick-toggled diagnostics.
 *
 * Hidden by default because the player-facing experience should never look like
 * an API playground — but the numbers here are what the write-up is built from,
 * and having them in-game beats reading server logs during a recording.
 */

interface DebugRelic {
  relicId: string;
  name: string;
  status: string;
  mode: string;
  cacheKey: string;
  prompt: string;
  conceptMs: number | null;
  meshMs: number | null;
  optimizeMs: number | null;
  totalMs: number | null;
  glbBytes: number | null;
  rawGlbBytes: number | null;
  error: string | null;
}

const ms = (v: number | null) => (v === null ? "—" : `${(v / 1000).toFixed(1)}s`);
const mb = (v: number | null) => (v === null ? "—" : `${(v / 1048576).toFixed(2)}MB`);

export function DebugOverlay() {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [relics, setRelics] = useState<DebugRelic[]>([]);
  const forge = useGameStore((s) => s.forge);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/debug/relics");
      const data = (await res.json()) as { balance: number; relics: DebugRelic[] };
      setBalance(data.balance);
      setRelics(data.relics.slice(0, 8));
    } catch {
      /* server may not be up; the overlay is diagnostics, never load-bearing */
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Backquote") return;
      setOpen((prev) => {
        if (!prev) void refresh();
        return !prev;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refresh]);

  // Refresh while a forge is running so timings appear as they land.
  useEffect(() => {
    if (!open || forge.stage === "COMPLETE" || forge.stage === "IDLE") return undefined;
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [open, forge.stage, refresh]);

  if (!open) {
    return (
      <div className="pointer-events-none absolute bottom-2 right-2 font-mono text-[9px] uppercase tracking-widest text-stone-800">
        ` debug
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-black/92 p-6 font-mono text-[11px] text-stone-400">
      <div className="mb-4 flex items-baseline justify-between">
        <span className="uppercase tracking-[0.3em] text-ember-400">diagnostics</span>
        <span className="text-stone-600">
          balance {balance ?? "—"} · ` to close
        </span>
      </div>

      {/* Live forge state */}
      <section className="mb-6 border border-ash-800 p-4">
        <h3 className="mb-2 uppercase tracking-[0.2em] text-stone-500">current run</h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 md:grid-cols-4">
          {[
            ["stage", forge.stage],
            ["relic", forge.name ?? "—"],
            ["mesh %", String(forge.meshPercent)],
            ["cached", String(forge.cached)],
            ["class", forge.dna?.weaponClass ?? "—"],
            ["element", forge.dna?.element ?? "—"],
            ["temperament", forge.dna?.temperament ?? "—"],
            ["condition", forge.dna?.condition ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-ash-900 py-0.5">
              <span className="text-stone-700">{k}</span>
              <span className="text-stone-300">{v}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Generation history — the numbers the write-up quotes. */}
      <section>
        <h3 className="mb-2 uppercase tracking-[0.2em] text-stone-500">relics</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="text-left text-stone-700">
                {["name", "status", "mode", "concept", "mesh", "opt", "total", "raw", "final"].map(
                  (h) => (
                    <th key={h} className="border-b border-ash-800 pb-1 pr-4 font-normal uppercase">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {relics.map((r) => (
                <tr key={r.relicId} className="align-top">
                  <td className="py-1 pr-4 text-stone-300">{r.name}</td>
                  <td
                    className={
                      r.status === "COMPLETE"
                        ? "py-1 pr-4 text-emerald-500"
                        : r.status === "FAILED"
                          ? "py-1 pr-4 text-red-400"
                          : "py-1 pr-4 text-amber-400"
                    }
                  >
                    {r.status}
                  </td>
                  <td className="py-1 pr-4">{r.mode}</td>
                  <td className="py-1 pr-4">{ms(r.conceptMs)}</td>
                  <td className="py-1 pr-4">{ms(r.meshMs)}</td>
                  <td className="py-1 pr-4">{r.optimizeMs === null ? "—" : `${r.optimizeMs}ms`}</td>
                  <td className="py-1 pr-4 text-stone-300">{ms(r.totalMs)}</td>
                  <td className="py-1 pr-4">{mb(r.rawGlbBytes)}</td>
                  <td className="py-1 pr-4 text-stone-300">{mb(r.glbBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {relics[0] && (
        <section className="mt-6 border border-ash-800 p-4">
          <h3 className="mb-2 uppercase tracking-[0.2em] text-stone-500">
            latest prompt · {relics[0].cacheKey}
          </h3>
          <p className="leading-relaxed text-stone-600">{relics[0].prompt}</p>
        </section>
      )}
    </div>
  );
}
