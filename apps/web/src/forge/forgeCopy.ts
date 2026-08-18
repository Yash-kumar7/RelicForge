import type { ForgeStage } from "../state/useGameStore";

/**
 * Thematic stage copy.
 *
 * meshy-7 with ultra takes 90-115 seconds measured, and the sequence has to
 * hold that without feeling broken. "Loading 47%" makes latency feel like a
 * defect; naming the stages makes it feel like the forge is working.
 */
export const FORGE_STAGES: { min: number; label: string }[] = [
  { min: 0, label: "TEMPERING" },
  { min: 25, label: "SHAPING" },
  { min: 55, label: "BINDING" },
  { min: 82, label: "AWAKENING" },
];

export function forgeLabelFor(percent: number): string {
  let label = FORGE_STAGES[0]!.label;
  for (const stage of FORGE_STAGES) {
    if (percent >= stage.min) label = stage.label;
  }
  return label;
}

export const STAGE_HEADLINE: Record<ForgeStage, string> = {
  IDLE: "",
  ANALYZING: "YOUR VICTORY IS BEING REMEMBERED",
  DNA_READY: "YOUR VICTORY HAS A SHAPE",
  GENERATING_CONCEPT: "A SHAPE IS BEING IMAGINED",
  CONCEPT_READY: "A VISION EMERGES",
  FORGING_3D: "FORGING PHYSICAL FORM",
  MODEL_READY: "THE RELIC TAKES FORM",
  COMPLETE: "",
  FAILED: "THE FORGE RESISTS",
};
