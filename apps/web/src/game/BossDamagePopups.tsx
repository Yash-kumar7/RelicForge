import { useEffect, useState } from "react";
import { Html } from "@react-three/drei";
import { prunePops, subscribePops, type DamagePop } from "./feedback";

/**
 * Damage numbers anchored to the boss.
 *
 * They used to appear at the centre of the screen, which made a bare "25" read
 * as a floating random number rather than as damage dealt to the thing in front
 * of you. Rendering them in world space above the boss makes what they refer to
 * unambiguous without adding a label, and they follow the boss as it moves.
 *
 * Heavy hits are larger and brighter, so the two attacks are visibly different
 * amounts rather than two numbers that happen to differ.
 */
const LIFETIME_MS = 900;

export function BossDamagePopups() {
  const [pops, setPops] = useState<DamagePop[]>([]);
  const [now, setNow] = useState(0);

  useEffect(() => subscribePops(setPops), []);

  useEffect(() => {
    if (pops.length === 0) return undefined;
    let raf = 0;
    const tick = () => {
      setNow(performance.now());
      prunePops(performance.now(), LIFETIME_MS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pops.length]);

  if (pops.length === 0) return null;

  return (
    <>
      {pops.map((pop) => {
        const age = (now - pop.bornAt) / LIFETIME_MS;
        if (age > 1 || age < 0) return null;
        const opacity = age < 0.12 ? age / 0.12 : 1 - (age - 0.12) / 0.88;

        return (
          <Html
            key={pop.id}
            // Above the core, spread slightly so simultaneous hits do not stack.
            position={[pop.jitterX / 90, 2.6 + age * 1.1, pop.jitterY / 90]}
            center
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            <span
              style={{
                opacity,
                color: pop.kind === "heavy" ? "#ffb066" : "#e7e5e4",
                fontSize: pop.kind === "heavy" ? 30 : 20,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textShadow: "0 2px 12px rgba(0,0,0,0.95)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {pop.amount}
            </span>
          </Html>
        );
      })}
    </>
  );
}
