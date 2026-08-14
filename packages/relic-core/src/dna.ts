import type {
  Affinity,
  CombatTelemetry,
  Condition,
  Element,
  RelicDNA,
  Temperament,
  WeaponClass,
} from "./types.js";

/**
 * Telemetry → Relic DNA.
 *
 * Deterministic on purpose. The player must be able to feel the causal link
 * between how they fought and what they were given; randomness here would make
 * the whole mechanic read as a slot machine wearing a story.
 */

const ELEMENT_OF: Record<Affinity, Element> = {
  fire: "fire",
  ice: "ice",
  storm: "lightning",
};

/** Health remaining decides how beaten-up the relic looks. */
export function conditionFor(healthRemaining: number): Condition {
  if (healthRemaining <= 20) return "shattered";
  if (healthRemaining <= 70) return "battle-worn";
  return "pristine";
}

/** Playstyle decides silhouette: swinging heavy reads brutal, dodging reads elegant. */
export function temperamentFor(telemetry: CombatTelemetry): Temperament {
  const attacks = telemetry.lightAttacks + telemetry.heavyAttacks;
  const heavyRatio = attacks === 0 ? 0 : telemetry.heavyAttacks / attacks;

  if (heavyRatio >= 0.6) return "brutal";
  if (telemetry.dodges >= 4 && heavyRatio <= 0.35) return "elegant";
  return "balanced";
}

/**
 * Production emits greatsword and spear only.
 *
 * They carry the two hero outcomes (brutal → greatsword, elegant → spear) and
 * give Gate 1 the widest possible silhouette separation. Warhammer stays in the
 * type union and the normalizer's test corpus, and unlocks as P1 once its
 * end-resolution confidence stops falling back to the class prior.
 */
export function weaponClassFor(temperament: Temperament): WeaponClass {
  return temperament === "elegant" ? "spear" : "greatsword";
}

/** At most one achievement, most impressive first. */
export function achievementFor(telemetry: CombatTelemetry): string | undefined {
  if (telemetry.healthRemaining <= 10) return "DEATH'S DOOR";
  if (telemetry.healingUsed === 0 && telemetry.damageTaken > 0) return "UNBROKEN";
  if (telemetry.fightDuration < 45) return "SWIFT JUDGMENT";
  if (telemetry.dodges >= 8) return "UNTOUCHABLE";
  return undefined;
}

export function buildRelicDNA(telemetry: CombatTelemetry, boss: string): RelicDNA {
  const temperament = temperamentFor(telemetry);
  const achievement = achievementFor(telemetry);

  return {
    weaponClass: weaponClassFor(temperament),
    element: ELEMENT_OF[telemetry.affinity],
    temperament,
    condition: conditionFor(telemetry.healthRemaining),
    bossInfluence: boss,
    ...(achievement ? { achievement } : {}),
    rarity: "legendary",
  };
}
