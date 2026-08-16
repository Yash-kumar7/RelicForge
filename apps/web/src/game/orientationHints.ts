import type { OrientationHint } from "@relic/core";

/**
 * Hand-authored orientation overrides, for the meshes the heuristic cannot call.
 *
 * This is the documented human-in-the-loop tier, not a workaround. Tip
 * detection rests on one assumption, that the terminal bins of the radius
 * profile taper toward zero, and that assumption is genuinely ambiguous on a
 * double-edged blade, a symmetric haft or a hammer with mass at both ends.
 * resolveEnds says so rather than guessing confidently: it returns a confidence,
 * and below 0.4 the contract has always been that a hint is required.
 *
 * Measured confidence on the five boss weapons:
 *
 *   ashen-warden      greatsword  0.40
 *   drowned-choir     spear       0.36
 *   gilded-husk       spear       0.37
 *   hollow-sovereign  greatsword  0.48
 *   rootbound-king    warhammer   0.75
 *
 * Every one is under the 0.8 that would be accepted outright, so all five fall
 * back to their weapon-class prior, and on two of them the prior guessed the
 * wrong end and stood the weapon on its head.
 *
 * These live in code rather than beside the assets because storage/ is
 * gitignored: a hint written into weapon.json would be lost on any fresh clone,
 * and a boss holding an upside-down hammer is not a state worth being able to
 * reach again.
 *
 * A hint only overrides the field it sets. flip reverses which end was taken
 * for the tip and leaves the axis and grip exactly as measured.
 */
export const BOSS_WEAPON_HINTS: Record<string, OrientationHint> = {
  "ashen-warden": { flip: true },
  "rootbound-king": { flip: true },
};

export function bossWeaponHint(slug: string): OrientationHint | undefined {
  return BOSS_WEAPON_HINTS[slug];
}

/**
 * Relics whose ends the heuristic cannot separate, by id.
 *
 * A blade is told apart from its own grip by taper: the tip end is the thin one.
 * That works until a weapon is close to symmetric, and Skyfall's Creed is, with
 * a mean girth of 0.021 at one end against 0.028 at the other. Seven thousandths
 * of a unit is not a decision, it is a coin toss, and this one came up wrong: the
 * mesh arrives tip down and was normalized as though it were tip up.
 *
 * Keyed by id rather than by name, because a name is a display string and two
 * relics can share one.
 */
export const RELIC_HINTS: Record<string, OrientationHint> = {
  // Measured, not guessed: the thin end sits at the bottom of this mesh.
  "c47e069f-7441-4eb5-9eeb-e9b49bfb5177": { flip: true },
};

/**
 * The hint for a relic, found from the url it is loaded by.
 *
 * Resolved here rather than passed down from each caller, because a relic is
 * drawn in six places, and the boss weapons already taught this lesson: fixing
 * an orientation at one call site leaves it wrong at the others. Anything that
 * decides how an asset is oriented has to travel with the asset.
 */
export function relicHintForUrl(url: string): OrientationHint | undefined {
  const id = /\/relics\/([^/]+)\//.exec(url)?.[1];
  return id ? RELIC_HINTS[id] : undefined;
}
