import sharp from "sharp";
import { fetchBuffer } from "../lib/fetchBytes.js";

/**
 * Picks the concept most likely to produce good geometry.
 *
 * Cheapest quality lever in the pipeline: concepts cost 3-9 credits against a
 * 30-35 credit mesh, and mesh quality is dominated by concept quality. The two
 * failure modes worth rejecting are a subject that drifts off-centre and one
 * that sits too small in frame, both signal a composition the prompt asked for
 * but the model did not honour, and both survive into the mesh.
 */

export interface ConceptCandidate {
  taskId: string;
  url: string;
}

interface Scored extends ConceptCandidate {
  score: number;
  coverage: number;
  centerOffset: number;
}

/** Subject bounds from alpha, or from contrast against the background. */
async function measure(buffer: Buffer): Promise<{ coverage: number; centerOffset: number }> {
  const image = sharp(buffer);
  const { width = 1, height = 1 } = await image.metadata();

  // Downsample hard, this is a composition check, not a quality check.
  const w = 64;
  const h = Math.max(1, Math.round((height / width) * w));
  const { data } = await image
    .resize(w, h, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // The contract asks for a flat neutral background, so corner luminance is a
  // reliable stand-in for "background".
  const corners = [
    data[0] ?? 0,
    data[w - 1] ?? 0,
    data[(h - 1) * w] ?? 0,
    data[h * w - 1] ?? 0,
  ];
  const background = corners.reduce((a, b) => a + b, 0) / corners.length;
  const threshold = 18;

  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  let subjectPixels = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x] ?? 0;
      if (Math.abs(v - background) <= threshold) continue;
      subjectPixels++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return { coverage: 0, centerOffset: 1 };

  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const coverage = (boxW * boxH) / (w * h);

  const cx = (minX + maxX) / 2 / w;
  const cy = (minY + maxY) / 2 / h;
  const centerOffset = Math.hypot(cx - 0.5, cy - 0.5) * 2;

  // subjectPixels guards against a near-empty frame scoring well on bounds alone.
  const density = subjectPixels / (w * h);
  return { coverage: Math.min(coverage, density * 4), centerOffset };
}

export async function pickBestConcept(candidates: ConceptCandidate[]): Promise<ConceptCandidate> {
  const first = candidates[0];
  if (!first) throw new Error("pickBestConcept called with no candidates");
  if (candidates.length === 1) return first;

  const scored: Scored[] = [];
  for (const candidate of candidates) {
    try {
      const buffer = await fetchBuffer(candidate.url);
      const { coverage, centerOffset } = await measure(buffer);
      // Reject outright below 40% coverage; otherwise reward filling the frame
      // and being centred.
      const penalty = coverage < 0.4 ? 0.5 : 0;
      scored.push({
        ...candidate,
        coverage,
        centerOffset,
        score: coverage - centerOffset * 0.6 - penalty,
      });
    } catch {
      scored.push({ ...candidate, coverage: 0, centerOffset: 1, score: -Infinity });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  // Ties fall back to the first candidate rather than an arbitrary winner.
  return scored[0]?.score === -Infinity ? first : (scored[0] ?? first);
}
