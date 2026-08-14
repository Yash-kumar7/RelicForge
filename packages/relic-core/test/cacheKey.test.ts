import { describe, expect, it } from "vitest";
import { relicCacheKey } from "../src/cacheKey.js";
import { DEV_GENERATION_CONFIG, HERO_GENERATION_CONFIG } from "../src/config.js";
import { composeRelicName } from "../src/naming.js";
import type { RelicDNA } from "../src/types.js";

const dna: RelicDNA = {
  weaponClass: "greatsword",
  element: "fire",
  temperament: "brutal",
  condition: "shattered",
  bossInfluence: "Ashen Warden",
  rarity: "legendary",
};

describe("relicCacheKey", () => {
  it("is stable for identical input", () => {
    expect(relicCacheKey(dna, HERO_GENERATION_CONFIG)).toBe(
      relicCacheKey(dna, HERO_GENERATION_CONFIG),
    );
  });

  it("ignores key order", () => {
    const reordered = {
      rarity: "legendary",
      bossInfluence: "Ashen Warden",
      condition: "shattered",
      temperament: "brutal",
      element: "fire",
      weaponClass: "greatsword",
    } as RelicDNA;
    expect(relicCacheKey(reordered, HERO_GENERATION_CONFIG)).toBe(
      relicCacheKey(dna, HERO_GENERATION_CONFIG),
    );
  });

  it("changes when the DNA changes", () => {
    expect(relicCacheKey({ ...dna, element: "ice" }, HERO_GENERATION_CONFIG)).not.toBe(
      relicCacheKey(dna, HERO_GENERATION_CONFIG),
    );
  });

  it("changes between dev and hero configs", () => {
    // Otherwise a cheap dev mesh would be served in place of a hero one.
    expect(relicCacheKey(dna, DEV_GENERATION_CONFIG)).not.toBe(
      relicCacheKey(dna, HERO_GENERATION_CONFIG),
    );
  });

  it("changes when the prompt version is bumped", () => {
    // The trap this exists to prevent: edit the prompt compiler, regenerate,
    // silently receive the previously cached sword.
    // Derived from the live version, never hardcoded, otherwise this test
    // silently passes forever and then breaks the day it matches reality.
    const bumped = {
      ...HERO_GENERATION_CONFIG,
      promptVersion: `${HERO_GENERATION_CONFIG.promptVersion}-next`,
    };
    expect(relicCacheKey(dna, bumped)).not.toBe(relicCacheKey(dna, HERO_GENERATION_CONFIG));
  });

  it.each(["ultraMode", "targetPolycount", "enablePbr", "imageModel", "shouldRemesh"] as const)(
    "changes when %s changes",
    (field) => {
      const mutated = {
        ...HERO_GENERATION_CONFIG,
        [field]:
          typeof HERO_GENERATION_CONFIG[field] === "boolean"
            ? !HERO_GENERATION_CONFIG[field]
            : typeof HERO_GENERATION_CONFIG[field] === "number"
              ? (HERO_GENERATION_CONFIG[field] as number) + 1
              : "different",
      };
      expect(relicCacheKey(dna, mutated)).not.toBe(relicCacheKey(dna, HERO_GENERATION_CONFIG));
    },
  );
});

describe("composeRelicName", () => {
  it("is deterministic for the same DNA", () => {
    expect(composeRelicName(dna)).toBe(composeRelicName(dna));
  });

  it("differs across elements", () => {
    expect(composeRelicName(dna)).not.toBe(composeRelicName({ ...dna, element: "ice" }));
  });

  it("never returns an empty or placeholder name", () => {
    for (const element of ["fire", "ice", "lightning"] as const) {
      for (const temperament of ["brutal", "balanced", "elegant"] as const) {
        const name = composeRelicName({ ...dna, element, temperament });
        expect(name.length).toBeGreaterThan(3);
        expect(name).not.toMatch(/undefined/);
      }
    }
  });
});

describe("what the key does and does not split on", () => {
  const base: RelicDNA = {
    weaponClass: "greatsword",
    element: "fire",
    temperament: "brutal",
    condition: "shattered",
    bossInfluence: "the Ashen Warden",
    rarity: "legendary",
  };

  it("ignores the achievement, which never reaches Meshy", () => {
    // The achievement is a label on the run, not an input to the image. When it
    // was part of the key, two players with identical prompts got two different
    // keys, so the second waited out a full generation for a mesh already on
    // disk. That alone multiplied the reachable key space about fivefold.
    const key = relicCacheKey(base, HERO_GENERATION_CONFIG);
    for (const achievement of ["DEATH'S DOOR", "UNBROKEN", "SWIFT JUDGMENT", "UNTOUCHABLE"]) {
      expect(relicCacheKey({ ...base, achievement }, HERO_GENERATION_CONFIG)).toBe(key);
    }
  });

  it("still splits on every field the prompt is built from", () => {
    const key = relicCacheKey(base, HERO_GENERATION_CONFIG);
    const variants: RelicDNA[] = [
      { ...base, element: "ice" },
      { ...base, temperament: "elegant", weaponClass: "spear" },
      { ...base, condition: "pristine" },
      { ...base, bossInfluence: "the Drowned Choir" },
    ];
    for (const dna of variants) {
      expect(relicCacheKey(dna, HERO_GENERATION_CONFIG)).not.toBe(key);
    }
  });
});
