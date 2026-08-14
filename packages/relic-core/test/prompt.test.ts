import { describe, expect, it } from "vitest";
import { COMPOSITION_CONTRACT, compileRelicPrompt } from "../src/prompt.js";
import type { RelicDNA } from "../src/types.js";

const emberDNA: RelicDNA = {
  weaponClass: "greatsword",
  element: "fire",
  temperament: "brutal",
  condition: "shattered",
  bossInfluence: "Ashen Warden",
  achievement: "DEATH'S DOOR",
  rarity: "legendary",
};

const frostDNA: RelicDNA = {
  weaponClass: "spear",
  element: "ice",
  temperament: "elegant",
  condition: "pristine",
  bossInfluence: "Ashen Warden",
  rarity: "legendary",
};

describe("compileRelicPrompt", () => {
  it("always carries the full composition contract", () => {
    // Gate 0 measured a 0.1° median raw angle *because* every image is framed
    // this way. Losing a clause here silently reintroduces the orientation
    // problem the whole normalizer exists to avoid.
    for (const dna of [emberDNA, frostDNA]) {
      expect(compileRelicPrompt(dna)).toContain(COMPOSITION_CONTRACT);
    }
  });

  it.each([
    "tip pointing directly up",
    "pommel directly down",
    "perfectly vertical",
    "not diagonal",
    "Single isolated weapon",
    "Neutral flat background",
    "No character",
    // Without this the boss name gets rendered as a caption, and the lettering
    // becomes real geometry in the generated mesh.
    "No text, no lettering",
    "no watermark, no logo",
  ])("contract retains the %s clause", (clause) => {
    expect(COMPOSITION_CONTRACT).toContain(clause);
  });

  it("produces materially different prose for the two hero relics", () => {
    const a = compileRelicPrompt(emberDNA);
    const b = compileRelicPrompt(frostDNA);
    expect(a).not.toEqual(b);

    // Gate 1 depends on more than a colour swap: silhouette, material and
    // damage language must all diverge.
    expect(a).toMatch(/oversized brutal silhouette/);
    expect(b).toMatch(/narrow tapered silhouette/);
    expect(a).toMatch(/molten fractures/);
    expect(b).toMatch(/crystal/);
    expect(a).toMatch(/cracked and fracturing/);
    expect(b).toMatch(/flawless and ceremonial/);
  });

  it("names the boss so the relic reads as earned from that fight", () => {
    expect(compileRelicPrompt(emberDNA)).toContain("Ashen Warden");
  });

  it("is deterministic", () => {
    expect(compileRelicPrompt(emberDNA)).toEqual(compileRelicPrompt(emberDNA));
  });
});
