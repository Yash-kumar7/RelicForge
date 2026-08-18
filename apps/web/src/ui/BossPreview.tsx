import type { CharacterSubject, HeldWeaponSpec } from "./CharacterViewer";
import { bossSlug } from "./BossPortrait";
import { bossWeaponHint } from "../game/orientationHints";
import { bossWeaponScale } from "../game/weaponScale";
import { bossAt } from "../game/bosses";
import { asset } from "../lib/backend";

/**
 * The selected boss, as a real mesh, holding its real weapon.
 *
 * Shown as a flat image beside an orbitable champion, a boss reads as a
 * placeholder; shown unarmed while the champion holds a blade, it reads as
 * unfinished. Both are the same kind of generated asset and both get the same
 * treatment.
 */
const BOSS_HEIGHT = 2.9;

/*
 * A subject, not a viewer.
 *
 * This used to render its own CharacterViewer, which meant selecting a boss
 * mounted a second WebGL canvas while the champion's was being disposed — and one
 * of the two threw out of r3f's event setup every time. It hands back what to look
 * at instead, and the screen keeps a single viewer pointed at it.
 */
export function bossSubject({
  level,
  title,
  accent,
}: {
  level: number;
  title: string;
  accent: string;
}): CharacterSubject {
  const slug = bossSlug(title);

  // Oversized relative to the wielder on purpose: a slab of scorched stone
  // should look like it takes a boss to lift.
  /*
   * The hint has to be applied here as well as in the arena.
   *
   * The ladder preview and the fight are two different render paths onto the
   * same GLB, so a weapon fixed in one stayed upside down in the other. Anything
   * that decides how an asset is oriented has to travel with the asset, not with
   * the screen.
   */
  const hint = bossWeaponHint(slug);
  const weapon: HeldWeaponSpec = {
    kind: "relic",
    url: asset(`/assets/bosses/${slug}/weapon.glb`),
    weaponClass: bossAt(level).weaponClass,
    // Derived, not chosen. The ladder used 1.35 while the fight used 1.15, so
    // the same weapon was a different size depending on which screen you were
    // looking at.
    scale: bossWeaponScale(bossAt(level).weaponClass, BOSS_HEIGHT),
    ...(hint ? { hint } : {}),
  };

  return {
    slug,
    url: asset(`/assets/bosses/${slug}/model.glb`),
    height: BOSS_HEIGHT,
    accent,
    weapon,
    caption: "drag to turn · scroll to zoom",
    /* The same breathing room the bleeding champion gets. At the framed 0.45
       the boss sat small in the middle of a half-screen of black. */
    framing: 0.22,
  };
}
