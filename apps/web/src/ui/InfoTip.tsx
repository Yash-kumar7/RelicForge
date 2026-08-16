import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 * moment they wondered.
 *
 * Rendered into the document rather than beside the mark, which took two
 * attempts to get right. As a positioned span it inherited the label's
 * typography, so three sentences were laid out on one nowrap line and ran off the
 * panel. Fixing that left it invisible anyway: the setup screen's right column
 * scrolls, and an ancestor with overflow clips an absolutely positioned child no
 * matter what its z-index says. A portal is the only thing that escapes both, so
 * the note is placed against the viewport from the mark's own rectangle.
 *
 * Deliberately click rather than hover. Hover already caused one bug here, and it
 * strands anyone on a touchscreen with information they cannot reach.
 */

const WIDTH = 256;
const GAP = 10;

export function InfoTip({
  label,
  children,
}: {
  /** What this explains, for anyone who cannot see the mark. */
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const id = useId();
  const mark = useRef<HTMLButtonElement>(null);

  /**
   * Positioned from the mark's rectangle, in viewport coordinates.
   *
   * Above it where there is room and below it where there is not, because these
   * marks sit near the bottom of their panels as often as the top, and clamped
   * horizontally so a note opening from the right edge stays on screen.
   */
  const place = useCallback(() => {
    const rect = mark.current?.getBoundingClientRect();
    if (!rect) return;

    const room = rect.top;
    const left = Math.min(
      Math.max(GAP, rect.left + rect.width / 2 - WIDTH / 2),
      window.innerWidth - WIDTH - GAP,
    );

    setAt({ left, top: room > 150 ? rect.top - GAP : rect.bottom + GAP });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;

    const onDown = (event: PointerEvent) => {
      if (!mark.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    /* Capture, because the column this usually opens from is what scrolls, and
       its scroll never reaches the window. */
    window.addEventListener("scroll", place, { capture: true, passive: true });
    window.addEventListener("resize", place);

    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={mark}
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={id}
        data-sound="none"
        onClick={() => setOpen((current) => !current)}
        className={[
          "grid h-4 w-4 shrink-0 place-items-center rounded-full border font-mono text-[9px] leading-none transition",
          open
            ? "border-brass-600 bg-brass-800/40 text-bone-300"
            : "border-brass-800 text-brass-700 hover:border-brass-600 hover:text-bone-400",
        ].join(" ")}
      >
        i
      </button>

      {createPortal(
        <AnimatePresence>
          {open && at && (
            <motion.div
              id={id}
              role="note"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              style={{
                left: at.left,
                top: at.top,
                width: WIDTH,
                transform: at.top < 150 ? undefined : "translateY(-100%)",
              }}
              /* Its own typography, not the label's. These open from nine-pixel
                 uppercase mono labels with wide tracking, and a note is not a
                 caption for the thing it opens from. */
              className="fixed z-50 border border-brass-800 bg-ash-950 p-3 text-left font-sans text-[11px] normal-case leading-relaxed tracking-normal text-stone-400 shadow-[0_10px_40px_rgba(0,0,0,0.6)]"
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
