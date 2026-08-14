import { useEffect, useState } from "react";
import { subscribeTelegraph } from "../game/feedback";
import { useGameStore } from "../state/useGameStore";

/**
 * An on-screen warning for the boss's wind-up.
 *
 * The ground ring works when you are looking at the boss, which is exactly when
 * you least need help. This covers the case that actually kills people: the
 * boss winding up while it is behind you or off screen, where the only previous
 * signal was your health dropping.
 */
export function TelegraphWarning() {
  const phase = useGameStore((s) => s.phase);
  const [at, setAt] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => subscribeTelegraph(setAt), []);

  useEffect(() => {
    if (!at) return undefined;
    let raf = 0;
    const tick = () => {
      setNow(performance.now());
      if (performance.now() - at < 1100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [at]);

  if (phase !== "FIGHTING" || !at) return null;
  const age = (now - at) / 1100;
  if (age > 1 || age < 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center">
      <span
        className="font-display text-sm uppercase tracking-[0.5em] text-red-400"
        style={{ opacity: 1 - age, textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}
      >
        incoming · shift to dodge
      </span>
    </div>
  );
}
