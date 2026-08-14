import { CharacterViewer } from "./CharacterViewer";
import { bossSlug } from "./BossPortrait";

/**
 * The selected boss, as a real mesh.
 *
 * Shown as a flat image beside an orbitable champion, a boss reads as a
 * placeholder. It is the same kind of generated asset, so it gets the same
 * treatment: the actual GLB you will fight, turning, draggable.
 */
const BOSS_HEIGHT = 2.9;

export function BossPreview({
  title,
  accent,
  className = "",
}: {
  title: string;
  accent: string;
  className?: string;
}) {
  return (
    <CharacterViewer
      url={`/assets/bosses/${bossSlug(title)}/model.glb`}
      height={BOSS_HEIGHT}
      accent={accent}
      caption="drag to inspect"
      className={className}
    />
  );
}
