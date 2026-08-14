import { useEffect, useState } from "react";
import NormalizeLab from "./debug/NormalizeLab";

/**
 * Hash routing, deliberately. The game is a single immersive surface and the
 * lab is a dev tool — a router dependency would earn nothing here.
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

  if (route.startsWith("/lab")) return <NormalizeLab />;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-ash-950">
      <div className="text-center">
        <h1 className="font-display text-6xl tracking-[0.2em] text-ember-400">RELICFORGE</h1>
        <p className="mt-3 text-sm uppercase tracking-[0.3em] text-stone-500">
          Every legendary is actually legendary
        </p>
      </div>
      <a
        href="#/lab"
        className="rounded border border-stone-700 px-6 py-2 text-xs uppercase tracking-[0.25em] text-stone-400 transition hover:border-ember-500 hover:text-ember-400"
      >
        Normalize Lab
      </a>
    </div>
  );
}
