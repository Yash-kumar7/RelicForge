/**
 * A rank insignia, drawn rather than spelled, and one drawing per rank.
 *
 * This has been a bare word, six dashes, and a Roman numeral. A numeral is a
 * letter: it tells you which rank only if you already know how many there are,
 * and it looks the same at the bottom of the ladder as at the top.
 *
 * It was then two tiers of three, separated by colour and a bar count, and that
 * failed where it mattered most. The fourth rank, the first of the upper tier,
 * drew one bar, and so did the first rank; at 24 pixels a bronze one-bar shield
 * and a gold one-bar shield are the same picture, so reaching the middle of the
 * ladder looked like starting it.
 *
 * So each rank has its own mark, and they are distinguishable as black shapes
 * with the colour stripped out. That is the test the tier scheme failed and the
 * one an insignia has to pass, because it is worn small and glanced at.
 *
 * The marks also mean something, which is what makes them memorable rather than
 * merely different: nothing, then a first ember, then a blade, then a ring taken
 * off something that was killed, then a crown, then a crown on a star.
 */

interface Sigil {
  /** Escalating, but never the only difference between two ranks. */
  colour: string;
  /** Drawn under the mark. Absent on the first rank, which has earned none. */
  shield: "none" | "outline" | "solid";
  mark: (colour: string) => React.ReactNode;
}

const OUTLINE = "M12 1.6 21 5v7.2c0 4.4-3.5 8-9 10.2-5.5-2.2-9-5.8-9-10.2V5z";

const SIGILS: Sigil[] = [
  {
    // Unproven. No shield at all: the shape of having won nothing yet, which
    // should not look like a lesser version of a decoration.
    colour: "#6b6259",
    shield: "none",
    mark: (colour) => (
      <path
        d="M5 15.5 12 9l7 6.5"
        stroke={colour}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    // Ashbearer. One ember, carried.
    colour: "#b07235",
    shield: "outline",
    mark: (colour) => <circle cx={12} cy={11.5} r={2.4} fill={colour} fillOpacity={0.95} />,
  },
  {
    // Warden-Slayer. A blade, through the shield.
    colour: "#c08040",
    shield: "outline",
    mark: (colour) => (
      <path
        d="M7.5 16.5 16.5 7.5M14.4 7.2h2.9v2.9"
        stroke={colour}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    // Relic-Bound. A ring, taken off something that was killed.
    colour: "#d9a441",
    shield: "solid",
    mark: (colour) => (
      <circle cx={12} cy={11.6} r={3.4} stroke={colour} strokeWidth={1.7} fill="none" />
    ),
  },
  {
    // Forgesworn. A crown, over the shield rather than inside it, so the
    // silhouette itself changes.
    colour: "#f0c060",
    shield: "solid",
    mark: (colour) => (
      <>
        <path d="M6.6 4.4 9 6.2 12 2.9l3 3.3 2.4-1.8-.7 3.2H7.3z" fill={colour} />
        <path
          d="M9 14.6 12 12l3 2.6"
          stroke={colour}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    // Legend-Made. The shield is gone: a crowned star, which shares no outline
    // with anything below it.
    colour: "#ffd98a",
    shield: "none",
    mark: (colour) => (
      <>
        <path
          d="M12 3.2 14.3 9.4 20.8 9.8 15.8 14 17.4 20.4 12 16.8 6.6 20.4 8.2 14 3.2 9.8 9.7 9.4z"
          fill={colour}
          fillOpacity={0.9}
          stroke={colour}
          strokeWidth={0.8}
          strokeLinejoin="round"
        />
        <path d="M8 2.4 10 3.6 12 1.2 14 3.6 16 2.4l-.6 2.4H8.6z" fill={colour} />
      </>
    ),
  },
];

export function RankSigil({
  index,
  size = 28,
  title,
}: {
  index: number;
  size?: number;
  /** The rank's name, for anyone who wants the word without it taking a line. */
  title?: string;
}) {
  const sigil = SIGILS[Math.min(SIGILS.length - 1, Math.max(0, index))]!;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="shrink-0"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}

      {sigil.shield !== "none" && (
        <path
          d={OUTLINE}
          fill={sigil.colour}
          fillOpacity={sigil.shield === "solid" ? 0.22 : 0.1}
          stroke={sigil.colour}
          strokeWidth={sigil.shield === "solid" ? 1.4 : 1}
          strokeLinejoin="round"
        />
      )}

      {sigil.mark(sigil.colour)}
    </svg>
  );
}
