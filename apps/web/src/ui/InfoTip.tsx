import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Detail on request, rather than on the page.
 *
 * Every number this game shows has needed explaining at some point, and each
 * explanation was answered by adding a line under it: what a rank is, what moves
 * you inside an experience range, what decides a weapon's damage. Every one of
 * those lines is correct and worth having, and together they turn a screen where
 * a player picks a fight into a manual they have to read first.
 *
 * So the answer goes behind the question. A player who already knows sees a
 * number and a mark; a player who does not gets the paragraph, once, at the
 * moment they wondered. That is how games handle a stat block, and it is the only
 * way a screen can be both complete and quiet.
 *
 * Deliberately click rather than hover. Hover already caused one bug here, and it
 * strands anyone on a touchscreen with information they cannot reach.
 */
export function InfoTip({
  label,
  children,
  align = "left",
}: {
  /** What this explains, for anyone who cannot see the mark. */
  label: string;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const onDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={wrap} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
        className={[
          "grid h-4 w-4 place-items-center rounded-full border font-mono text-[9px] leading-none transition",
          open
            ? "border-brass-600 bg-brass-800/40 text-bone-300"
            : "border-brass-800 text-brass-700 hover:border-brass-600 hover:text-bone-400",
        ].join(" ")}
      >
        i
      </button>

      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="note"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            /* Above the mark, because these sit low on their own panels and a
               popover below one would open off the bottom of the screen. */
            className={[
              "absolute bottom-6 z-30 w-64 border border-brass-800 bg-ash-950 p-3",
              "text-[11px] leading-relaxed text-stone-400 shadow-[0_10px_40px_rgba(0,0,0,0.6)]",
              align === "right" ? "right-0" : "left-0",
            ].join(" ")}
          >
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
