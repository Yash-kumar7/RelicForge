import { useEffect } from "react";
import { sfx, unlockAudio } from "./sfx";

/**
 * Gives every screen outside the arena a voice, from one place.
 *
 * Every sound this game had answered something happening in the fight, and the
 * three screens in front of it were silent: a champion could be chosen, a weapon
 * equipped and a boss picked without the game acknowledging any of it. Silence
 * reads as a click that did not register, which is why players press things
 * twice.
 *
 * Delegated rather than wired per control. There are buttons on the title
 * screen, the champion step, the weapon step, the ladder, the loadout panel, the
 * briefing, the defeat screen and the reveal, and hanging a handler on each one
 * is both a lot of edits and a promise nobody keeps: the next button added would
 * be silent, and nothing would say so. One listener at the document covers
 * everything that exists and everything added later.
 *
 * A control opts into the heavier sound with data-sound="confirm". Everything
 * else is a select, which is the right default: most presses choose between
 * things rather than commit to them.
 */

/** How long a hover stays quiet after firing, so a shaking cursor is not a rattle. */
const HOVER_QUIET_MS = 90;

function soundable(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest("button, a[href], [role='button']");
  return el instanceof HTMLElement ? el : null;
}

export function useInterfaceSounds(): void {
  useEffect(() => {
    let lastHoverAt = 0;
    let lastHovered: HTMLElement | null = null;

    /*
     * Audio cannot start before a gesture, and the first gesture is usually the
     * one being sounded. Unlocking on pointerdown rather than on click means the
     * context is ready by the time the click's own sound is asked for.
     */
    const unlock = () => unlockAudio();

    const onOver = (event: PointerEvent) => {
      const el = soundable(event.target);
      if (!el || el === lastHovered) return;
      lastHovered = el;

      // Nothing for a control that cannot be used: a hover is an invitation.
      if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") return;

      const now = performance.now();
      if (now - lastHoverAt < HOVER_QUIET_MS) return;
      lastHoverAt = now;
      sfx.hover();
    };

    const onOut = (event: PointerEvent) => {
      if (soundable(event.target) === lastHovered) lastHovered = null;
    };

    const onClick = (event: MouseEvent) => {
      const el = soundable(event.target);
      if (!el) return;

      if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") {
        sfx.denied();
        return;
      }

      const kind = el.dataset["sound"];
      if (kind === "confirm") sfx.confirm();
      else if (kind === "back") sfx.back();
      else if (kind === "none") return;
      else sfx.select();
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("click", onClick);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("click", onClick);
    };
  }, []);
}
