import { useEffect, useState } from "react";
import NormalizeLab from "./debug/NormalizeLab";
import { Game } from "./game/Game";
import { TitleScreen } from "./ui/TitleScreen";
import { useGameStore } from "./state/useGameStore";

/**
 * Hash routing, deliberately. The game is one immersive surface and the lab is
 * a dev tool — a router dependency would earn nothing here.
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

export default function App() {
  const route = useHashRoute();
  const phase = useGameStore((s) => s.phase);

  if (route.startsWith("/lab")) return <NormalizeLab />;

  // ?mode=dev runs the cheap generation config (single concept, no ultra) so
  // iterating on the sequence does not wait on a full hero forge every time.
  const mode = new URLSearchParams(window.location.search).get("mode") === "dev" ? "dev" : "hero";

  if (phase === "TITLE" || phase === "CHOOSE_AFFINITY") return <TitleScreen />;
  return <Game mode={mode} />;
}
