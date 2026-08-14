import { useEffect, useRef, useState } from "react";

/**
 * True once the element has been scrolled into view, and stays true.
 *
 * Used to keep WebGL contexts off screen from existing at all. The lab renders
 * one canvas per spike model, and with the full twelve-shape corpus that is
 * twelve simultaneous contexts, each running its own render loop. Browsers
 * degrade well before their hard limit.
 *
 * Latching rather than toggling on purpose: unmounting a canvas that scrolled
 * away would discard its loaded GLB and its measurements, so a model flickers
 * and re-measures every time it passes the viewport.
 */
export function useInView<T extends Element>(rootMargin = "200px"): {
  ref: (node: T | null) => void;
  inView: boolean;
} {
  const [inView, setInView] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const node = useRef<T | null>(null);

  useEffect(() => () => observer.current?.disconnect(), []);

  const ref = (next: T | null) => {
    if (node.current === next) return;
    observer.current?.disconnect();
    node.current = next;
    if (!next || inView) return;

    // No IntersectionObserver (very old browser, or a test environment): render
    // everything rather than render nothing.
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.current?.disconnect();
        }
      },
      { rootMargin },
    );
    observer.current.observe(next);
  };

  return { ref, inView };
}
