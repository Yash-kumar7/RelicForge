import { describe, expect, it } from "vitest";

/**
 * The estimated hand socket, held against the rigged truth.
 *
 * The champions on the setup screen have no skeleton, so their weapon socket is
 * estimated from the fitted bounding box. The rigged versions of the same
 * characters do have a hand bone, and reading it gives the number the estimate
 * should have been. Without this the estimate drifts silently, which is how it
 * ended up at mid-thigh, in the wrong hand, with the fingers closing on the
 * blade above the guard.
 *
 * Measured from ember/rig/walking.glb fitted to a 1.8 unit champion:
 *   RightHand world position [-0.484, 1.029, 0.065]
 *   body extents             1.142 wide, 1.800 tall, 0.459 deep
 */
const MEASURED = {
  handX: -0.484,
  handY: 1.029,
  handZ: 0.065,
  width: 1.142,
  height: 1.8,
  depth: 0.459,
};

/** Must match apps/web/src/ui/HeldWeapon.tsx. */
const ESTIMATE = { x: 0.47, y: 0.572, z: 0.14 };

describe("estimated hand socket", () => {
  it("sits at the hand height the rig actually uses", () => {
    expect(Math.abs(ESTIMATE.y - MEASURED.handY / MEASURED.height)).toBeLessThan(0.02);
  });

  it("is nowhere near the leg", () => {
    // 0.46 of height reads as mid-thigh on a humanoid, and the grip hung about a
    // third of a world unit below the hand.
    expect(ESTIMATE.y).toBeGreaterThan(0.52);
  });

  it("puts the weapon at the hand's distance from the spine, whichever side that is", () => {
    /*
     * Magnitude only, deliberately.
     *
     * Meshy's rigging reorients the character, so the rigged GLB and the raw
     * model.glb do not share a facing and the rig's sign is not this mesh's
     * sign. Taking the measurement literally put the weapon in the left hand.
     * How far out the hand sits does carry over; which side it is on does not.
     */
    expect(Math.abs(Math.abs(ESTIMATE.x) - Math.abs(MEASURED.handX / MEASURED.width)))
      .toBeLessThan(0.06);
  });

  it("keeps the weapon at the body's own depth rather than out in front", () => {
    expect(Math.abs(ESTIMATE.z - MEASURED.handZ / MEASURED.depth)).toBeLessThan(0.03);
  });
});
