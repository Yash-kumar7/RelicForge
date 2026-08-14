import { CharacterViewer, type HeldWeaponSpec } from "./CharacterViewer";
import { bossSlug } from "./BossPortrait";
import { bossAt } from "../game/bosses";

/**
 * The selected boss, as a real mesh, holding its real weapon.
 *
 * Shown as a flat image beside an orbitable champion, a boss reads as a
 * placeholder; shown unarmed while the champion holds a blade, it reads as
 * unfinished. Both are the same kind of generated asset and both get the same
 * treatment.
 */
const BOSS_HEIGHT = 2.9;

export function BossPreview({
  level,
  title,
  accent,
  className = "",
}: {
  level: number;
  title: string;
  accent: string;
  className?: string;
}) {
  const slug = bossSlug(title);

  // Oversized relative to the wielder on purpose: a slab of scorched stone
  // should look like it takes a boss to lift.
  const weapon: HeldWeaponSpec = {
    kind: "relic",
    url: `/assets/bosses/${slug}/weapon.glb`,
    weaponClass: bossAt(level).weaponClass,
    scale: 1.35,
  };

  return (
    <CharacterViewer
      url={`/assets/bosses/${slug}/model.glb`}
      height={BOSS_HEIGHT}
      accent={accent}
      weapon={weapon}
      caption="drag to inspect"
      className={className}
    />
  );
}
