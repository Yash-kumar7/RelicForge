import { Suspense, lazy, useEffect, useState } from "react";
import { Game } from "./game/Game";
import { TitleScreen } from "./ui/TitleScreen";
import { useGameStore } from "./state/useGameStore";
import { useInterfaceSounds } from "./audio/useInterfaceSounds";

/**
 * Dev surfaces are lazy: the lab and the compare view pull in their own scene
 * code, and a player who never opens them should not download them.
 */
const NormalizeLab = lazy(() => import("./debug/NormalizeLab"));
const RelicCompare = lazy(() => import("./debug/RelicCompare"));

/**
 * Hash routing, deliberately. The game is one immersive surface and the dev
 * views are two more, a router dependency would earn nothing here.
 */
function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#/, ""));
  useEffect(() => {
    const onChange = () => setHash(window.location.hash.replace(/^#/, ""));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center bg-ash-950">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-stone-600">loading…</p>
    </div>
  );
}

export default function App() {
  const route = useHashRoute();
  const phase = useGameStore((s) => s.phase);

  /*
   * Mounted above the route check, so the lab and the compare view get it too.
   * They are dev surfaces, but a button that is silent on one screen and not on
   * another is the kind of inconsistency that reads as a bug in the sound rather
   * than as a decision about which screens matter.
   */
  /* The forge hums on the screens before the fight, and stops when one starts:
     the arena brings its own sound and does not want a drone under it. */
  /*
   * The forge is heard on the title screen and nowhere else before the fight.
   *
   * It ran through champion selection too, and that put coals burning under a
   * screen where nothing is being forged. A room tone says where you are; that
   * one was saying something is happening, and nothing was.
   *
   * It also spent the effect early. If the fire is going on every screen, then
   * the forge lighting after a victory has nowhere left to go — it is already at
   * full heat before the player has done anything. Held back to the title, the
   * setup screens are quiet enough that the sequence lands as an event.
   */
  useInterfaceSounds({ ambience: phase === "TITLE" });

  if (route.startsWith("/lab")) {
    return (
      <Suspense fallback={<Loading />}>
        <NormalizeLab />
      </Suspense>
    );
  }

  if (route.startsWith("/compare")) {
    return (
      <Suspense fallback={<Loading />}>
        <RelicCompare />
      </Suspense>
    );
  }

  // ?mode=dev uses the cheap generation config (one concept, no ultra) so
  // iterating on the sequence does not wait on a full hero forge every time.
  const mode = new URLSearchParams(window.location.search).get("mode") === "dev" ? "dev" : "hero";

  if (phase === "TITLE" || phase === "CHOOSE_AFFINITY") return <TitleScreen />;
  return <Game mode={mode} />;
}
