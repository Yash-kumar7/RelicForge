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

/* Wide enough for the rank ladder, which is a mark, a name, a number and a
   pointer on one line and was wrapping at 256. */
const WIDTH = 296;
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
  const note = useRef<HTMLDivElement>(null);

  /**
   * Positioned from the mark's rectangle, against the note's real height.
   *
   * The first version guessed: open upward whenever the mark was more than 150
   * pixels down the page, which is right for a one-line note and wrong for the
   * boss notes, which run to a blurb, four properties and a price list. The
   * fifth boss sits low in a scrolling column, so its note opened downward off
   * the bottom of the window with the half worth reading below the fold.
   *
   * It measures instead. The note is laid out first, so its height is known, and
   * the side with room for it wins. If neither side has room the note is pinned
   * to the viewport and stays whole, which is better than being correctly
   * positioned and half invisible.
   */
  const place = useCallback(() => {
    const rect = mark.current?.getBoundingClientRect();
    if (!rect) return;

    const height = note.current?.offsetHeight ?? 0;
    const above = rect.top - GAP;
    const below = window.innerHeight - rect.bottom - GAP;

    const left = Math.min(
      Math.max(GAP, rect.left + rect.width / 2 - WIDTH / 2),
      window.innerWidth - WIDTH - GAP,
    );

    // Prefer above, which keeps the note clear of the thing it describes.
    let top = height > 0 && above < height && below > above ? rect.bottom + GAP : rect.top - GAP - height;

    top = Math.min(Math.max(GAP, top), Math.max(GAP, window.innerHeight - height - GAP));

    setAt({ left, top });
  }, []);

  /*
   * Twice: once to put the note in the document so it can be measured, and again
   * with its height known. The first pass has nothing to measure, so a note
   * whose height decides its side has to be laid out before it can be placed.
   */
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
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
        /*
          Its own typography, like the note it opens.

          The mark sits inside whatever asks for it: a nine-pixel uppercase mono
          label on one step, a display-face heading at up to 2.5rem with wide
          letter spacing on another. It set a font and a size but inherited case
          and tracking, so the i was pushed off-centre inside its own circle by
          the heading's 0.12em and looked like a different control on every
          screen.
        */
        className={[
          "grid h-4 w-4 shrink-0 place-items-center rounded-full border font-mono text-[9px] normal-case leading-none tracking-normal transition",
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
              ref={note}
              /* No transform. It used to be shifted up by its own height, which
                 is a way of positioning something whose height you do not know;
                 the height is measured now, so the top is simply correct. */
              style={{ left: at.left, top: at.top, width: WIDTH }}
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
