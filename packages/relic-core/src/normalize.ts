import { CANONICAL_LENGTH } from "./config.js";
import type { OrientationHint, RelicTransform, WeaponClass } from "./types.js";

/**
 * Geometry canonicalization, the hard problem in RelicForge.
 *
 * Meshy returns a weapon; nothing promises it is upright, correctly scaled, or
 * that the game knows where the handle is. This module answers "what orientation
 * is this mesh?" and nothing else. How a correctly-oriented greatsword should
 * sit in a first-person hand is a separate question, answered by attachRelic().
 *
 * Operates on flat arrays rather than THREE.BufferGeometry so the exact same
 * code is unit-testable in Node against synthetic geometry and runnable in the
 * browser at equip time. One implementation, one test suite, two runtimes.
 */

export interface MeshSample {
  /** Flat xyz triples, already in world space. */
  positions: Float32Array;
  /** Triangle indices, or null for non-indexed geometry. */
  indices: Uint32Array | Uint16Array | null;
}

export type Vec3 = [number, number, number];

export interface EndResolution {
  /** Which end of the principal axis is the tip: 0 = low, 1 = high. */
  tipEnd: 0 | 1;
  /** Bin index of the guard peak, or null when no clear peak exists. */
  guardIndex: number | null;
  /**
   * How much to trust the above.
   *   > 0.8  accept automatically
   *   0.4-0.8 fall back to the weapon-class prior
   *   < 0.4  needs an OrientationHint
   */
  confidence: number;
}

/** Where the guard sits for each class, as a fraction from the pommel end. */
export const CLASS_GUARD_PRIOR: Record<WeaponClass, number> = {
  greatsword: 0.18,
  spear: 0.08,
  warhammer: 0.12,
};

const EPS = 1e-9;

/* ---------------------------------------------------------------- vector ops */

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function len(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}
function normalize(a: Vec3): Vec3 {
  const l = len(a);
  return l < EPS ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l];
}

function vertex(positions: Float32Array, i: number): Vec3 {
  return [positions[i * 3] ?? 0, positions[i * 3 + 1] ?? 0, positions[i * 3 + 2] ?? 0];
}

/** Triangle iteration that works for indexed and non-indexed geometry alike. */
function* triangles(sample: MeshSample): Generator<[Vec3, Vec3, Vec3]> {
  const { positions, indices } = sample;
  if (indices) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      yield [
        vertex(positions, indices[i] ?? 0),
        vertex(positions, indices[i + 1] ?? 0),
        vertex(positions, indices[i + 2] ?? 0),
      ];
    }
  } else {
    const count = Math.floor(positions.length / 9);
    for (let t = 0; t < count; t++) {
      yield [
        vertex(positions, t * 3),
        vertex(positions, t * 3 + 1),
        vertex(positions, t * 3 + 2),
      ];
    }
  }
}

/* ------------------------------------------------------------ principal axis */

/**
 * Area-weighted, triangle-centroid PCA.
 *
 * Not an AABB: a weapon tilted 35° inside its own local frame has no dominant
 * X/Y/Z extent, so largest-extent heuristics pick the wrong axis outright.
 *
 * Not vertex PCA: Meshy tessellates unevenly, and an ornate pommel carrying 3×
 * the vertices of the blade drags the principal axis off the weapon line.
 * Weighting each triangle centroid by triangle area is density-invariant.
 */
export function principalAxis(sample: MeshSample): Vec3 {
  let totalArea = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;

  const centroids: Vec3[] = [];
  const areas: number[] = [];

  for (const [a, b, c] of triangles(sample)) {
    const area = len(cross(sub(b, a), sub(c, a))) * 0.5;
    if (area < EPS) continue;
    const centroid: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    centroids.push(centroid);
    areas.push(area);
    totalArea += area;
    cx += centroid[0] * area;
    cy += centroid[1] * area;
    cz += centroid[2] * area;
  }

  if (totalArea < EPS || centroids.length === 0) return [0, 1, 0];

  const mean: Vec3 = [cx / totalArea, cy / totalArea, cz / totalArea];

  // Symmetric 3x3 covariance, area-weighted.
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let i = 0; i < centroids.length; i++) {
    const d = sub(centroids[i] as Vec3, mean);
    const w = areas[i] ?? 0;
    xx += w * d[0] * d[0];
    xy += w * d[0] * d[1];
    xz += w * d[0] * d[2];
    yy += w * d[1] * d[1];
    yz += w * d[1] * d[2];
    zz += w * d[2] * d[2];
  }

  // Dominant eigenvector by power iteration, cheap, and 32 steps is ample
  // convergence for a 3x3 with one clearly dominant axis.
  let v: Vec3 = [1, 1, 1];
  for (let iter = 0; iter < 32; iter++) {
    const next: Vec3 = [
      xx * v[0] + xy * v[1] + xz * v[2],
      xy * v[0] + yy * v[1] + yz * v[2],
      xz * v[0] + yz * v[1] + zz * v[2],
    ];
    const l = len(next);
    if (l < EPS) break;
    v = [next[0] / l, next[1] / l, next[2] / l];
  }
  return normalize(v);
}

/* ----------------------------------------------------------- radius profile */

export interface Profile {
  /** Mean radial distance from the axis, per bin, low → high along the axis. */
  radii: number[];
  /** Axis-space extent. */
  min: number;
  max: number;
}

export function radiusProfile(sample: MeshSample, axis: Vec3, bins = 64): Profile {
  const { positions } = sample;
  const count = Math.floor(positions.length / 3);
  if (count === 0) return { radii: new Array<number>(bins).fill(0), min: 0, max: 0 };

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < count; i++) {
    const t = dot(vertex(positions, i), axis);
    if (t < min) min = t;
    if (t > max) max = t;
  }
  const span = Math.max(max - min, EPS);

  const sums = new Array<number>(bins).fill(0);
  const counts = new Array<number>(bins).fill(0);

  for (let i = 0; i < count; i++) {
    const p = vertex(positions, i);
    const t = dot(p, axis);
    const along: Vec3 = [axis[0] * t, axis[1] * t, axis[2] * t];
    const radial = len(sub(p, along));
    const bin = Math.min(bins - 1, Math.floor(((t - min) / span) * bins));
    sums[bin] = (sums[bin] ?? 0) + radial;
    counts[bin] = (counts[bin] ?? 0) + 1;
  }

  const radii = sums.map((s, i) => {
    const c = counts[i] ?? 0;
    return c === 0 ? 0 : s / c;
  });
  return { radii, min, max };
}

/* -------------------------------------------------------------- end resolve */

/**
 * Decide which end is the tip, and how much to trust that decision.
 *
 * A blade tapers toward ~0 radius at the tip; the guard shows up as a sharp
 * local maximum near the opposite end. That is reliable for a spear, plausible
 * for an ornate sword, and outright ambiguous for a double-edged blade,
 * symmetric staff or twin-headed maul, so the answer carries a confidence
 * rather than pretending the heuristic always knows.
 */
export function resolveEnds(profile: Profile): EndResolution {
  const { radii } = profile;
  const n = radii.length;
  if (n < 8) return { tipEnd: 1, guardIndex: null, confidence: 0 };

  const edge = Math.max(2, Math.floor(n * 0.08));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const lowEnd = mean(radii.slice(0, edge));
  const highEnd = mean(radii.slice(n - edge));
  const overall = mean(radii) || EPS;

  // The thinner terminal end is the tip.
  const tipEnd: 0 | 1 = lowEnd <= highEnd ? 0 : 1;

  // Taper asymmetry: how differently the two ends terminate, relative to the
  // body. Symmetric weapons score ~0 here and correctly report low confidence.
  const asymmetry = Math.abs(highEnd - lowEnd) / overall;

  // Guard peak search, on the pommel half.
  const pommelHalf = tipEnd === 0 ? radii.slice(Math.floor(n / 2)) : radii.slice(0, Math.floor(n / 2));
  const offset = tipEnd === 0 ? Math.floor(n / 2) : 0;

  let peakValue = -Infinity;
  let peakLocal = -1;
  for (let i = 1; i < pommelHalf.length - 1; i++) {
    const v = pommelHalf[i] ?? 0;
    if (v > (pommelHalf[i - 1] ?? 0) && v > (pommelHalf[i + 1] ?? 0) && v > peakValue) {
      peakValue = v;
      peakLocal = i;
    }
  }

  const variance =
    mean(radii.map((r) => (r - overall) ** 2)) ** 0.5 || EPS;
  const peakSharpness = peakLocal === -1 ? 0 : Math.min(1, (peakValue - overall) / (variance * 2));

  const confidence = Math.max(0, Math.min(1, 0.65 * Math.min(1, asymmetry) + 0.35 * peakSharpness));

  return {
    tipEnd,
    guardIndex: peakLocal === -1 ? null : peakLocal + offset,
    confidence,
  };
}

/**
 * Grip position as a fraction along the axis measured from the pommel end.
 * Sits just inboard of the guard when one was found with enough confidence,
 * otherwise falls back to the weapon-class prior.
 */
export function inferGrip(
  profile: Profile,
  ends: EndResolution,
  weaponClass: WeaponClass,
): number {
  const prior = CLASS_GUARD_PRIOR[weaponClass];
  if (ends.confidence < 0.4 || ends.guardIndex === null) return prior;

  const n = profile.radii.length;
  const guardT = ends.guardIndex / (n - 1);
  // Express as distance from the pommel end regardless of which way the tip points.
  const fromPommel = ends.tipEnd === 1 ? guardT : 1 - guardT;
  const grip = Math.max(0.02, fromPommel - 0.06);

  // Mid-confidence blends toward the prior rather than trusting a weak peak.
  if (ends.confidence < 0.8) {
    const w = (ends.confidence - 0.4) / 0.4;
    return prior * (1 - w) + grip * w;
  }
  return grip;
}

/* --------------------------------------------------------------- normalize */

/** Quaternion rotating `from` onto `to`, both unit vectors. */
function quaternionFromTo(from: Vec3, to: Vec3): [number, number, number, number] {
  const d = dot(from, to);
  if (d > 1 - EPS) return [0, 0, 0, 1];
  if (d < -1 + EPS) {
    // Antiparallel: any perpendicular axis gives a 180° rotation.
    const axis = Math.abs(from[0]) < 0.9 ? cross(from, [1, 0, 0]) : cross(from, [0, 1, 0]);
    const n = normalize(axis);
    return [n[0], n[1], n[2], 0];
  }
  const axis = cross(from, to);
  const w = 1 + d;
  const l = Math.sqrt(axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2 + w * w);
  return [axis[0] / l, axis[1] / l, axis[2] / l, w / l];
}

export const CANONICAL_UP: Vec3 = [0, 1, 0];

/** Angle between the mesh's principal axis and canonical up, in degrees. */
export function measureRawAlignment(sample: MeshSample): { angleDeg: number; axis: Vec3 } {
  const axis = principalAxis(sample);
  const angleDeg = (Math.acos(Math.min(1, Math.abs(dot(axis, CANONICAL_UP)))) * 180) / Math.PI;
  return { angleDeg, axis };
}

/**
 * Full canonicalization: tip points +Y, grip sits at the origin, longest
 * dimension scaled to the class length. The result is serializable and stored
 * with the relic so re-equipping is stable across reloads.
 */
export function normalizeRelic(
  sample: MeshSample,
  weaponClass: WeaponClass,
  hint?: OrientationHint,
): RelicTransform {
  const measured = measureRawAlignment(sample);
  let axis = hint?.axisOverride ? normalize(hint.axisOverride as Vec3) : measured.axis;

  const profile = radiusProfile(sample, axis);
  const ends = resolveEnds(profile);

  let tipEnd = ends.tipEnd;
  if (hint?.flip) tipEnd = tipEnd === 1 ? 0 : 1;

  // Point the axis from pommel toward tip so aligning it to +Y stands the
  // weapon upright rather than upside down.
  if (tipEnd === 0) axis = [-axis[0], -axis[1], -axis[2]];

  const gripT = hint?.gripT ?? inferGrip(profile, ends, weaponClass);
  const quaternion = quaternionFromTo(axis, CANONICAL_UP);

  const extent = profile.max - profile.min;
  const scale = extent < EPS ? 1 : CANONICAL_LENGTH[weaponClass] / extent;

  // Grip offset along the canonical axis, measured from the pommel end, in
  // post-scale world units. Negated so attaching at the socket origin puts the
  // hand on the grip rather than at the mesh's arbitrary centre.
  const gripOffsetY = -(gripT * extent * scale);

  return {
    quaternion,
    scale,
    gripOffset: [0, gripOffsetY, 0],
    rawAngleDeg: measured.angleDeg,
    gripT,
    endConfidence: ends.confidence,
    usedHint: Boolean(hint && (hint.axisOverride || hint.flip || hint.gripT !== undefined)),
  };
}
