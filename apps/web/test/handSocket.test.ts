import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_HAND_SOCKET, HAND_SOCKETS, handSocketFor } from "../src/game/handSockets";

/**
 * What is left of the socket table, and why most of it is gone.
 *
 * The setup screen used to estimate where a hand was, from the static mesh's
 * bounding box. That estimate was wrong four times: mid-thigh, wrong side, too
 * far forward, and finally a quarter of a unit below the fist. The last one was
 * not a tuning error. Meshy's rigging normalises the character into an A-pose
 * with the arms lowered, so the hand bone sits at about 0.57 of height while the
 * static mesh keeps the concept's raised, bent-elbow fist near 0.70. Any ratio
 * taken from the rig describes a pose the static mesh is not in.
 *
 * So the screen now renders the rigged mesh whenever a weapon is held and reads
 * the bone directly. All that survives here is which hand grips, which no
 * geometry can answer because nothing distinguishes a closed fist from an open
 * one.
 */
describe("hand sockets", () => {
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
      expect(HAND_SOCKETS[slug], `${slug} has no entry`).toBeDefined();
    }
  });

  it("records which hand closed, because no geometry can answer that", () => {
    for (const [, socket] of entries) {
      expect(["LeftHand", "RightHand"]).toContain(socket.bone);
    }
  });

  it("has every character gripping with the same hand", () => {
    // A consistency requirement, not a correctness one. The code handles either
    // side, but one champion gripping opposite everyone else reads as a bug.
    expect(new Set(entries.map(([, s]) => s.bone)).size).toBe(1);
  });

  it("falls back rather than returning nothing for an unknown character", () => {
    expect(handSocketFor("not-a-character")).toEqual(DEFAULT_HAND_SOCKET);
  });

  it("no longer positions anything from the estimated ratios", () => {
    /*
     * The x, y and z fields are still generated, because derive-sockets.ts
     * measures them and they are useful when diagnosing a rig. Nothing may
     * position a weapon from them again: that is what put the sword below the
     * fist, and the failure was invisible until someone looked at the screen.
     */
    const source = readFileSync(new URL("../src/ui/HeldWeapon.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("handSocketFor");
    expect(source).not.toContain("socket.height");
  });
});
