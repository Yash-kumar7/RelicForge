import { AnimatePresence, motion } from "framer-motion";
import type { Affinity } from "@relic/core";
import { championFor, championStats, describeChampion } from "../game/champions";

/**
 * Choosing who you are.
 *
 * This was a column of three bordered rows beside a 3D viewport in a frame,
 * which is the shape of a settings panel. Character select in the games this is
 * built after does the opposite: one figure at full scale, its name at size, and
 * the alternatives reduced to portraits you flick between. The decision is made
 * by looking at a person, not by reading three paragraphs side by side.
 *
 * So the champion beside this panel is the subject and everything here is
 * caption: the name, the two lines that say how it plays, one number, and three
 * portraits to switch with.
 */

export function ChampionSelect({
  affinities,
  affinity,
  onChoose,
}: {
  affinities: { id: Affinity; name: string; blurb: string; bar: string; accent: string }[];
  affinity: Affinity;
  onChoose: (id: Affinity) => void;
}) {
  const champion = championFor(affinity);
  const stats = championStats(champion);
  const current = affinities.find((a) => a.id === affinity);

  return (
    <section>
      <div className="flex items-baseline justify-between border-b border-brass-800 pb-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-brass-700">
          choose your element
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brass-700">
          {affinities.findIndex((a) => a.id === affinity) + 1} of {affinities.length}
        </p>
      </div>

      {/*
        The name at size, because this is the subject of the screen.

        Keyed on the affinity so it re-enters on every change: the figure beside
        it swaps too, and a name that stayed put while the person changed made
        the two look unrelated.
      */}
      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="mt-8"
          >
            <div className="flex items-center gap-3">
              <span className={`h-8 w-[3px] ${current.bar}`} />
              <h2 className="font-display text-[clamp(2.25rem,4.4vw,3.5rem)] leading-none tracking-[0.14em] text-bone-200">
                {current.name.toUpperCase()}
              </h2>
            </div>

            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-bone-200/80">
              {current.blurb}
            </p>
            <p className="mt-3 max-w-md text-[13px] leading-relaxed text-bone-400">
              {champion.blurb}
            </p>

            <dl className="mt-8 flex gap-10">
              {describeChampion(champion).map((stat) => (
                <div key={stat.label}>
                  <dt className="font-mono text-[9px] uppercase tracking-[0.3em] text-brass-700">
                    {stat.label}
                  </dt>
                  <dd className="mt-2 font-display text-3xl tabular-nums text-bone-200">
                    {stat.value}
                  </dd>
                </div>
              ))}
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-[0.3em] text-brass-700">
                  special move
                </dt>
                {/*
                  Named, not described. The moves were cut from the game, so this
                  says what the champion is for instead of promising a button
                  that does not exist.
                */}
                <dd className="mt-2 font-display text-3xl text-bone-200">
                  {stats.lightDamage >= 28 ? "Strike" : stats.health >= 120 ? "Endure" : "Evade"}
                </dd>
              </div>
            </dl>
          </motion.div>
        )}
      </AnimatePresence>

      {/*
        The alternatives, reduced to portraits.

        Three full-width rows of prose asked the player to compare paragraphs.
        Three faces asks them to pick a person, and the one they are looking at
        is already at full size beside the panel.
      */}
      <div className="mt-10 flex gap-3">
        {affinities.map((a) => {
          const chosen = a.id === affinity;
          const slug = a.id === "fire" ? "ember" : a.id === "ice" ? "frost" : "storm";
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onChoose(a.id)}
              aria-pressed={chosen}
              className={[
                "group relative h-28 w-24 shrink-0 overflow-hidden border transition",
                chosen
                  ? a.accent
                  : "border-ash-700 opacity-50 grayscale hover:opacity-90 hover:grayscale-0",
              ].join(" ")}
            >
              <img
                src={`/assets/champions/${slug}/concept-cut.png`}
                alt={a.name}
                /* Framed on the head and shoulders: at this size a full figure
                   is a smudge and a helm is recognisable. */
                className="absolute left-1/2 top-0 h-[22rem] w-auto max-w-none -translate-x-1/2 object-contain"
              />
              <span
                className={[
                  "absolute inset-x-0 bottom-0 bg-gradient-to-t from-ash-950 to-transparent pb-1.5 pt-6 font-mono text-[9px] uppercase tracking-[0.2em]",
                  chosen ? "text-bone-200" : "text-stone-500",
                ].join(" ")}
              >
                {a.name}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
