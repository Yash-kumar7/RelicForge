import { useMemo } from "react";
import type { Affinity } from "@relic/core";
import { themeFor } from "../game/theme";
import { CharacterViewer, type HeldWeaponSpec } from "./CharacterViewer";
import { useLoadout } from "../state/useLoadout";

/**
 * Your champion, holding the weapon you selected.
 *
 * First person means you never see your own body in the arena, so the character
 * appears where the decision is made. Showing it empty-handed on a screen about
 * weapons was the obvious gap: pick a relic and the champion is holding it.
 */
const CHAMPION_HEIGHT = 2.6;

export function ChampionPreview({ affinity }: { affinity: Affinity }) {
  const theme = themeFor(affinity);
  const slug = affinity === "fire" ? "ember" : affinity === "ice" ? "frost" : "storm";

  const owned = useLoadout((s) => s.owned);
  const equippedId = useLoadout((s) => s.equippedId);

  // equippedId null means the iron sword, which is built from primitives in the
  // arena and has no GLB to hold here.
  const weapon = useMemo<HeldWeaponSpec | undefined>(() => {
    const relic = owned.find((r) => r.relicId === equippedId);
    if (!relic) return undefined;
    return { url: relic.modelUrl, weaponClass: relic.dna.weaponClass };
  }, [owned, equippedId]);

  return (
    <CharacterViewer
      url={`/assets/champions/${slug}/model.glb`}
      height={CHAMPION_HEIGHT}
      accent={theme.forge}
      weapon={weapon}
      caption={
        weapon
          ? "your champion, holding your relic · drag to inspect"
          : "your champion · pre-generated with meshy-7 · drag to inspect"
      }
      className="h-[calc(100vh-9rem)] max-h-[46rem] min-h-[26rem] w-full border border-ash-800 bg-ash-900/40"
    />
  );
}
