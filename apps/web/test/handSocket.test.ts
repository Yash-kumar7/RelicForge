import { describe, expect, it } from "vitest";
import { DEFAULT_HAND_SOCKET, HAND_SOCKETS, handSocketFor } from "../src/game/handSockets";

/**
 * Guards the generated socket table.
 *
 * Every socket bug in this project came from estimating where a hand is. The
 * setup screen guessed 0.46 of character height, which is mid-thigh, and hung
 * relics at the leg; it guessed a fixed sign, and put the weapon in the left
 * hand. handSockets.ts replaces those guesses with values read out of each rig
 * by scripts/derive-sockets.ts, and these assertions describe what a plausible
 * socket looks like so a bad regeneration fails here rather than on screen.
 */
describe("generated hand sockets", () => {
  const entries = Object.entries(HAND_SOCKETS);

  it("covers every champion and every boss", () => {
    for (const slug of [
      "ember",
      "frost",
      "storm",
      "ashen-warden",
      "drowned-choir",
      "gilded-husk",
      "rootbound-king",
      "hollow-sovereign",
    ]) {
      expect(HAND_SOCKETS[slug], `${slug} has no derived socket`).toBeDefined();
    }
  });

  it("puts every hand at hand height, never at the thigh", () => {
    // The measured range is 0.531 to 0.597. Anything materially outside it means
    // the rig changed shape or the wrong bone was read.
    for (const [slug, socket] of entries) {
      expect(socket.y, `${slug} socket is too low`).toBeGreaterThan(0.5);
      expect(socket.y, `${slug} socket is too high`).toBeLessThan(0.68);
    }
  });

  it("puts every hand out at the arm, not on the spine", () => {
    for (const [slug, socket] of entries) {
      expect(Math.abs(socket.x), `${slug} socket is too close to the centre`).toBeGreaterThan(0.3);
      expect(Math.abs(socket.x), `${slug} socket is outside the body`).toBeLessThan(0.55);
    }
  });

  it("keeps every hand near the body's own depth", () => {
    for (const [slug, socket] of entries) {
      expect(Math.abs(socket.z), `${slug} socket is far in front of the body`).toBeLessThan(0.3);
    }
  });

  it("records which hand closed, because it is not always the right one", () => {
    // The image model does not reliably honour "the right hand". Ember came back
    // holding with its left, and assuming otherwise puts its weapon in an open
    // hand.
    expect(HAND_SOCKETS.ember?.bone).toBe("LeftHand");
    for (const [, socket] of entries) {
      expect(["LeftHand", "RightHand"]).toContain(socket.bone);
    }
  });

  it("agrees on side between the bone it names and the offset it gives", () => {
    // A left hand sits on positive x on these rigs and a right hand on negative.
    // If those ever disagree the weapon is hanging off the wrong shoulder.
    for (const [slug, socket] of entries) {
      const expected = socket.bone === "LeftHand" ? 1 : -1;
      expect(Math.sign(socket.x), `${slug} bone and offset disagree`).toBe(expected);
    }
  });

  it("falls back to a plausible socket for an unknown character", () => {
    // A character generated after this table was last built should still hold
    // its weapon at roughly hand height rather than at its feet.
    expect(handSocketFor("not-a-character")).toEqual(DEFAULT_HAND_SOCKET);
    expect(DEFAULT_HAND_SOCKET.y).toBeGreaterThan(0.5);
  });
});
