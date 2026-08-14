import { useEffect, useState } from "react";
import { BOSSES, isUnlocked } from "../game/bosses";

/**
 * The ladder, as pictures.
 *
 * Uses each boss's own generated concept art, which is the honest illustration:
 * the same image that produced the mesh you fight. Locked bosses are blurred
 * and unnamed, so the gallery reads as a promise rather than a spoiler.
 *
 * Renders nothing when no art exists, so a fresh clone with an empty storage
 * directory still shows a clean title screen.
 */

function slugFor(title: string): string {
  return title.toLowerCase().replace(/^the /, "").replace(/\s+/g, "-");
}

export function BossGallery() {
  const [available, setAvailable] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      BOSSES.map(async (boss) => {
        const slug = slugFor(boss.title);
        try {
          const res = await fetch(`/assets/bosses/${slug}/concept.png`, { method: "HEAD" });
          return res.ok ? slug : null;
        } catch {
          return null;
        }
      }),
    ).then((slugs) => {
      if (!cancelled) setAvailable(slugs.filter((s): s is string => s !== null));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (available.length === 0) return null;

  return (
    <div className="w-full max-w-4xl px-8">
      <p className="mb-3 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-stone-700">
        five bosses · each forges a different weapon
      </p>

      <div className="grid grid-cols-5 gap-2">
        {BOSSES.map((boss) => {
          const slug = slugFor(boss.title);
          const hasArt = available.includes(slug);
          const unlocked = isUnlocked(boss.level);

          return (
            <div
              key={boss.level}
              className="group relative aspect-[3/4] overflow-hidden border border-ash-800 bg-ash-900"
            >
              {hasArt && (
                <img
                  src={`/assets/bosses/${slug}/concept.png`}
                  alt={unlocked ? boss.title : "Unknown boss"}
                  loading="lazy"
                  className={
                    unlocked
                      ? "h-full w-full object-cover opacity-70 transition duration-500 group-hover:scale-105 group-hover:opacity-100"
                      : "h-full w-full object-cover opacity-25 blur-md brightness-50"
                  }
                />
              )}

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent px-2 pb-2 pt-6">
                <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-stone-600">
                  lvl {boss.level}
                </p>
                <p className="truncate font-display text-[11px] tracking-[0.08em] text-stone-300">
                  {unlocked ? boss.title.replace(/^The /, "") : "??????"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
