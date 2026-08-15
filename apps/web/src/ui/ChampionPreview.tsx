import { useMemo } from "react";
import type { Affinity } from "@relic/core";
import { themeFor } from "../game/theme";
import { CharacterViewer, type HeldWeaponSpec } from "./CharacterViewer";
import { IRON, useLoadout } from "../state/useLoadout";

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
  const armament = useLoadout((s) => s.armament);

  // equippedId null means the iron sword, which is built from primitives in the
  // arena and has no GLB to hold here.
  /**
   * Empty-handed until the player picks. The screen reads as a sequence,
   * affinity then armament, and the weapon appearing is the confirmation that
   * the second choice landed.
   */
  const weapon = useMemo<HeldWeaponSpec | undefined>(() => {
    if (armament === null) return undefined;
    if (armament === IRON) return { kind: "iron" };
    const relic = owned.find((r) => r.relicId === armament);
    if (!relic) return { kind: "iron" };
    return { kind: "relic", url: relic.modelUrl, weaponClass: relic.dna.weaponClass };
  }, [owned, armament]);

  return (
    <CharacterViewer
      slug={slug}
      /*
        One mesh, always the closed-hand one.

        This was briefly two: the relaxed model until a weapon was chosen, the
        clenched one after. The idea was right and the execution cannot be. Both
        poses have to be generated separately, and two Meshy runs from the same
        prompt are not the same character, they differ in armour detail, in
        proportion and in lighting. Swapping between them read as the champion
        being replaced rather than relaxing.

        A fist holding nothing is a smaller cost than a champion that changes
        identity when you pick up a sword. Closing the hand on the existing mesh
        is not an option: the rigs have a single bone per hand and no fingers, so
        the pose is baked in at generation time.
      */
      url={`/assets/champions/${slug}/model.glb`}
      height={CHAMPION_HEIGHT}
      accent={theme.forge}
      weapon={weapon}
      caption={
        weapon === undefined
          ? "your champion · choose an armament below · drag to inspect"
          : weapon.kind === "relic"
            ? "your champion, holding your relic · drag to inspect"
            : "your champion, holding the iron blade · drag to inspect"
      }
      className="h-[calc(100vh-9rem)] max-h-[46rem] min-h-[26rem] w-full border border-ash-800 bg-ash-900/40"
    />
  );
}
