import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { fitCharacter } from "../src/lib/characterFit";

/**
 * Character fitting is where the champion preview went wrong twice: once by
 * cropping, once by framing the feet. It is pure math over a bounding box, so
 * it can be pinned down properly instead of eyeballed in a browser.
 */

function boxCharacter(width: number, height: number, depth: number, offset = [0, 0, 0]) {
  const group = new Group();
  const mesh = new Mesh(new BoxGeometry(width, height, depth), new MeshBasicMaterial());
  mesh.position.set(offset[0]!, offset[1]!, offset[2]!);
  group.add(mesh);
  return group;
}

describe("fitCharacter", () => {
  it("scales any height to the requested height", () => {
    for (const source of [0.4, 1.9, 12]) {
      const fit = fitCharacter(boxCharacter(1, source, 1), 2.6);
      expect(source * fit.scale).toBeCloseTo(2.6, 5);
    }
  });

  it("puts the feet on the floor regardless of where the mesh sat", () => {
    // Meshy centres characters on the origin, so half the body is below y = 0
    // before correction. Standing them on the floor is the whole job.
    const fit = fitCharacter(boxCharacter(1, 2, 1), 2.6);
    // The box spans -1..1, so after scaling its lowest point is at -1.3, and
    // the offset must lift it exactly that far.
    expect(fit.offset[1]).toBeCloseTo(1.3, 5);
  });

  it("centres on x and z so a character does not stand off to one side", () => {
    const fit = fitCharacter(boxCharacter(1, 2, 1, [3, 0, -2]), 2.6);
    expect(fit.offset[0]).toBeCloseTo(-3 * fit.scale, 5);
    expect(fit.offset[2]).toBeCloseTo(2 * fit.scale, 5);
  });

  it("does not divide by zero on a flat or empty mesh", () => {
    // A degenerate mesh must not send the character to infinity.
    const flat = fitCharacter(boxCharacter(1, 0, 1), 2.6);
    expect(Number.isFinite(flat.scale)).toBe(true);
    expect(flat.scale).toBeGreaterThan(0);

    const empty = fitCharacter(new Group(), 2.6);
    expect(Number.isFinite(empty.scale)).toBe(true);
  });

  it("is deterministic", () => {
    const character = boxCharacter(1.2, 1.9, 0.5);
    expect(fitCharacter(character, 2.6)).toEqual(fitCharacter(character, 2.6));
  });

  it("keeps proportions, so a wide character is not squashed to fit", () => {
    // Uniform scale only: a non-uniform fit would distort a generated mesh.
    const fit = fitCharacter(boxCharacter(4, 2, 4), 2.0);
    expect(fit.scale).toBeCloseTo(1, 5);
  });
});
