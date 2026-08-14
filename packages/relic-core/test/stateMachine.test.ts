import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, isTerminal } from "../src/stateMachine.js";

describe("relic state machine", () => {
  it("walks the happy path", () => {
    const path = [
      "DNA_READY",
      "GENERATING_CONCEPT",
      "CONCEPT_READY",
      "FORGING_3D",
      "MODEL_READY",
      "COMPLETE",
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it("rejects skipping the concept stage", () => {
    // Skipping straight to the mesh would mean the forge shows a 3D reveal with
    // no concept art to pay off the wait.
    expect(canTransition("DNA_READY", "FORGING_3D")).toBe(false);
    expect(() => assertTransition("DNA_READY", "FORGING_3D")).toThrow(/Illegal relic transition/);
  });

  it("allows failing from any in-flight stage", () => {
    for (const s of ["DNA_READY", "GENERATING_CONCEPT", "CONCEPT_READY", "FORGING_3D", "MODEL_READY"] as const) {
      expect(canTransition(s, "FAILED")).toBe(true);
    }
  });

  it("lets a failed relic be retried from the concept stage", () => {
    expect(canTransition("FAILED", "GENERATING_CONCEPT")).toBe(true);
  });

  it("treats COMPLETE as final", () => {
    expect(isTerminal("COMPLETE")).toBe(true);
    expect(canTransition("COMPLETE", "FORGING_3D")).toBe(false);
  });
});
