import { RANKS, rankFor } from "../state/useProgress";
import { RankSigil } from "./RankSigil";

/**
 * The whole ladder, so a rank is a position rather than a word.
 *
 * A player was shown one sigil, one name, and how far to the next: enough to
 * know something is climbing, not enough to know what it is climbing. Six ranks
 * existed and five of them were invisible, so "Relic-Bound" meant nothing except
 * that it was not "Unproven", and the sigil beside it could not say whether it
 * was the second rung or the fifth.
 *
 * Every rank listed, with its own mark and the experience it takes, and the
 * current one marked. That is what a tier list is for and why every game with
 * ranks shows one: the value of a rank is entirely in the ones above and below
 * it.
 */
export function RankLadder({ xp }: { xp: number }) {
  const current = rankFor(xp).index;

  return (
    <span className="block">
      {/*
        Says what it is before what it is not.
        
        This opened with "experience is a record of what you have fought, not a
        currency", which is a definition and a denial: two abstractions before
        anything a player recognises. It also spent its first breath explaining
        that rank buys no damage and unlocks no weapon, which answers a worry
        nobody has until you raise it.
        
        What it is, is a tally of what you have killed. That is worth saying, and
        the fact that nothing spends it is one clause at the end rather than the
        whole opening.
      */}
      <span className="block text-stone-500">
        Every boss you put down adds to this. It is the tally of what you have killed and how
        well you did it, and nothing ever spends it.
      </span>

      <span className="mt-3 block border-t border-ash-800 pt-2 font-mono text-[10px] uppercase tracking-[0.12em]">
        {RANKS.map((rank, index) => (
          <span
            key={rank.name}
            className={[
              "flex items-center gap-2 py-1",
              index === current ? "text-bone-200" : index < current ? "text-stone-600" : "text-stone-700",
            ].join(" ")}
          >
            <RankSigil index={index} size={16} />
            <span className="flex-1">{rank.name}</span>
            {/* The threshold, which is the only number that makes a rank real. */}
            <span className="tabular-nums">{rank.at}</span>
            {/* Marks where the player is without spending a column on it. */}
            <span className="w-3 text-right text-brass-600">{index === current ? "◂" : ""}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
