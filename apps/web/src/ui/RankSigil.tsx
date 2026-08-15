/**
 * A rank insignia, drawn rather than spelled.
 *
 * This has been a bare word, six dashes, and a Roman numeral. A numeral is a
 * letter: it tells you which rank only if you already know how many there are,
 * and it looks the same at the bottom of the ladder as at the top. Games use
 * insignia instead, and insignia work because three things carry the meaning at
 * once, none of which need reading: a shape, a colour that says which tier, and
 * a count that says how far into it.
 *
 * So the six ranks are two tiers of three. Bronze for the first three, gold for
 * the last, and one to three bars inside the sigil for the position within the
 * tier. That is how real rank insignia are built, and it means the difference
 * between rank one and rank six is visible across a room while the difference
 * between four and five is still legible up close.
 *
 * Drawn as SVG on purpose. An emoji or a badge image would be clip art beside an
 * inscriptional serif, which is the same mistake the weather glyphs on the
 * champion rows were making.
 */

const TIERS = [
  { fill: "#8a5a2b", stroke: "#c08040" },
  { fill: "#c9922f", stroke: "#f0c060" },
] as const;

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
  const tier = TIERS[Math.min(TIERS.length - 1, Math.floor(index / 3))]!;
  // One to three bars within the tier, so a rank reads as "gold two" the way a
  // chevron does rather than as an arbitrary number.
  const bars = (index % 3) + 1;

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
      {/* A shield, the shape every rank badge has been for a very long time. */}
      <path
        d="M12 1.6 21 5v7.2c0 4.4-3.5 8-9 10.2-5.5-2.2-9-5.8-9-10.2V5z"
        fill={tier.fill}
        fillOpacity={0.18}
        stroke={tier.stroke}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      {Array.from({ length: bars }, (_, i) => (
        <path
          key={i}
          d={`M7.5 ${14.2 - i * 2.6} 12 ${11.4 - i * 2.6} 16.5 ${14.2 - i * 2.6}`}
          stroke={tier.stroke}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
