import { useEffect } from "react";
import { sfx, unlockAudio } from "./sfx";

/**
 * Gives every screen outside the arena a voice, from one place.
 *
 * Every sound this game had answered something happening in the fight, and the
 * screens in front of it were silent: a champion could be chosen, a weapon
 * equipped and a boss picked without the game acknowledging any of it. Silence
 * reads as a press that did not register, which is why people click things twice.
 *
 * Presses only. There was a hover sound, and it was a mistake for a reason worth
 * keeping: pointerover fires when an element arrives under the cursor and does
 * not care which of the two moved, so scrolling a page of buttons past a resting
 * pointer fired it once per button and the interface rattled. That was patched
 * with a scroll guard, a movement check and a repeat timer, three pieces of
 * machinery to make a sound behave, none of which anybody asked for. A press is
 * an unambiguous act by the player and needs none of them.
 *
 * Delegated from the document rather than wired per control. Buttons live on the
 * title screen, three setup steps, the ladder, the loadout, the briefing, the
 * defeat screen and the reveal, and hanging a handler on each is both a lot of
 * edits and a promise nobody keeps: the next button added would be silent and
 * nothing would say so.
 *
 * A control opts into a heavier sound with data-sound="confirm", or none at all
 * with data-sound="none". Everything else is a select, which is the right
 * default: most presses choose between things rather than commit to them.
 */

function soundable(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest("button, a[href], [role='button']");
  return el instanceof HTMLElement ? el : null;
}

export function useInterfaceSounds(): void {
  useEffect(() => {
    /*
     * Audio cannot start before a gesture, and the first gesture is usually the
     * one being sounded. Unlocking on pointerdown rather than on click means the
     * context has begun resuming before the click's own sound is asked for.
     */
    const unlock = () => unlockAudio();

    const onClick = (event: MouseEvent) => {
      const el = soundable(event.target);
      if (!el) return;

      // A control that cannot be used still answers. A button that says nothing
      // when pressed is indistinguishable from one that is broken.
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
    document.addEventListener("click", onClick);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      document.removeEventListener("click", onClick);
    };
  }, []);
}
