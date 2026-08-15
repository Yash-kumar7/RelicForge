import { describe, expect, it } from "vitest";
import {
  measureRawAlignment,
  normalizeRelic,
  principalAxis,
  radiusProfile,
  resolveEnds,
  type MeshSample,
} from "../src/normalize.js";
import { CANONICAL_LENGTH } from "../src/config.js";

/**
 * Synthetic weapons. Building geometry by hand is the only way to test the
 * normalizer against a *known* correct answer, a real GLB can only ever be
 * eyeballed.
 */

interface BuildOptions {
  /** Length along the weapon axis. */
  length: number;
  /** Radius at the pommel end → tip end, sampled along the shaft. */
  profile: (t: number) => number;
  /** Rotation applied to the finished mesh, in degrees about Z. */
  tiltDeg?: number;
  segments?: number;
  sides?: number;
  /** Extra vertices clustered at the pommel, to simulate an ornate detail. */
  pommelDensity?: number;
}

function buildWeapon(opts: BuildOptions): MeshSample {
  const { length, profile, tiltDeg = 0, segments = 40, sides = 8, pommelDensity = 0 } = opts;
  const positions: number[] = [];
  const indices: number[] = [];

  const rad = (tiltDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const push = (x: number, y: number, z: number) => {
    // Rotate about Z so the "up" axis tilts into X, this is what defeats a
    // naive largest-extent heuristic.
    positions.push(x * cos - y * sin, x * sin + y * cos, z);
  };

  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    const y = t * length;
    const r = Math.max(profile(t), 1e-4);
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }

  for (let s = 0; s < segments; s++) {
    for (let i = 0; i < sides; i++) {
      const a = s * sides + i;
      const b = s * sides + ((i + 1) % sides);
      const c = (s + 1) * sides + i;
      const d = (s + 1) * sides + ((i + 1) % sides);
      indices.push(a, c, b, b, c, d);
    }
  }

  // Dense decorative pommel: many extra vertices, negligible surface area.
  for (let i = 0; i < pommelDensity; i++) {
    const a = (i / pommelDensity) * Math.PI * 2;
    push(Math.cos(a) * 0.05, 0.01, Math.sin(a) * 0.05);
  }

  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** Sword: fat guard near the pommel, tapering to a point at the tip. */
const swordProfile = (t: number) => {
  if (t < 0.08) return 0.04; // pommel
  if (t < 0.14) return 0.12; // guard flare
  return 0.06 * (1 - t) + 0.002; // blade taper to a point
};

const degreesBetween = (a: readonly number[], b: readonly number[]) =>
  (Math.acos(Math.min(1, Math.abs(a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!))) * 180) / Math.PI;

describe("principalAxis", () => {
  it("finds the axis of an upright weapon", () => {
    const axis = principalAxis(buildWeapon({ length: 2, profile: swordProfile }));
    expect(degreesBetween(axis, [0, 1, 0])).toBeLessThan(2);
  });

  it("finds the true axis of a weapon tilted 35° inside its own frame", () => {
    // An AABB heuristic fails outright here: no single X/Y/Z extent dominates.
    const axis = principalAxis(buildWeapon({ length: 2, profile: swordProfile, tiltDeg: 35 }));
    const expected = [Math.cos((125 * Math.PI) / 180), Math.sin((125 * Math.PI) / 180), 0];
    expect(degreesBetween(axis, expected)).toBeLessThan(3);
  });

  it("is not dragged off-axis by a vertex-dense pommel", () => {
    // The reason for area weighting: 2000 extra vertices with almost no surface
    // area would swing a plain vertex PCA toward the pommel.
    const axis = principalAxis(
      buildWeapon({ length: 2, profile: swordProfile, pommelDensity: 2000 }),
    );
    expect(degreesBetween(axis, [0, 1, 0])).toBeLessThan(3);
  });

  it("survives degenerate geometry without throwing", () => {
    expect(() => principalAxis({ positions: new Float32Array([]), indices: null })).not.toThrow();
  });
});

describe("resolveEnds", () => {
  it("identifies the tapering end as the tip, with confidence", () => {
    const sample = buildWeapon({ length: 2, profile: swordProfile });
    const ends = resolveEnds(radiusProfile(sample, principalAxis(sample)));
    expect(ends.tipEnd).toBe(1);
    expect(ends.confidence).toBeGreaterThan(0.4);
  });

  it("reports low confidence on a symmetric weapon rather than guessing", () => {
    // A twin-headed maul has no taper asymmetry to read. Reporting a confident
    // answer here would be worse than admitting the heuristic cannot tell.
    const symmetric = buildWeapon({
      length: 2,
      profile: (t) => (t < 0.15 || t > 0.85 ? 0.18 : 0.05),
    });
    const ends = resolveEnds(radiusProfile(symmetric, principalAxis(symmetric)));
    expect(ends.confidence).toBeLessThan(0.4);
  });
});

describe("normalizeRelic", () => {
  it("scales the longest dimension to the class canonical length", () => {
    const sample = buildWeapon({ length: 3.7, profile: swordProfile });
    const t = normalizeRelic(sample, "greatsword");
    expect(3.7 * t.scale).toBeCloseTo(CANONICAL_LENGTH.greatsword, 1);
  });

  it("reports the raw angle it had to correct", () => {
    const upright = normalizeRelic(buildWeapon({ length: 2, profile: swordProfile }), "greatsword");
    expect(upright.rawAngleDeg).toBeLessThan(2);

    const tilted = normalizeRelic(
      buildWeapon({ length: 2, profile: swordProfile, tiltDeg: 35 }),
      "greatsword",
    );
    expect(tilted.rawAngleDeg).toBeGreaterThan(30);
  });

  it("places the grip below the guard, not at the mesh centre", () => {
    const t = normalizeRelic(buildWeapon({ length: 2, profile: swordProfile }), "greatsword");
    expect(t.gripT).toBeGreaterThan(0);
    expect(t.gripT).toBeLessThan(0.4);
  });

  it("is deterministic, same mesh in, identical transform out", () => {
    const sample = buildWeapon({ length: 2, profile: swordProfile, tiltDeg: 20 });
    expect(normalizeRelic(sample, "greatsword")).toEqual(normalizeRelic(sample, "greatsword"));
  });

  it("round-trips through JSON without drift", () => {
    const t = normalizeRelic(buildWeapon({ length: 2, profile: swordProfile }), "greatsword");
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
  });

  it("honours an orientation hint and records that it did", () => {
    const sample = buildWeapon({ length: 2, profile: swordProfile });
    const auto = normalizeRelic(sample, "greatsword");
    const hinted = normalizeRelic(sample, "greatsword", { gripT: 0.33 });

    expect(hinted.usedHint).toBe(true);
    expect(auto.usedHint).toBe(false);
    expect(hinted.gripT).toBe(0.33);
  });

  it("flips the weapon when the hint says the heuristic got it backwards", () => {
    const sample = buildWeapon({ length: 2, profile: swordProfile });
    const auto = normalizeRelic(sample, "greatsword");
    const flipped = normalizeRelic(sample, "greatsword", { flip: true });
    expect(flipped.quaternion).not.toEqual(auto.quaternion);
  });

  it("completes well under the 100ms budget on a dense mesh", () => {
    const dense = buildWeapon({ length: 2, profile: swordProfile, segments: 400, sides: 32 });
    const started = performance.now();
    normalizeRelic(dense, "greatsword");
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe("measureRawAlignment", () => {
  it("reports ~0° for geometry that already arrives upright", () => {
    // This is the Gate 0 measurement, and the real meshy-7 corpus scores 0.1°.
    const { angleDeg } = measureRawAlignment(buildWeapon({ length: 2, profile: swordProfile }));
    expect(angleDeg).toBeLessThan(2);
  });
});

describe("grip offset lands the hand on the grip", () => {
  /**
   * Builds a blade of a given length whose centre sits at `centre` along Y, so
   * the mesh origin can be put anywhere relative to the weapon. That is the
   * whole point: a generated mesh arrives centred on whatever Meshy chose, and
   * the transform has to cope with an origin that is not the pommel.
   */
  function blade(length: number, centre: number): MeshSample {
    const positions: number[] = [];
    const indices: number[] = [];
    const segments = 40;
    for (let i = 0; i <= segments; i++) {
      const y = centre - length / 2 + (i / segments) * length;
      // Taper toward the top so end resolution has a tip to find.
      const r = 0.04 + 0.06 * (1 - i / segments);
      positions.push(-r, y, 0, r, y, 0);
    }
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
  }

  /** Where the grip ends up once the returned transform is applied. */
  function gripWorldY(sample: MeshSample, t: ReturnType<typeof normalizeRelic>): number {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 1; i < sample.positions.length; i += 3) {
      const y = sample.positions[i]!;
      if (y < min) min = y;
      if (y > max) max = y;
    }
    // The blade is already axis-aligned, so the quaternion is identity or a flip
    // and the grip's model-space height is a straight interpolation.
    const pommel = t.gripT === 0 ? min : min;
    const gripModelY = pommel + t.gripT * (max - min);
    return gripModelY * t.scale + t.gripOffset[1];
  }

  it("puts the grip at the socket origin when the mesh is centred on itself", () => {
    // This is the real case. Offsetting by gripT alone assumed the pommel sat
    // at the origin, which hung every relic about half its own length too low,
    // and is why relics appeared at the champion's leg.
    const sample = blade(2, 0);
    const transform = normalizeRelic(sample, "greatsword");
    expect(Math.abs(gripWorldY(sample, transform))).toBeLessThan(0.05);
  });

  it("puts the grip at the socket origin wherever the mesh origin happens to be", () => {
    for (const centre of [-3, -1, 0, 1, 4]) {
      const sample = blade(2, centre);
      const transform = normalizeRelic(sample, "greatsword");
      expect(Math.abs(gripWorldY(sample, transform))).toBeLessThan(0.05);
    }
  });

  it("keeps most of the blade above the hand, not below it", () => {
    // A weapon whose grip is correct but whose blade hangs downward is the same
    // failure wearing a different number.
    const sample = blade(2, 0);
    const t = normalizeRelic(sample, "greatsword");
    const top = 1 * t.scale + t.gripOffset[1];
    const bottom = -1 * t.scale + t.gripOffset[1];
    expect(top).toBeGreaterThan(0);
    expect(Math.abs(top)).toBeGreaterThan(Math.abs(bottom));
  });
});
