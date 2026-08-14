import { z } from "zod";

/** Weapon classes the normalizer is validated against. */
export const WeaponClassSchema = z.enum(["greatsword", "spear", "warhammer"]);
export type WeaponClass = z.infer<typeof WeaponClassSchema>;

/**
 * Production DNA emits only these two. They map onto the two hero outcomes
 * (brutal → greatsword, elegant → spear) and give maximum visual separation
 * for Gate 1. Warhammer stays in the type union and the test corpus, and is
 * unlocked as P1 once normalization proves reliable on it.
 */
export const PRODUCTION_WEAPON_CLASSES = ["greatsword", "spear"] as const satisfies
  readonly WeaponClass[];

export const ElementSchema = z.enum(["fire", "ice", "lightning"]);
export type Element = z.infer<typeof ElementSchema>;

export const TemperamentSchema = z.enum(["brutal", "balanced", "elegant"]);
export type Temperament = z.infer<typeof TemperamentSchema>;

export const ConditionSchema = z.enum(["pristine", "battle-worn", "shattered"]);
export type Condition = z.infer<typeof ConditionSchema>;

export const AffinitySchema = z.enum(["fire", "ice", "storm"]);
export type Affinity = z.infer<typeof AffinitySchema>;

export const CombatTelemetrySchema = z.object({
  affinity: AffinitySchema,
  damageDealt: z.number().nonnegative(),
  damageTaken: z.number().nonnegative(),
  lightAttacks: z.number().int().nonnegative(),
  heavyAttacks: z.number().int().nonnegative(),
  finishingAttack: z.enum(["light", "heavy", "ability"]),
  healthRemaining: z.number().min(0).max(100),
  dodges: z.number().int().nonnegative(),
  healingUsed: z.number().int().nonnegative(),
  fightDuration: z.number().nonnegative(),
});
export type CombatTelemetry = z.infer<typeof CombatTelemetrySchema>;

export const RelicDNASchema = z.object({
  weaponClass: WeaponClassSchema,
  element: ElementSchema,
  temperament: TemperamentSchema,
  condition: ConditionSchema,
  bossInfluence: z.string().min(1),
  achievement: z.string().optional(),
  rarity: z.literal("legendary"),
});
export type RelicDNA = z.infer<typeof RelicDNASchema>;

/** Canonical-space correction, persisted so re-equip is stable across reloads. */
export const RelicTransformSchema = z.object({
  quaternion: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  scale: z.number().positive(),
  gripOffset: z.tuple([z.number(), z.number(), z.number()]),
  /** Diagnostics — drives /lab and the Gate 0B numbers. */
  rawAngleDeg: z.number(),
  gripT: z.number().min(0).max(1),
  endConfidence: z.number().min(0).max(1),
  usedHint: z.boolean(),
});
export type RelicTransform = z.infer<typeof RelicTransformSchema>;

/**
 * Human-in-the-loop override. Authored in /lab in seconds and stored on the
 * relic record. This is the acceptable escape hatch — opening Blender per
 * asset is not, because that would mean the runtime-generation story isn't real.
 */
export const OrientationHintSchema = z.object({
  axisOverride: z.tuple([z.number(), z.number(), z.number()]).optional(),
  flip: z.boolean().optional(),
  gripT: z.number().min(0).max(1).optional(),
});
export type OrientationHint = z.infer<typeof OrientationHintSchema>;

export const GenerationConfigSchema = z.object({
  promptVersion: z.string(),
  imageModel: z.string(),
  conceptCandidates: z.number().int().positive(),
  meshyModel: z.literal("meshy-7"),
  ultraMode: z.boolean(),
  targetPolycount: z.number().int().positive(),
  /**
   * Must be true for targetPolycount to have any effect — it defaults to false
   * on meshy-6/7, which silently yields million-triangle meshes.
   */
  shouldRemesh: z.boolean(),
  enablePbr: z.boolean(),
  targetFormats: z.array(z.string()).readonly(),
});
export type GenerationConfig = z.infer<typeof GenerationConfigSchema>;

export const RelicStatusSchema = z.enum([
  "DNA_READY",
  "GENERATING_CONCEPT",
  "CONCEPT_READY",
  "FORGING_3D",
  "MODEL_READY",
  "COMPLETE",
  "FAILED",
]);
export type RelicStatus = z.infer<typeof RelicStatusSchema>;
