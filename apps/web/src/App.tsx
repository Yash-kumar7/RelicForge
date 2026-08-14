import { Suspense, lazy, useEffect, useState } from "react";
import { Game } from "./game/Game";
import { TitleScreen } from "./ui/TitleScreen";
import { useGameStore } from "./state/useGameStore";

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
