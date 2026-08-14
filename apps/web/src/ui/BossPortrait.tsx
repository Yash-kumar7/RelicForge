import { useEffect, useState } from "react";

/**
 * A boss's own generated concept art.
 *
 * The honest illustration: this is the exact image that produced the mesh you
 * will fight, not a hand-drawn stand-in. Locked bosses are blurred and
 * unnamed, so the ladder shows what is coming without spoiling it.
 *
 * Renders a plain placeholder when no art exists, so a fresh clone with an
 * empty storage directory still lays out correctly.
 */
export function bossSlug(title: string): string {
  return title.toLowerCase().replace(/^the /, "").replace(/\s+/g, "-");
}

export function BossPortrait({
  title,
  locked,
  className = "",
}: {
  title: string;
  locked: boolean;
  className?: string;
}) {
  const slug = bossSlug(title);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAvailable(null);
    fetch(`/assets/bosses/${slug}/concept.png`, { method: "HEAD" })
      .then((res) => !cancelled && setAvailable(res.ok))
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className={`relative overflow-hidden bg-ash-950 ${className}`}>
      {available && (
        <img
          src={`/assets/bosses/${slug}/concept.png`}
          alt={locked ? "Unknown boss" : title}
          loading="lazy"
          className={
            locked
              ? "h-full w-full object-cover opacity-30 blur-md brightness-50"
              : "h-full w-full object-cover"
          }
        />
      )}
      {locked && (
        <span className="absolute inset-0 flex items-center justify-center font-display text-xs tracking-[0.25em] text-stone-700">
          ?
        </span>
      )}
    </div>
  );
}
