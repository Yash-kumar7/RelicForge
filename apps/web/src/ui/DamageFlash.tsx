import { useEffect, useState } from "react";
import { subscribePlayerHurt } from "../game/feedback";
import { useGameStore } from "../state/useGameStore";

/**
 * Getting hit, made obvious.
 *
 * A shrinking bar in the corner is not feedback: players were losing health
 * without knowing what had happened, which reads as the game cheating. A red
 * edge flash plus the number taken makes the cost of a mistake unmissable, and
 * it matters more here than in most games because health remaining is the input
 * that decides whether the relic comes out pristine or shattered.
 */
export function DamageFlash() {
  const phase = useGameStore((s) => s.phase);
  const [hit, setHit] = useState<{ at: number; amount: number } | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => subscribePlayerHurt(setHit), []);

  // Ticks only while a flash is actually fading, rather than every frame.
  useEffect(() => {
    if (!hit) return undefined;
    let raf = 0;
    const tick = () => {
      setNow(performance.now());
      if (performance.now() - hit.at < 700) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hit]);

  if (phase !== "FIGHTING" || !hit) return null;

  const age = (now - hit.at) / 700;
  if (age > 1 || age < 0) return null;
  const strength = 1 - age;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Edge vignette rather than a full-screen wash, so the fight stays visible. */}
      <div
        className="absolute inset-0"
        style={{
          boxShadow: `inset 0 0 ${18 + strength * 22}vh rgba(220,38,38,${0.55 * strength})`,
        }}
      />
      <span
        className="absolute left-1/2 top-[58%] font-display text-3xl tabular-nums text-red-400"
        style={{
          transform: `translate(-50%, ${-strength * 26}px)`,
          opacity: strength,
          textShadow: "0 2px 14px rgba(0,0,0,0.95)",
        }}
      >
        -{hit.amount}
      </span>
    </div>
  );
}
