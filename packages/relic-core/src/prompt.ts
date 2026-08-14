import { PROMPT_VERSION } from "./config.js";
import type { Condition, Element, RelicDNA, Temperament, WeaponClass } from "./types.js";

/**
 * Relic DNA → concept-image prompt.
 *
 * Two jobs, and the second one is easy to miss: it must describe the weapon,
 * AND it must frame the shot. The composition contract below is the only lever
 * controlling the orientation of the mesh Meshy returns, the Gate 0
 * measurement (median raw angle 0.1°) holds only while every image is framed
 * this way. It is global and never varied per relic.
 */

const ELEMENT_MATERIAL: Record<Element, string> = {
  fire: "volcanic black steel with glowing molten fractures, scorched and smoldering",
  ice: "translucent pale-blue crystal, frost-rimed and refracting, glacial edges",
  lightning: "storm-etched conductive alloy, fractured with arcing filaments",
};

const TEMPERAMENT_SILHOUETTE: Record<Temperament, string> = {
  brutal: "oversized brutal silhouette, thick heavy blade, blunt aggressive mass",
  balanced: "well-proportioned disciplined silhouette, clean confident lines",
  elegant: "narrow tapered silhouette, sharp precise profile, minimal ornament",
};

const CONDITION_DAMAGE: Record<Condition, string> = {
  pristine: "flawless and ceremonial, unblemished surface, freshly forged",
  "battle-worn": "chipped and scarred, visibly used, worn grip binding",
  shattered: "cracked and fracturing, chunks broken from the edge, barely holding together",
};

const CLASS_NOUN: Record<WeaponClass, string> = {
  greatsword: "two-handed greatsword",
  spear: "long spear",
  warhammer: "heavy warhammer",
};

/**
 * Fixed framing clause. Changing anything here invalidates the Gate 0
 * measurement and must be re-verified, bump PROMPT_VERSION when it happens.
 */
export const COMPOSITION_CONTRACT = [
  "Designed as a functional fantasy game weapon.",
  "Single isolated weapon, full object visible.",
  // Repeated and front-loaded: the first Gate 1 pass produced a diagonal
  // greatsword despite a single mention of vertical framing.
  "The weapon must be perfectly vertical and axis-aligned, standing straight up,",
  "tip pointing directly up, pommel directly down, not tilted, not diagonal, not rotated.",
  "Three-quarter view, centered composition, full weapon inside frame.",
  "No character. No hands. No environment. Neutral flat background. No ground plane, no shadow.",
  // The boss name in the subject line was being read as a caption to draw:
  // the first pass rendered "ASHEN WARDEN" across the image, which then became
  // real geometry and texture in the mesh.
  "No text, no lettering, no words, no title, no caption, no watermark, no logo, no signature.",
  "Strong readable silhouette. Production-quality game concept art.",
].join(" ");

export function compileRelicPrompt(dna: RelicDNA): string {
  const subject = [
    `A legendary ${CLASS_NOUN[dna.weaponClass]}`,
    TEMPERAMENT_SILHOUETTE[dna.temperament],
    ELEMENT_MATERIAL[dna.element],
    CONDITION_DAMAGE[dna.condition],
    `forged from the remains of ${dna.bossInfluence}`,
  ].join(", ");

  return `${subject}. ${COMPOSITION_CONTRACT}`;
}

export { PROMPT_VERSION };
