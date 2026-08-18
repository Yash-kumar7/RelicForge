import { useMemo } from "react";
import type { Affinity } from "@relic/core";
import { themeFor } from "../game/theme";
import type { CharacterSubject, HeldWeaponSpec } from "./CharacterViewer";
import { IRON, useLoadout } from "../state/useLoadout";
import { asset } from "../lib/backend";

/**
 * Your champion, holding the weapon you selected.
 *
 * First person means you never see your own body in the arena, so the character
 * appears where the decision is made. Showing it empty-handed on a screen about
 * weapons was the obvious gap: pick a relic and the champion is holding it.
 */
const CHAMPION_HEIGHT = 2.6;

/*
 * A subject, not a viewer. A hook, because the weapon comes from the loadout.
 *
 * See bossSubject for why neither of these renders a canvas of its own any more.
 */
export function useChampionSubject({
  affinity,
  armed = true,
}: {
  affinity: Affinity;
  /**
   * Drops the frame and fills the half of the screen the champion is on.
   *
   * Framed, the figure shares a rectangle with the column of choices beside it
   * and needs a border to say where one ends. Bleeding, it owns its half
   * outright and is cropped by the viewport, so there is nothing to delimit: it
   * ends off-screen, the way the fighters on the title screen do.
   */
  /**
   * False while the player is still choosing who to be.
   *
   * The setup screen is a sequence, and the weapon appearing is the
   * confirmation that the second choice landed. Handing the champion a sword on
   * the screen where you pick an element shows the answer to a question that has
   * not been asked yet.
   */
  armed?: boolean;
}): CharacterSubject {
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
    if (!armed || armament === null) return undefined;
    if (armament === IRON) return { kind: "iron" };
    const relic = owned.find((r) => r.relicId === armament);
    if (!relic) return { kind: "iron" };
    return { kind: "relic", url: relic.modelUrl, weaponClass: relic.dna.weaponClass };
  }, [owned, armament, armed]);

  return {
    slug,
      /*
        Two poses of one character, chosen by whether anything is in hand.

        A fist clenched around nothing is as wrong as an open hand wrapped
        around a sword, so the champion stands relaxed until a weapon is chosen
        and grips it afterwards.

        The first attempt at this generated the second pose from the same prompt
        and produced a different character, so switching read as the champion
        being replaced. The open pose is now an image-to-image edit of the very
        concept the closed one was built from: same armour, same proportions,
        same lighting, one hand opened. That distinction is the whole reason the
        feature works at all.
      */
    url:
      weapon === undefined
        ? asset(`/assets/champions/${slug}/model-open.glb`)
        : asset(`/assets/champions/${slug}/model.glb`),
    height: CHAMPION_HEIGHT,
    accent: theme.forge,
    weapon,
    /*
     * The only thing that says the figure can be turned.
     *
     * A champion that can be dragged looks identical to one that cannot until
     * somebody tries. It says only that, because the longer version was
     * explaining a framed panel that no longer exists.
     */
    caption: "drag to turn · scroll to zoom",
    /*
     * Enough room for feet.
     *
     * 0.06 cropped the champion at the shins. A figure meant to fill the
     * screen still has to stand on something, and a knight cut off at the
     * ankles reads as a rendering error rather than as a composition.
     */
    framing: 0.22,
  };
}
