import { useEffect, useState } from "react";
import { prunePops, subscribePops, type DamagePop } from "../game/feedback";
import { useGameStore } from "../state/useGameStore";

/**
 * Floating damage numbers.
 *
 * The most direct answer to "am I actually hurting it": a number leaving the
 * point of impact every time a swing connects. Heavy hits are larger and
 * brighter so the two attacks feel materially different rather than just
 * differently timed.
 */
export function DamageNumbers() {
  const [pops, setPops] = useState<DamagePop[]>([]);
  const phase = useGameStore((s) => s.phase);

  useEffect(() => subscribePops(setPops), []);

  useEffect(() => {
    const timer = setInterval(() => prunePops(performance.now()), 120);
    return () => clearInterval(timer);
  }, []);

  if (phase !== "FIGHTING" || pops.length === 0) return null;

  const now = performance.now();

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pops.map((pop) => {
        const age = (now - pop.bornAt) / 900;
        if (age > 1) return null;
        const rise = age * 90;
        const opacity = age < 0.15 ? age / 0.15 : 1 - (age - 0.15) / 0.85;

        return (
          <span
            key={pop.id}
            className={
              pop.kind === "heavy"
                ? "absolute left-1/2 top-1/2 font-display text-4xl tabular-nums text-ember-300"
                : "absolute left-1/2 top-1/2 font-display text-2xl tabular-nums text-stone-200"
            }
            style={{
              transform: `translate(calc(-50% + ${pop.jitterX}px), calc(-50% - ${rise + 40}px)) scale(${1 + (1 - age) * 0.25})`,
              opacity,
              textShadow: "0 2px 12px rgba(0,0,0,0.9)",
            }}
          >
            {pop.amount}
          </span>
        );
      })}
    </div>
  );
}
