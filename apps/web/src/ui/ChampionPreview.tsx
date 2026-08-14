import type { Affinity } from "@relic/core";
import { themeFor } from "../game/theme";
import { CharacterViewer } from "./CharacterViewer";

/**
 * Your champion, inspectable.
 *
 * First person means you never see your own body in the arena, so the character
 * appears where the decision is made. Picking "Ember" should show an ember
 * champion turning in front of you, not a word beside an emoji.
 */
const CHAMPION_HEIGHT = 2.6;

export function ChampionPreview({ affinity }: { affinity: Affinity }) {
  const theme = themeFor(affinity);
  const slug = affinity === "fire" ? "ember" : affinity === "ice" ? "frost" : "storm";

  return (
    <CharacterViewer
      url={`/assets/champions/${slug}/model.glb`}
      height={CHAMPION_HEIGHT}
      accent={theme.forge}
      caption="your champion · pre-generated with meshy-7 · drag to inspect"
      className="h-[calc(100vh-9rem)] max-h-[46rem] min-h-[26rem] w-full border border-ash-800 bg-ash-900/40"
    />
  );
}
